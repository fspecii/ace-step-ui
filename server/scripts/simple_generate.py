#!/usr/bin/env python3
"""Simple music generation script that works like the Gradio interface.

This is a wrapper script that calls ACE-Step without modifying the original repo.
Supports all ACE-Step generation parameters.
"""
import argparse
import json
import os
import sys
import time
import torch

# Get ACE-Step path from environment or use default
ACESTEP_PATH = os.environ.get('ACESTEP_PATH', '/home/ambsd/Desktop/aceui/ACE-Step-1.5')

# Add ACE-Step to path
sys.path.insert(0, ACESTEP_PATH)

from acestep.handler import AceStepHandler
from acestep.llm_inference import LLMHandler
from acestep.inference import GenerationParams, GenerationConfig, generate_music

# Global handlers (initialized once)
_handler = None
_llm_handler = None
_current_model = None

def get_handlers():
    global _handler, _llm_handler, _current_model
    
    # Default model if not specified
    if not model:
        model = "acestep-v15-turbo"
    
    # Reinitialize if model changed
    if _handler is None or _current_model != model:
        if torch.cuda.is_available():
            device = "cuda"
        elif torch.backends.mps.is_available():
            device = "mps"
        else:
            device = "cpu"
        _handler = AceStepHandler()
        _handler.initialize_service(
            use_flash_attention=True,
            project_root=ACESTEP_PATH,
            config_path=model,
            device=device,
            offload_to_cpu=True,
        )
        _llm_handler = LLMHandler()  # Create but don't initialize (not enough VRAM)
        _current_model = model
    
    return _handler, _llm_handler

def generate(
    # Basic parameters
    prompt: str,
    lyrics: str = "",
    instrumental: bool = False,
    duration: int = 60,
    bpm: int = 0,
    key_scale: str = "",
    time_signature: str = "",
    vocal_language: str = "auto",

    # Model selection
    model: str = None,

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
    handler, llm_handler = get_handlers(model)

    if output_dir is None:
        output_dir = os.path.join(ACESTEP_PATH, "output")
    os.makedirs(output_dir, exist_ok=True)

    # Build generation params
    params = GenerationParams(
        # Basic
        task_type=task_type,
        caption=prompt,
        lyrics=lyrics if lyrics and not instrumental else "",
        instrumental=instrumental,
        duration=float(duration) if duration > 0 else -1.0,
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

    start_time = time.time()
    result = generate_music(handler, llm_handler, params, config, save_dir=output_dir)
    elapsed = time.time() - start_time

    # Extract audio paths from result
    audio_paths = []
    if result.audios:
        for audio in result.audios:
            if isinstance(audio, dict) and audio.get("path"):
                audio_paths.append(audio["path"])

    return {
        "success": True,
        "audio_paths": audio_paths,
        "elapsed_seconds": elapsed,
        "output_dir": output_dir,
    }

def main():
    parser = argparse.ArgumentParser(description="Generate music with ACE-Step")

    # Basic parameters
    parser.add_argument("--prompt", type=str, required=True, help="Music description")
    parser.add_argument("--lyrics", type=str, default="", help="Lyrics (optional)")
    parser.add_argument("--instrumental", action="store_true", help="Generate instrumental music")
    parser.add_argument("--duration", type=int, default=60, help="Duration in seconds (0 for auto)")
    parser.add_argument("--bpm", type=int, default=0, help="BPM (0 for auto)")
    parser.add_argument("--key-scale", type=str, default="", help="Key scale (e.g., 'C Major')")
    parser.add_argument("--time-signature", type=str, default="", help="Time signature (2, 3, 4, or 6)")
    parser.add_argument("--vocal-language", type=str, default="auto", help="Vocal language code")

    # Model selection
    parser.add_argument("--model", type=str, default=None, help="DiT model to use (e.g., 'acestep-v15-turbo', 'acestep-v15-turbo-shift3')")

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

            # Model
            model=args.model,

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
