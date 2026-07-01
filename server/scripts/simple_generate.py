#!/usr/bin/env python3
"""Simple music generation script that works like the Gradio interface.

This is a wrapper script that calls ACE-Step without modifying the original repo.
Supports all ACE-Step generation parameters.
"""
import argparse
import json
import os
import re
import sys
import time
import torch
from typing import Any, Dict, Optional

# Get ACE-Step path from environment or use default
ACESTEP_PATH = os.environ.get('ACESTEP_PATH', '/home/ambsd/Desktop/aceui/ACE-Step-1.5')

# Add ACE-Step to path
sys.path.insert(0, ACESTEP_PATH)

from acestep.handler import AceStepHandler
from acestep.llm_inference import LLMHandler
from acestep.inference import GenerationParams, GenerationConfig, generate_music
from acestep.gpu_config import get_gpu_config, get_recommended_lm_model, is_lm_model_supported

# Global handlers (initialized once)
_handler = None
_llm_handler = None
_llm_init_attempted = False

PROGRESS_PREFIX = "__ACE_STEP_PROGRESS__"


def _emit_progress_event(progress: float, stage: Optional[str] = None) -> None:
    try:
        value = max(0.0, min(1.0, float(progress)))
    except (TypeError, ValueError):
        return

    payload: Dict[str, Any] = {"progress": value}
    if stage:
        payload["stage"] = str(stage)

    print(
        f"{PROGRESS_PREFIX}{json.dumps(payload, ensure_ascii=True)}",
        file=sys.stderr,
        flush=True,
    )



def _env_bool(name: str, default: bool) -> bool:
    raw = os.environ.get(name)
    if raw is None:
        return default
    value = raw.strip().lower()
    if value in {"1", "true", "yes", "y", "on"}:
        return True
    if value in {"0", "false", "no", "n", "off"}:
        return False
    return default


def _should_initialize_llm() -> bool:
    gpu_config = get_gpu_config()
    init_llm = gpu_config.init_lm_default
    init_llm_env = os.environ.get("ACESTEP_INIT_LLM", "").strip().lower()

    if not init_llm_env or init_llm_env == "auto":
        return init_llm
    if init_llm_env in {"1", "true", "yes", "y", "on"}:
        return True
    return False


def _initialize_llm_if_configured(llm_handler: "LLMHandler", device: str) -> None:
    global _llm_init_attempted
    if _llm_init_attempted:
        return
    _llm_init_attempted = True

    gpu_config = get_gpu_config()
    if not _should_initialize_llm():
        print("[ACE-Step] LLM init skipped (GPU policy/env)", file=sys.stderr)
        return

    lm_model_path = os.environ.get("ACESTEP_LM_MODEL_PATH", "").strip()
    if not lm_model_path:
        lm_model_path = get_recommended_lm_model(gpu_config) or "acestep-5Hz-lm-0.6B"

    is_supported, warning_msg = is_lm_model_supported(lm_model_path, gpu_config)
    if not is_supported:
        recommended = get_recommended_lm_model(gpu_config)
        if recommended:
            print(f"[ACE-Step] {warning_msg} Falling back to {recommended}.", file=sys.stderr)
            lm_model_path = recommended
        else:
            print(f"[ACE-Step] {warning_msg} Continuing with {lm_model_path}.", file=sys.stderr)

    lm_backend = os.environ.get("ACESTEP_LM_BACKEND", "vllm").strip().lower()
    if lm_backend not in {"vllm", "pt", "mlx"}:
        lm_backend = "vllm"

    lm_device = os.environ.get("ACESTEP_LM_DEVICE", device).strip() or device
    lm_offload = _env_bool("ACESTEP_LM_OFFLOAD_TO_CPU", True)
    checkpoint_dir = os.path.join(ACESTEP_PATH, "checkpoints")

    status, ok = llm_handler.initialize(
        checkpoint_dir=checkpoint_dir,
        lm_model_path=lm_model_path,
        backend=lm_backend,
        device=lm_device,
        offload_to_cpu=lm_offload,
        dtype=None,
    )
    if ok:
        print(f"[ACE-Step] {status}", file=sys.stderr)
    else:
        print(f"[ACE-Step] LLM init failed, using non-LM fallback: {status}", file=sys.stderr)


def _extract_duration_hint_seconds(text: str) -> Optional[int]:
    if not text:
        return None
    text_l = text.lower()

    # mm:ss
    for match in re.finditer(r"\b(\d{1,2}):([0-5]\d)\b", text_l):
        seconds = int(match.group(1)) * 60 + int(match.group(2))
        if 10 <= seconds <= 600:
            return seconds

    # e.g. "2 min 30 sec", "3 minutes"
    for match in re.finditer(
        r"\b(\d{1,2})\s*(?:m|min|mins|minute|minutes)\b(?:\s*(\d{1,2})\s*(?:s|sec|secs|second|seconds)\b)?",
        text_l,
    ):
        minutes = int(match.group(1))
        extra_seconds = int(match.group(2)) if match.group(2) else 0
        seconds = minutes * 60 + extra_seconds
        if 10 <= seconds <= 600:
            return seconds

    # e.g. "90 sec"
    for match in re.finditer(r"\b(\d{2,3})\s*(?:s|sec|secs|second|seconds)\b", text_l):
        seconds = int(match.group(1))
        if 10 <= seconds <= 600:
            return seconds

    return None


def _estimate_duration_seconds(prompt: str, lyrics: str, instrumental: bool) -> int:
    hint = _extract_duration_hint_seconds(f"{prompt}\n{lyrics}")
    if hint is not None:
        return max(10, min(600, int(round(hint / 5.0) * 5)))

    prompt_l = (prompt or "").lower()
    lyrics_text = lyrics or ""
    lyric_words = len(re.findall(r"[A-Za-z0-9']+", lyrics_text))
    section_markers = len(
        re.findall(
            r"^\s*\[(?:verse|chorus|bridge|hook|pre-chorus|intro|outro|refrain)[^\]]*\]",
            lyrics_text,
            flags=re.IGNORECASE | re.MULTILINE,
        )
    )

    if lyric_words > 0:
        # Typical sung delivery ~2.2-2.5 words/sec + intro/outro + section transitions.
        estimated = (lyric_words / 2.35) + 18 + (section_markers * 4)
    else:
        estimated = 95.0 if instrumental else 75.0

    if any(k in prompt_l for k in ("jingle", "sting", "bumper", "snippet", "short intro", "short outro")):
        estimated -= 20
    if any(k in prompt_l for k in ("epic", "cinematic", "anthem", "extended", "progressive", "suite", "full length", "long build")):
        estimated += 30
    if "loop" in prompt_l and lyric_words == 0:
        estimated = min(estimated, 60.0)

    estimated_seconds = int(round(estimated / 5.0) * 5)
    return max(30, min(240, estimated_seconds))

def get_handlers():
    global _handler, _llm_handler
    if _handler is None:
        if torch.cuda.is_available():
            device = "cuda"
        elif torch.backends.mps.is_available():
            device = "mps"
        else:
            device = "cpu"
        _handler = AceStepHandler()
        _handler.initialize_service(
            project_root=ACESTEP_PATH,
            config_path="acestep-v15-turbo",
            device=device,
            offload_to_cpu=True,  # For 12GB GPU
        )
        _llm_handler = LLMHandler()
        _initialize_llm_if_configured(_llm_handler, device)
    return _handler, _llm_handler

def generate(
    # Basic parameters
    prompt: str,
    lyrics: str = "",
    instrumental: bool = False,
    duration: int = 0,
    bpm: int = 0,
    key_scale: str = "",
    time_signature: str = "",
    vocal_language: str = "auto",

    # Generation parameters
    infer_steps: int = 8,
    guidance_scale: float = 10.0,
    batch_size: int = 1,
    seed: int = -1,
    audio_format: str = "mp3",
    shift: float = 3.0,

    # Task type parameters
    task_type: str = "text2music",
    reference_audio: str = None,
    src_audio: str = None,
    audio_codes: str = "",
    repainting_start: float = 0,
    repainting_end: float = -1,
    audio_cover_strength: float = 1.0,
    instruction: str = "",

    # LM/CoT parameters
    thinking: bool = False,
    lm_temperature: float = 0.85,
    lm_cfg_scale: float = 2.0,
    lm_top_k: int = 0,
    lm_top_p: float = 0.9,
    lm_negative_prompt: str = "",
    use_cot_metas: bool = True,
    use_cot_caption: bool = True,
    use_cot_language: bool = True,

    # Advanced parameters
    use_adg: bool = False,
    cfg_interval_start: float = 0.0,
    cfg_interval_end: float = 1.0,

    # Output
    output_dir: str = None,
):
    """Generate music and return audio file paths."""
    _emit_progress_event(0.01, "Initializing ACE-Step...")
    handler, llm_handler = get_handlers()
    _emit_progress_event(0.10, "Models initialized")

    if output_dir is None:
        output_dir = os.path.join(ACESTEP_PATH, "output")
    os.makedirs(output_dir, exist_ok=True)

    input_lyrics = lyrics if lyrics and not instrumental else ""

    resolved_duration_seconds = float(duration) if duration > 0 else -1.0
    duration_source = "user" if duration > 0 else "auto"
    lm_initialized = bool(llm_handler and llm_handler.llm_initialized)

    if resolved_duration_seconds <= 0:
        has_audio_context = bool(reference_audio) or bool(src_audio)
        if has_audio_context:
            # Let core inference infer from source/reference audio duration.
            duration_source = "audio_inferred"
        elif lm_initialized:
            # Let LM CoT metas infer duration when available.
            duration_source = "lm_cot"
        else:
            # Deterministic local fallback when LM is unavailable.
            estimated = _estimate_duration_seconds(prompt, input_lyrics, instrumental)
            resolved_duration_seconds = float(estimated)
            duration_source = "heuristic"
            print(
                f"[ACE-Step] Auto duration fallback: using heuristic {estimated}s (LM unavailable)",
                file=sys.stderr,
            )

    # Build generation params
    params = GenerationParams(
        # Basic
        task_type=task_type,
        caption=prompt,
        lyrics=input_lyrics,
        instrumental=instrumental,
        duration=resolved_duration_seconds,
        bpm=bpm if bpm > 0 else None,
        keyscale=key_scale if key_scale else "",
        timesignature=time_signature if time_signature else "",
        vocal_language=vocal_language if vocal_language else "auto",

        # Generation
        inference_steps=infer_steps,
        guidance_scale=guidance_scale,
        seed=seed if seed >= 0 else -1,
        shift=shift,

        # Task-specific
        reference_audio=reference_audio if reference_audio else None,
        src_audio=src_audio if src_audio else None,
        audio_codes=audio_codes if audio_codes else "",
        repainting_start=repainting_start,
        repainting_end=repainting_end,
        audio_cover_strength=audio_cover_strength,
        instruction=instruction if instruction else "Fill the audio semantic mask based on the given conditions:",

        # LM/CoT
        thinking=thinking,
        lm_temperature=lm_temperature,
        lm_cfg_scale=lm_cfg_scale,
        lm_top_k=lm_top_k,
        lm_top_p=lm_top_p,
        lm_negative_prompt=lm_negative_prompt if lm_negative_prompt else "NO USER INPUT",
        use_cot_metas=use_cot_metas,
        use_cot_caption=use_cot_caption,
        use_cot_language=use_cot_language,

        # Advanced
        use_adg=use_adg,
        cfg_interval_start=cfg_interval_start,
        cfg_interval_end=cfg_interval_end,
    )

    # Build generation config
    config = GenerationConfig(
        batch_size=batch_size,
        audio_format=audio_format,
        use_random_seed=(seed < 0),
    )

    def _progress_callback(value: float, desc: Optional[str] = None, **_: Any) -> None:
        _emit_progress_event(value, desc)

    _emit_progress_event(0.12, "Starting generation...")
    start_time = time.time()
    result = generate_music(
        handler,
        llm_handler,
        params,
        config,
        save_dir=output_dir,
        progress=_progress_callback,
    )
    elapsed = time.time() - start_time

    # Prefer LM-generated duration after generation if user chose auto and CoT resolved it.
    if resolved_duration_seconds <= 0 and getattr(params, "cot_duration", None):
        try:
            cot_duration = float(params.cot_duration)
            if cot_duration > 0:
                resolved_duration_seconds = cot_duration
                duration_source = "lm_cot"
        except Exception:
            pass

    # Final fallback in case everything stayed auto and unresolved.
    if resolved_duration_seconds <= 0:
        resolved_duration_seconds = float(_estimate_duration_seconds(prompt, input_lyrics, instrumental))
        duration_source = "heuristic"

    # Extract audio paths from result
    audio_paths = []
    if result.audios:
        for audio in result.audios:
            if isinstance(audio, dict) and audio.get("path"):
                audio_paths.append(audio["path"])

    _emit_progress_event(1.0, "Generation complete")

    return {
        "success": True,
        "audio_paths": audio_paths,
        "elapsed_seconds": elapsed,
        "output_dir": output_dir,
        "resolved_duration_seconds": resolved_duration_seconds,
        "duration_source": duration_source,
        "lm_initialized": lm_initialized,
    }

def main():
    parser = argparse.ArgumentParser(description="Generate music with ACE-Step")

    # Basic parameters
    parser.add_argument("--prompt", type=str, required=True, help="Music description")
    parser.add_argument("--lyrics", type=str, default="", help="Lyrics (optional)")
    parser.add_argument("--instrumental", action="store_true", help="Generate instrumental music")
    parser.add_argument("--duration", type=int, default=0, help="Duration in seconds (0 for auto)")
    parser.add_argument("--bpm", type=int, default=0, help="BPM (0 for auto)")
    parser.add_argument("--key-scale", type=str, default="", help="Key scale (e.g., 'C Major')")
    parser.add_argument("--time-signature", type=str, default="", help="Time signature (2, 3, 4, or 6)")
    parser.add_argument("--vocal-language", type=str, default="auto", help="Vocal language code")

    # Generation parameters
    parser.add_argument("--infer-steps", type=int, default=8, help="Inference steps")
    parser.add_argument("--guidance-scale", type=float, default=10.0, help="Guidance scale")
    parser.add_argument("--batch-size", type=int, default=1, help="Batch size")
    parser.add_argument("--seed", type=int, default=-1, help="Random seed (-1 for random)")
    parser.add_argument("--audio-format", type=str, default="mp3", choices=["mp3", "flac", "wav"])
    parser.add_argument("--shift", type=float, default=3.0, help="Timestep shift factor")

    # Task type parameters
    parser.add_argument("--task-type", type=str, default="text2music",
                        choices=["text2music", "cover", "repaint", "lego", "extract", "complete"],
                        help="Generation task type")
    parser.add_argument("--reference-audio", type=str, default=None, help="Reference audio path for style transfer")
    parser.add_argument("--src-audio", type=str, default=None, help="Source audio path for audio-to-audio")
    parser.add_argument("--audio-codes", type=str, default="", help="Audio semantic codes")
    parser.add_argument("--repainting-start", type=float, default=0, help="Repainting start time (seconds)")
    parser.add_argument("--repainting-end", type=float, default=-1, help="Repainting end time (seconds)")
    parser.add_argument("--audio-cover-strength", type=float, default=1.0, help="Reference audio strength (0-1)")
    parser.add_argument("--instruction", type=str, default="", help="Task instruction prompt")

    # LM/CoT parameters
    parser.add_argument("--thinking", action="store_true", help="Enable Chain-of-Thought reasoning")
    parser.add_argument("--lm-temperature", type=float, default=0.85, help="LLM temperature")
    parser.add_argument("--lm-cfg-scale", type=float, default=2.0, help="LLM guidance scale")
    parser.add_argument("--lm-top-k", type=int, default=0, help="LLM top-k sampling")
    parser.add_argument("--lm-top-p", type=float, default=0.9, help="LLM top-p sampling")
    parser.add_argument("--lm-negative-prompt", type=str, default="", help="LLM negative prompt")
    parser.add_argument("--no-cot-metas", action="store_true", help="Disable CoT for metadata")
    parser.add_argument("--no-cot-caption", action="store_true", help="Disable CoT for caption")
    parser.add_argument("--no-cot-language", action="store_true", help="Disable CoT for language")

    # Advanced parameters
    parser.add_argument("--use-adg", action="store_true", help="Use Adaptive Dual Guidance")
    parser.add_argument("--cfg-interval-start", type=float, default=0.0, help="CFG interval start")
    parser.add_argument("--cfg-interval-end", type=float, default=1.0, help="CFG interval end")

    # Output
    parser.add_argument("--output-dir", type=str, default=None, help="Output directory")
    parser.add_argument("--json", action="store_true", help="Output as JSON")

    args = parser.parse_args()

    try:
        result = generate(
            # Basic
            prompt=args.prompt,
            lyrics=args.lyrics,
            instrumental=args.instrumental,
            duration=args.duration,
            bpm=args.bpm,
            key_scale=args.key_scale,
            time_signature=args.time_signature,
            vocal_language=args.vocal_language,

            # Generation
            infer_steps=args.infer_steps,
            guidance_scale=args.guidance_scale,
            batch_size=args.batch_size,
            seed=args.seed,
            audio_format=args.audio_format,
            shift=args.shift,

            # Task type
            task_type=args.task_type,
            reference_audio=args.reference_audio,
            src_audio=args.src_audio,
            audio_codes=args.audio_codes,
            repainting_start=args.repainting_start,
            repainting_end=args.repainting_end,
            audio_cover_strength=args.audio_cover_strength,
            instruction=args.instruction,

            # LM/CoT
            thinking=args.thinking,
            lm_temperature=args.lm_temperature,
            lm_cfg_scale=args.lm_cfg_scale,
            lm_top_k=args.lm_top_k,
            lm_top_p=args.lm_top_p,
            lm_negative_prompt=args.lm_negative_prompt,
            use_cot_metas=not args.no_cot_metas,
            use_cot_caption=not args.no_cot_caption,
            use_cot_language=not args.no_cot_language,

            # Advanced
            use_adg=args.use_adg,
            cfg_interval_start=args.cfg_interval_start,
            cfg_interval_end=args.cfg_interval_end,

            # Output
            output_dir=args.output_dir,
        )

        if args.json:
            print(json.dumps(result))
        else:
            print(f"Generated {len(result['audio_paths'])} audio files in {result['elapsed_seconds']:.1f}s:")
            for path in result['audio_paths']:
                print(f"  {path}")
    except Exception as e:
        if args.json:
            print(json.dumps({"success": False, "error": str(e)}))
        else:
            print(f"Error: {e}", file=sys.stderr)
        sys.exit(1)

if __name__ == "__main__":
    main()
