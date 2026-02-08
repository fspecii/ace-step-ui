#!/usr/bin/env python3
"""Format lyrics and style using the 5Hz LLM.

This script uses ACE-Step's format_sample to enhance user input with AI-generated
music metadata (BPM, duration, key, time signature, enhanced description).
"""
import argparse
import json
import os
import sys
import time
import torch

# Get ACE-Step path from environment or use default
ACESTEP_PATH = os.environ.get('ACESTEP_PATH', '/home/ambsd/Desktop/aceui/ACE-Step-1.5')
sys.path.insert(0, ACESTEP_PATH)

from acestep.llm_inference import LLMHandler
from acestep.inference import format_sample
from pathlib import Path
from acestep.model_downloader import download_submodel

# Global handler
_llm_handler = None

def get_llm_handler(lm_model=None, lm_backend=None):
    global _llm_handler
    if _llm_handler is None:
        _llm_handler = LLMHandler()
        checkpoint_dir = os.path.join(ACESTEP_PATH, "checkpoints")
        lm_model_path = lm_model or "acestep-5Hz-lm-0.6B"  # Default to smallest model
        backend = lm_backend or "pt"

        # Auto-download model if not present
        model_dir = os.path.join(checkpoint_dir, lm_model_path)
        if not os.path.exists(model_dir) or not os.listdir(model_dir):
            print(f"[format_sample] Model {lm_model_path} not found, downloading...")
            success, msg = download_submodel(lm_model_path, Path(checkpoint_dir))
            if not success:
                raise RuntimeError(f"Failed to download model {lm_model_path}: {msg}")
            print(f"[format_sample] Download complete: {msg}")
        if torch.cuda.is_available():
            device = "cuda"
        elif torch.backends.mps.is_available():
            device = "mps"
        else:
            device = "cpu"

        status, success = _llm_handler.initialize(
            checkpoint_dir=checkpoint_dir,
            lm_model_path=lm_model_path,
            backend=backend,
            device=device,
            offload_to_cpu=True,
        )

        if not success:
            raise RuntimeError(f"Failed to initialize LLM: {status}")

    return _llm_handler

def format_input(
    caption: str,
    lyrics: str = "",
    bpm: int = 0,
    duration: int = 0,
    key_scale: str = "",
    time_signature: str = "",
    temperature: float = 0.85,
    top_k: int = 0,
    top_p: float = 0.9,
    lm_model: str = None,
    lm_backend: str = None,
):
    """Format caption and lyrics using the LLM."""
    handler = get_llm_handler(lm_model=lm_model, lm_backend=lm_backend)

    # Build user metadata for constrained decoding
    user_metadata = {}
    if bpm and bpm > 0:
        user_metadata['bpm'] = int(bpm)
    if duration and duration > 0:
        user_metadata['duration'] = int(duration)
    if key_scale and key_scale.strip():
        user_metadata['keyscale'] = key_scale.strip()
    if time_signature and time_signature.strip():
        user_metadata['timesignature'] = time_signature.strip()

    user_metadata_to_pass = user_metadata if user_metadata else None
    top_k_value = None if not top_k or top_k == 0 else int(top_k)
    top_p_value = None if not top_p or top_p >= 1.0 else top_p

    result = format_sample(
        llm_handler=handler,
        caption=caption,
        lyrics=lyrics,
        user_metadata=user_metadata_to_pass,
        temperature=temperature,
        top_k=top_k_value,
        top_p=top_p_value,
        use_constrained_decoding=True,
    )

    return {
        "success": result.success,
        "caption": result.caption,
        "lyrics": result.lyrics,
        "bpm": result.bpm,
        "duration": result.duration,
        "key_scale": result.keyscale,
        "language": result.language,
        "time_signature": result.timesignature,
        "status_message": result.status_message,
    }

def main():
    parser = argparse.ArgumentParser(description="Format lyrics and style using ACE-Step LLM")
    parser.add_argument("--caption", type=str, required=True, help="Style/caption description")
    parser.add_argument("--lyrics", type=str, default="", help="Lyrics text")
    parser.add_argument("--bpm", type=int, default=0, help="Optional BPM constraint")
    parser.add_argument("--duration", type=int, default=0, help="Optional duration constraint")
    parser.add_argument("--key-scale", type=str, default="", help="Optional key scale constraint")
    parser.add_argument("--time-signature", type=str, default="", help="Optional time signature constraint")
    parser.add_argument("--temperature", type=float, default=0.85, help="LLM temperature")
    parser.add_argument("--top-k", type=int, default=0, help="LLM top-k sampling")
    parser.add_argument("--top-p", type=float, default=0.9, help="LLM top-p sampling")
    parser.add_argument("--lm-model", type=str, default=None, help="LM model name (e.g. acestep-5Hz-lm-0.6B, acestep-5Hz-lm-1.7B, acestep-5Hz-lm-4B)")
    parser.add_argument("--lm-backend", type=str, default=None, help="LM backend (pt or vllm)")
    parser.add_argument("--json", action="store_true", help="Output as JSON")

    args = parser.parse_args()

    # Capture original stdout to ensure we can print clean JSON at the end
    original_stdout = sys.stdout
    
    try:
        # Redirect stdout to stderr for all intermediate steps/logging
        sys.stdout = sys.stderr
        
        start_time = time.time()
        result = format_input(
            caption=args.caption,
            lyrics=args.lyrics,
            bpm=args.bpm,
            duration=args.duration,
            key_scale=args.key_scale,
            time_signature=args.time_signature,
            temperature=args.temperature,
            top_k=args.top_k,
            top_p=args.top_p,
            lm_model=args.lm_model,
            lm_backend=args.lm_backend,
        )
        elapsed = time.time() - start_time
        result["elapsed_seconds"] = elapsed

        # Restore stdout for the final output
        sys.stdout = original_stdout

        if args.json:
            print(json.dumps(result))
        else:
            if result["success"]:
                print(f"Caption: {result['caption']}")
                print(f"Lyrics: {result['lyrics'][:100]}...")
                print(f"BPM: {result['bpm']}")
                print(f"Duration: {result['duration']}")
                print(f"Key: {result['key_scale']}")
                print(f"Time Signature: {result['time_signature']}")
                print(f"Language: {result['language']}")
            else:
                print(f"Error: {result['status_message']}")

    except Exception as e:
        sys.stdout = original_stdout
        if args.json:
            print(json.dumps({"success": False, "error": str(e)}))
        else:
            print(f"Error: {e}")
        sys.exit(1)

if __name__ == "__main__":
    # Redirect stdout to stderr to prevent libraries from polluting the output
    # We only want the final JSON to be on stdout
    original_stdout = sys.stdout
    sys.stdout = sys.stderr
    
    try:
        main()
    except SystemExit as e:
        # If main calls sys.exit(), we need to catch it to ensure we don't break
        # But main() prints result before exit.
        # Ensure we restore stdout if we want to print anything else
        sys.stdout = original_stdout
        raise e
    except Exception as e:
        sys.stdout = original_stdout
        # print json error to stdout
        print(json.dumps({"success": False, "error": str(e)}))
        sys.exit(1)
