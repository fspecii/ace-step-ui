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
import re

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
        # _handler.initialize_service(
        #     project_root=ACESTEP_PATH,
        #     config_path=config_path,
        #     device=device,
        #     offload_to_cpu=True,  # For 12GB GPU
        #     vae_checkpoint=vae_val,
        # )
         # Dynamically inspect parameter signature to support older versions of initialize_service
        import inspect
        init_sig = inspect.signature(_handler.initialize_service)
        init_kwargs = {
            "project_root": ACESTEP_PATH,
            "config_path": config_path,
            "device": device,
            "offload_to_cpu": True,
        }
        if "vae_checkpoint" in init_sig.parameters:
            init_kwargs["vae_checkpoint"] = vae_val
            
        _handler.initialize_service(**init_kwargs)
        _llm_handler = LLMHandler()  # Create but don't initialize (not enough VRAM)
    return _handler, _llm_handler
def parse_lrc_to_subtitles(lrc_text: str, total_duration: float = None):
    if not lrc_text or not lrc_text.strip():
        return []
    timestamp_pattern = r'\[(\d{2}):(\d{2})\.(\d{2,3})\]'
    raw_entries = []
    for line in lrc_text.strip().split('\n'):
        line = line.strip()
        if not line:
            continue
        timestamps = re.findall(timestamp_pattern, line)
        if not timestamps:
            continue
        text = re.sub(timestamp_pattern, '', line).strip()
        if not text:
            continue
        start_minutes, start_seconds, start_cs = timestamps[0]
        cs = int(start_cs)
        start_time = (
            int(start_minutes) * 60 + int(start_seconds)
            + (cs / 100.0 if len(start_cs) == 2 else cs / 1000.0)
        )
        end_time = None
        if len(timestamps) >= 2:
            end_min, end_sec, end_cs_str = timestamps[1]
            cs_end = int(end_cs_str)
            end_time = (
                int(end_min) * 60 + int(end_sec)
                + (cs_end / 100.0 if len(end_cs_str) == 2 else cs_end / 1000.0)
            )
        raw_entries.append({'start': start_time, 'explicit_end': end_time, 'text': text})
    raw_entries.sort(key=lambda x: x['start'])
    if not raw_entries:
        return []
    # Merge lines closer than MIN_DISPLAY_DURATION seconds
    MIN_DISPLAY_DURATION = 2.0
    merged_entries = []
    i = 0
    while i < len(raw_entries):
        cur = raw_entries[i]
        combined_text = cur['text']
        combined_start = cur['start']
        combined_explicit_end = cur['explicit_end']
        next_idx = i + 1
        while next_idx < len(raw_entries):
            nxt = raw_entries[next_idx]
            if nxt['start'] - combined_start < MIN_DISPLAY_DURATION:
                combined_text += "\n" + nxt['text']
                if nxt['explicit_end']:
                    combined_explicit_end = nxt['explicit_end']
                next_idx += 1
            else:
                break
        merged_entries.append({
            'start': combined_start,
            'explicit_end': combined_explicit_end,
            'text': combined_text,
        })
        i = next_idx
    # Build final subtitles list
    subtitles = []
    for idx, entry in enumerate(merged_entries):
        start = entry['start']
        if entry['explicit_end'] is not None:
            end = entry['explicit_end']
        elif idx + 1 < len(merged_entries):
            end = merged_entries[idx + 1]['start']
        elif total_duration is not None and total_duration > start:
            end = total_duration
        else:
            end = start + 5.0
        if end <= start:
            end = start + 3.0
        subtitles.append({'text': entry['text'], 'timestamp': [start, end]})
    return subtitles
def format_vtt_timestamp(seconds: float) -> str:
    hours = int(seconds // 3600)
    minutes = int((seconds % 3600) // 60)
    secs = int(seconds % 60)
    millis = int((seconds % 1) * 1000)
    return f"{hours:02d}:{minutes:02d}:{secs:02d}.{millis:03d}"
def convert_lrc_to_vtt_text(lrc_text: str, total_duration: float = None) -> str:
    subtitles = parse_lrc_to_subtitles(lrc_text, total_duration=total_duration)
    if not subtitles:
        return ""
    vtt_lines = ["WEBVTT", ""]
    for i, sub in enumerate(subtitles):
        vtt_lines.append(str(i + 1))
        vtt_lines.append(
            f"{format_vtt_timestamp(sub['timestamp'][0])} --> {format_vtt_timestamp(sub['timestamp'][1])}"
        )
        vtt_lines.append(sub['text'])
        vtt_lines.append("")
    return "\n".join(vtt_lines)

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
    get_lrc: bool = False,
    get_scores: bool = False,
    score_scale: float = 0.5,

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
    # Build generation params — dynamically filter arguments to support older versions of GenerationParams
    import inspect
    gp_sig = inspect.signature(GenerationParams)
    gp_kwargs = {
        # # Basic
        # task_type=task_type,
        # caption=prompt,
        # lyrics=lyrics if lyrics and not instrumental else "",
        # instrumental=instrumental,
        # duration=float(duration) if duration > 0 else -1.0,
        # bpm=bpm if bpm > 0 else None,
        # keyscale=key_scale if key_scale else "",
        # timesignature=time_signature if time_signature else "",
        # vocal_language=vocal_language if vocal_language else "auto",
        "task_type": task_type,
        "caption": prompt,
        "lyrics": lyrics if lyrics and not instrumental else "",
        "instrumental": instrumental,
        "duration": float(duration) if duration > 0 else -1.0,
        "bpm": bpm if bpm > 0 else None,
        "keyscale": key_scale if key_scale else "",
        "timesignature": time_signature if time_signature else "",
        "vocal_language": vocal_language if vocal_language else "auto",


        # Generation
        # inference_steps=infer_steps,
        # guidance_scale=guidance_scale,
        # seed=seed if seed >= 0 else -1,
        # shift=shift,
        "inference_steps": infer_steps,
        "guidance_scale": guidance_scale,
        "seed": seed if seed >= 0 else -1,
        "shift": shift,

        # Task-specific
        # reference_audio=reference_audio if reference_audio else None,
        # src_audio=src_audio if src_audio else None,
        # audio_codes=audio_codes if audio_codes else "",
        # repainting_start=repainting_start,
        # repainting_end=repainting_end,
        # audio_cover_strength=audio_cover_strength,
        # instruction=instruction if instruction else "Fill the audio semantic mask based on the given conditions:",
        "reference_audio": reference_audio if reference_audio else None,
        "src_audio": src_audio if src_audio else None,
        "audio_codes": audio_codes if audio_codes else "",
        "repainting_start": repainting_start,
        "repainting_end": repainting_end,
        "audio_cover_strength": audio_cover_strength,
        "instruction": instruction if instruction else "Fill the audio semantic mask based on the given conditions:",

        # LM/CoT
        # thinking=thinking,
        # lm_temperature=lm_temperature,
        # lm_cfg_scale=lm_cfg_scale,
        # lm_top_k=lm_top_k,
        # lm_top_p=lm_top_p,
        # lm_negative_prompt=lm_negative_prompt if lm_negative_prompt else "NO USER INPUT",
        # use_cot_metas=use_cot_metas,
        # use_cot_caption=use_cot_caption,
        # use_cot_language=use_cot_language,
        "thinking": thinking,
        "lm_temperature": lm_temperature,
        "lm_cfg_scale": lm_cfg_scale,
        "lm_top_k": lm_top_k,
        "lm_top_p": lm_top_p,
        "lm_negative_prompt": lm_negative_prompt if lm_negative_prompt else "NO USER INPUT",
        "use_cot_metas": use_cot_metas,
        "use_cot_caption": use_cot_caption,
        "use_cot_language": use_cot_language,

        # Advanced
        # use_adg=use_adg,
        # cfg_interval_start=cfg_interval_start,
        # cfg_interval_end=cfg_interval_end,
        # dcw_enabled=dcw_enabled,
        # dcw_mode=dcw_mode,
        # dcw_scaler=dcw_scaler,
        # dcw_high_scaler=dcw_high_scaler,
        # dcw_wavelet=dcw_wavelet,
        "use_adg": use_adg,
        "cfg_interval_start": cfg_interval_start,
        "cfg_interval_end": cfg_interval_end,
        "dcw_enabled": dcw_enabled,
        "dcw_mode": dcw_mode,
        "dcw_scaler": dcw_scaler,
        "dcw_high_scaler": dcw_high_scaler,
        "dcw_wavelet": dcw_wavelet,
    # )
    }
    # Dynamic filtering: only pass parameters that exist in this version of GenerationParams
    gp_kwargs = {k: v for k, v in gp_kwargs.items() if k in gp_sig.parameters}
    params = GenerationParams(**gp_kwargs)
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
    scores = []
    if result.audios:
        # for audio in result.audios:
        for idx0, audio in enumerate(result.audios):
            if isinstance(audio, dict) and audio.get("path"):
                # audio_paths.append(audio["path"])
                audio_path = audio["path"]
                audio_paths.append(audio_path)
                
                if get_lrc:
                    try:
                        # Extract intermediate tensors from extra_outputs
                        extra_outputs = result.extra_outputs or {}
                        pred_latents = extra_outputs.get("pred_latents")
                        encoder_hidden_states = extra_outputs.get("encoder_hidden_states")
                        encoder_attention_mask = extra_outputs.get("encoder_attention_mask")
                        context_latents = extra_outputs.get("context_latents")
                        lyric_token_idss = extra_outputs.get("lyric_token_idss")
                        
                        if all(x is not None for x in [pred_latents, encoder_hidden_states, encoder_attention_mask, context_latents, lyric_token_idss]):
                            if idx0 < pred_latents.shape[0]:
                                audio_duration = pred_latents.shape[1] / 25.0
                                
                                lrc_res = handler.get_lyric_timestamp(
                                    pred_latent=pred_latents[idx0:idx0 + 1],
                                    encoder_hidden_states=encoder_hidden_states[idx0:idx0 + 1],
                                    encoder_attention_mask=encoder_attention_mask[idx0:idx0 + 1],
                                    context_latents=context_latents[idx0:idx0 + 1],
                                    lyric_token_ids=lyric_token_idss[idx0:idx0 + 1],
                                    total_duration_seconds=float(audio_duration),
                                    vocal_language=vocal_language or "en",
                                    inference_steps=int(infer_steps),
                                    seed=42,
                                )
                                
                                if lrc_res.get("success") and lrc_res.get("lrc_text"):
                                    lrc_text = lrc_res["lrc_text"]
                                     # Convert to WebVTT format using the exact Gradio post-processing algorithm
                                    vtt_text = convert_lrc_to_vtt_text(lrc_text, total_duration=float(audio_duration))
                                    vtt_path = os.path.splitext(audio_path)[0] + ".vtt"
                                    with open(vtt_path, "w", encoding="utf-8") as f_vtt:
                                        f_vtt.write(vtt_text)
                                    print(f"[simple_generate] Generated VTT file: {vtt_path}", file=sys.stderr)
                                else:
                                    print(f"[simple_generate] get_lyric_timestamp failed: {lrc_res.get('error', 'unknown error')}", file=sys.stderr)
                        else:
                            print("[simple_generate] Missing intermediate tensors in extra_outputs, cannot generate LRC", file=sys.stderr)
                    except Exception as lrc_err:
                        print(f"[simple_generate] Error generating LRC for sample {idx0}: {lrc_err}", file=sys.stderr)

                if get_scores:
                    score_text = calculate_python_fallback_score(
                        handler=handler,
                        llm_handler=llm_handler,
                        result=result,
                        sample_idx=idx0,
                        prompt=prompt,
                        lyrics=lyrics if lyrics and not instrumental else "",
                        bpm=bpm if bpm > 0 else None,
                        key_scale=key_scale,
                        time_signature=time_signature,
                        audio_duration=duration,
                        vocal_language=vocal_language or "en",
                        inference_steps=infer_steps,
                        score_scale=score_scale,
                    )
                    scores.append(score_text)

    return {
        "success": True,
        "audio_paths": audio_paths,
        "scores": scores,
        "elapsed_seconds": elapsed,
        "output_dir": output_dir,
    }

def calculate_python_fallback_score(
    handler,
    llm_handler,
    result,
    sample_idx: int,
    prompt: str,
    lyrics: str,
    bpm,
    key_scale: str,
    time_signature: str,
    audio_duration,
    vocal_language: str,
    inference_steps: int,
    score_scale: float,
):
    """Calculate the scorer payload available in Python fallback mode.

    The fallback path usually bypasses the LM audio-code stage, so PMI/global
    quality scoring is often unavailable. When intermediate tensors are present,
    ACE-Step can still calculate lyric alignment scores from cross-attention.
    """
    try:
        pmi_report = ""
        pmi_note = ""
        audio_codes_str = ""
        if result.audios and sample_idx < len(result.audios):
            audio_params = result.audios[sample_idx].get("params", {}) if isinstance(result.audios[sample_idx], dict) else {}
            audio_codes_str = str(audio_params.get("audio_codes", "") or "").strip()

        if audio_codes_str and getattr(llm_handler, "llm_initialized", False):
            try:
                from acestep.core.scoring.lm_score import calculate_pmi_score_per_condition

                metadata = {}
                if bpm is not None:
                    metadata["bpm"] = int(bpm)
                if prompt:
                    metadata["caption"] = prompt
                if audio_duration and float(audio_duration) > 0:
                    metadata["duration"] = int(float(audio_duration))
                if key_scale:
                    metadata["keyscale"] = key_scale
                if vocal_language:
                    metadata["language"] = vocal_language
                if time_signature:
                    metadata["timesignature"] = time_signature

                scores_per_condition, global_score, pmi_status = calculate_pmi_score_per_condition(
                    llm_handler=llm_handler,
                    audio_codes=audio_codes_str,
                    caption=prompt or "",
                    lyrics=lyrics or "",
                    metadata=metadata,
                    temperature=1.0,
                    topk=10,
                    score_scale=score_scale,
                )

                if scores_per_condition:
                    condition_lines = "\n".join(
                        f"{name}: {val:.4f}" for name, val in sorted(scores_per_condition.items())
                    )
                    pmi_report = (
                        f"Global Quality Score: {global_score:.4f}\n"
                        f"Per-condition scores:\n{condition_lines}\n\n"
                    )
                elif pmi_status:
                    pmi_note = f"Global PMI quality score was not available: {pmi_status}"
            except Exception as pmi_err:
                pmi_note = f"Global PMI quality score could not be calculated: {pmi_err}"
        elif audio_codes_str:
            pmi_note = "Global PMI quality score was not calculated because the LLM scorer was not initialized."
        else:
            pmi_note = "Global PMI quality score is unavailable because no LM audio codes were saved for this sample."

        if not lyrics or not lyrics.strip():
            return (pmi_report + (pmi_note if pmi_note else "No lyric scoring data available for instrumental or empty-lyric generation.")).strip()

        extra_outputs = result.extra_outputs or {}
        pred_latents = extra_outputs.get("pred_latents")
        encoder_hidden_states = extra_outputs.get("encoder_hidden_states")
        encoder_attention_mask = extra_outputs.get("encoder_attention_mask")
        context_latents = extra_outputs.get("context_latents")
        lyric_token_idss = extra_outputs.get("lyric_token_idss")

        required = [pred_latents, encoder_hidden_states, encoder_attention_mask, context_latents, lyric_token_idss]
        if not all(x is not None for x in required):
            return "Score requested, but intermediate alignment tensors were not returned by ACE-Step."
        if sample_idx >= pred_latents.shape[0]:
            return "Score requested, but this sample index was not found in ACE-Step tensors."

        align_result = handler.get_lyric_score(
            pred_latent=pred_latents[sample_idx:sample_idx + 1],
            encoder_hidden_states=encoder_hidden_states[sample_idx:sample_idx + 1],
            encoder_attention_mask=encoder_attention_mask[sample_idx:sample_idx + 1],
            context_latents=context_latents[sample_idx:sample_idx + 1],
            lyric_token_ids=lyric_token_idss[sample_idx:sample_idx + 1],
            vocal_language=vocal_language or "en",
            inference_steps=int(inference_steps),
            seed=42,
        )

        if not align_result.get("success"):
            return f"Alignment Score Failed: {align_result.get('error', 'Unknown error')}"

        lm_align = float(align_result.get("lm_score", 0.0))
        dit_align = float(align_result.get("dit_score", 0.0))
        return (
            pmi_report +
            "Lyric Alignment Scores\n"
            f"LM lyrics alignment score: {lm_align:.4f}\n"
            f"DiT lyrics alignment score: {dit_align:.4f}"
            + (f"\n\n{pmi_note}" if pmi_note else "")
        ).strip()
    except Exception as score_err:
        return f"Score calculation error: {score_err}"

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
    parser.add_argument("--get-lrc", action="store_true", help="Generate LRC timing files")
    parser.add_argument("--get-scores", action="store_true", help="Generate score payloads")
    parser.add_argument("--score-scale", type=float, default=0.5, help="Score sensitivity")
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
            get_lrc=args.get_lrc,
            get_scores=args.get_scores,
            score_scale=args.score_scale,
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
