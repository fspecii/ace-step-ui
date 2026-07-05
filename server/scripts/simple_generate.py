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

# Load .env file from ACE-Step path if it exists to populate os.environ
env_path = os.path.join(ACESTEP_PATH, '.env')
if not os.path.exists(env_path):
    env_path = os.path.join(ACESTEP_PATH, 'env')

# Diagnostic logging for visibility in Node.js
print(f"[simple_generate] ACESTEP_PATH: '{ACESTEP_PATH}'", file=sys.stderr)
print(f"[simple_generate] Checked env_path: '{env_path}' (exists: {os.path.exists(env_path)})", file=sys.stderr)

if os.path.exists(env_path):
    try:
        with open(env_path, 'r', encoding='utf-8') as f:
            for line in f:
                line = line.strip()
                if line and not line.startswith('#') and '=' in line:
                    key, val = line.split('=', 1)
                    key = key.strip()
                    val = val.strip().strip('"').strip("'")
                    if key not in os.environ:
                        os.environ[key] = val
        print(f"[simple_generate] Successfully loaded environment from {env_path}", file=sys.stderr)
    except Exception as env_err:
        print(f"Warning: failed to load config from {env_path}: {env_err}", file=sys.stderr)

# Add ACE-Step to path
sys.path.insert(0, ACESTEP_PATH)

from acestep.handler import AceStepHandler
from acestep.llm_inference import LLMHandler
from acestep.inference import GenerationParams, GenerationConfig, generate_music

# Global handlers (initialized once)
_handler = None
_llm_handler = None

def get_handlers(dit_model=None, vae_checkpoint=None):
    global _handler, _llm_handler
    if _handler is None:
        # Respect device setting from environment/.env if defined
        env_device = os.environ.get('ACESTEP_DEVICE', 'auto').lower()
        if env_device in ['cuda', 'cpu', 'mps', 'xpu']:
            device = env_device
        else:
            if torch.cuda.is_available():
                device = "cuda"
            elif torch.backends.mps.is_available():
                device = "mps"
            else:
                device = "cpu"
        
        # Use frontend selected model, fallback to ACESTEP_CONFIG_PATH from .env, or default to "acestep-v15-turbo"
        default_config = os.environ.get('ACESTEP_CONFIG_PATH', 'acestep-v15-turbo')
        config_path = dit_model if (dit_model and dit_model.strip()) else default_config
        
        # Use provided VAE, fallback to env var, or default to "official"
        vae_val = vae_checkpoint if (vae_checkpoint and vae_checkpoint.strip()) else os.environ.get('ACESTEP_VAE_CHECKPOINT', 'official')
        
        print(f"[simple_generate] Active configuration settings:", file=sys.stderr)
        print(f"  - Device: {device}", file=sys.stderr)
        print(f"  - DiT Model Config: {config_path}", file=sys.stderr)
        print(f"  - VAE Model Override: {vae_val}", file=sys.stderr)
        print(f"  - Torch Compile: {os.environ.get('ACESTEP_TORCH_COMPILE', 'default')}", file=sys.stderr)
        
        _handler = AceStepHandler()
        _handler.initialize_service(
            project_root=ACESTEP_PATH,
            config_path=config_path,
            device=device,
            offload_to_cpu=True,  # For 12GB GPU
            vae_checkpoint=vae_val,
        )
        _llm_handler = LLMHandler()  # Create but don't initialize (not enough VRAM)
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
    lm_model: str = "",
    lm_backend: str = "pt",

    # Advanced parameters
    use_adg: bool = False,
    cfg_interval_start: float = 0.0,
    cfg_interval_end: float = 1.0,
    dcw_enabled: bool = True,
    dcw_mode: str = "double",
    dcw_scaler: float = None,
    dcw_high_scaler: float = None,
    dcw_wavelet: str = "haar",

    # Output
    output_dir: str = None,

    # Model selection
    dit_model: str = "",
    vae_checkpoint: str = "official",
):
    """Generate music and return audio file paths."""
    handler, llm_handler = get_handlers(dit_model=dit_model, vae_checkpoint=vae_checkpoint)

    # Initialize LLM handler if thinking is requested and it has not been initialized
    need_llm = (
        thinking
        or use_cot_metas
        or use_cot_caption
        or use_cot_language
    )

    if need_llm and not llm_handler.llm_initialized:
        checkpoint_dir = os.path.join(ACESTEP_PATH, "checkpoints")
        
        # Determine backend
        backend = lm_backend or "pt"
        if backend == "auto":
            backend = "pt"
            
        # Resolve device
        if torch.cuda.is_available():
            device = "cuda"
        elif torch.backends.mps.is_available():
            device = "mps"
        else:
            device = "cpu"

        # Determine model path
        lm_model_path = lm_model if (lm_model and lm_model.strip()) else None
        if not lm_model_path:
            # Auto-detect existing model on disk
            if os.path.exists(os.path.join(checkpoint_dir, "acestep-5Hz-lm-4B")):
                lm_model_path = "acestep-5Hz-lm-4B"
            elif os.path.exists(os.path.join(checkpoint_dir, "acestep-5Hz-lm-1.7B")):
                lm_model_path = "acestep-5Hz-lm-1.7B"
            elif os.path.exists(os.path.join(checkpoint_dir, "acestep-5Hz-lm-0.6B")):
                lm_model_path = "acestep-5Hz-lm-0.6B"
            else:
                lm_model_path = "acestep-5Hz-lm-0.6B"  # Default fallback

        # Check if model exists, if not auto-download
        model_dir = os.path.join(checkpoint_dir, lm_model_path)
        if not os.path.exists(model_dir) or not os.listdir(model_dir):
            print(f"[simple_generate] LLM Model {lm_model_path} not found, downloading...", file=sys.stderr)
            try:
                from acestep.model_downloader import download_submodel
                from pathlib import Path
                success, msg = download_submodel(lm_model_path, Path(checkpoint_dir))
                if not success:
                    print(f"Warning: failed to download submodel {lm_model_path}: {msg}", file=sys.stderr)
            except Exception as download_err:
                print(f"Warning: could not download LLM model: {download_err}", file=sys.stderr)

        print(f"[simple_generate] Initializing LLMHandler with model '{lm_model_path}' on device '{device}'...", file=sys.stderr)
        status, success = llm_handler.initialize(
            checkpoint_dir=checkpoint_dir,
            lm_model_path=lm_model_path,
            backend=backend,
            device=device,
            offload_to_cpu=True,
        )
        if not success:
            raise RuntimeError(f"Failed to initialize LLM: {status}")

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
        dcw_enabled=dcw_enabled,
        dcw_mode=dcw_mode,
        dcw_scaler=dcw_scaler,
        dcw_high_scaler=dcw_high_scaler,
        dcw_wavelet=dcw_wavelet,
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
    parser.add_argument("--lm-model", type=str, default="", help="LLM model path or name")
    parser.add_argument("--lm-backend", type=str, default="pt", choices=["pt", "vllm", "mlx", "auto"], help="LLM backend")
    parser.add_argument("--dit-model", type=str, default="", help="DiT model path or name")
    parser.add_argument("--vae-checkpoint", type=str, default="official", help="VAE checkpoint path or name")

    # Advanced parameters
    parser.add_argument("--use-adg", action="store_true", help="Use Adaptive Dual Guidance")
    parser.add_argument("--cfg-interval-start", type=float, default=0.0, help="CFG interval start")
    parser.add_argument("--cfg-interval-end", type=float, default=1.0, help="CFG interval end")
    parser.add_argument("--no-dcw", action="store_true", help="Disable Dual Conditioning Wavelet")
    parser.add_argument("--dcw-mode", type=str, default="double", choices=["double", "single", "none"], help="DCW conditioning mode")
    parser.add_argument("--dcw-scaler", type=float, default=None, help="DCW scaler")
    parser.add_argument("--dcw-high-scaler", type=float, default=None, help="DCW high scaler")
    parser.add_argument("--dcw-wavelet", type=str, default="haar", help="DCW wavelet base")

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
            lm_model=args.lm_model,
            lm_backend=args.lm_backend,

            # Advanced
            use_adg=args.use_adg,
            cfg_interval_start=args.cfg_interval_start,
            cfg_interval_end=args.cfg_interval_end,
            dcw_enabled=not args.no_dcw,
            dcw_mode=args.dcw_mode,
            dcw_scaler=args.dcw_scaler,
            dcw_high_scaler=args.dcw_high_scaler,
            dcw_wavelet=args.dcw_wavelet,

            # Output
            output_dir=args.output_dir,

            # Model selection
            dit_model=args.dit_model,
            vae_checkpoint=args.vae_checkpoint,
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
