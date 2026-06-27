#!/usr/bin/env python3
"""
acestep_client.py — standalone ACE-Step / acemusic.ai API client.

Use as a library:
    from acestep_client import AceStepClient
    c = AceStepClient("http://localhost:8001", api_key="...")
    task = c.generate(prompt="space rock, clean electric guitar lead", bpm=70,
                      key_scale="A minor", time_signature="4", audio_duration=120,
                      lyrics="[instrumental]", audio_format="wav")
    results = c.wait(task["task_id"])
    c.download(results[0]["file"], "out.wav")

Use from the command line:
    python acestep_client.py --base-url http://localhost:8001 --api-key KEY \
        --prompt "space rock, clean electric guitar lead" --bpm 70 \
        --key-scale "A minor" --time-signature 4 --duration 120 \
        --lyrics "[instrumental]" --audio-format wav --out song.wav
"""
import argparse
import json
import os
import sys
import time

try:
    import requests
except ImportError:
    raise SystemExit("pip install requests")

# All documented /release_task parameters (snake_case canonical names).
ALL_PARAMS = [
    "prompt", "lyrics", "vocal_language", "audio_format", "thinking",
    "sample_mode", "sample_query", "use_format", "model",
    "bpm", "key_scale", "time_signature", "audio_duration",
    "inference_steps", "guidance_scale", "use_random_seed", "seed", "batch_size",
    "shift", "infer_method", "timesteps", "use_adg", "cfg_interval_start", "cfg_interval_end",
    "audio_code_string",
    "lm_model_path", "lm_backend", "lm_temperature", "lm_cfg_scale", "lm_negative_prompt",
    "lm_top_k", "lm_top_p", "lm_repetition_penalty",
    "use_cot_caption", "use_cot_language", "constrained_decoding",
    "constrained_decoding_debug", "allow_lm_batch",
    "task_type", "reference_audio_path", "src_audio_path", "instruction",
    "repainting_start", "repainting_end", "audio_cover_strength",
]


class AceStepClient:
    def __init__(self, base_url="http://localhost:8001", api_key=""):
        self.base = base_url.rstrip("/")
        self.api_key = api_key or os.environ.get("ACE_API_KEY", "")

    def _headers(self):
        h = {"Content-Type": "application/json"}
        if self.api_key:
            h["Authorization"] = "Bearer " + self.api_key
        return h

    def generate(self, **params):
        """Submit a generation task. Accepts any documented parameter."""
        payload = {k: v for k, v in params.items() if v is not None and v != ""}
        if self.api_key:
            payload["ai_token"] = self.api_key
        r = requests.post(self.base + "/release_task", headers=self._headers(),
                          data=json.dumps(payload), timeout=120)
        r.raise_for_status()
        return r.json().get("data", {})

    def query(self, task_ids):
        if isinstance(task_ids, str):
            task_ids = [task_ids]
        r = requests.post(self.base + "/query_result", headers=self._headers(),
                          data=json.dumps({"task_id_list": task_ids}), timeout=60)
        r.raise_for_status()
        return r.json().get("data", [])

    def wait(self, task_id, interval=3.0, timeout=900):
        """Poll until done; returns parsed result list."""
        start = time.time()
        while time.time() - start < timeout:
            data = self.query(task_id)
            if data:
                item = data[0]
                st = item.get("status")
                if st == 1:
                    res = item.get("result")
                    return json.loads(res) if isinstance(res, str) else (res or [])
                if st == 2:
                    raise RuntimeError("Generation failed: " + str(item.get("error")))
            sys.stderr.write(".")
            sys.stderr.flush()
            time.sleep(interval)
        raise TimeoutError("Timed out waiting for task " + task_id)

    def download(self, file_path, out_path):
        """Download a generated audio file (the 'file' field from results)."""
        if file_path.startswith("http"):
            url = file_path
        elif file_path.startswith("/"):
            url = self.base + file_path
        else:
            url = self.base + "/v1/audio?path=" + file_path
        headers = {"Authorization": "Bearer " + self.api_key} if self.api_key else {}
        r = requests.get(url, headers=headers, stream=True, timeout=120)
        r.raise_for_status()
        with open(out_path, "wb") as f:
            for chunk in r.iter_content(8192):
                f.write(chunk)
        return out_path

    def models(self):
        r = requests.get(self.base + "/v1/models", headers=self._headers(), timeout=30)
        r.raise_for_status()
        return r.json().get("data", {})


def _build_argparser():
    p = argparse.ArgumentParser(description="ACE-Step / acemusic.ai API client")
    p.add_argument("--base-url", default=os.environ.get("ACE_BASE_URL", "http://localhost:8001"))
    p.add_argument("--api-key", default=os.environ.get("ACE_API_KEY", ""))
    p.add_argument("--out", default="acestep_output", help="Output file prefix")
    p.add_argument("--list-models", action="store_true")
    # expose every API parameter as --kebab-case
    for name in ALL_PARAMS:
        p.add_argument("--" + name.replace("_", "-"), dest=name, default=None)
    return p


def main():
    args = _build_argparser().parse_args()
    c = AceStepClient(args.base_url, args.api_key)
    if args.list_models:
        print(json.dumps(c.models(), indent=2))
        return
    params = {n: getattr(args, n) for n in ALL_PARAMS if getattr(args, n) is not None}
    print("Submitting:", json.dumps(params, indent=2))
    task = c.generate(**params)
    tid = task.get("task_id")
    print("task_id:", tid)
    results = c.wait(tid)
    print("\nDone, %d variant(s)." % len(results))
    for i, res in enumerate(results):
        ext = (params.get("audio_format") or "mp3")
        out = "%s_%d.%s" % (args.out, i + 1, ext)
        c.download(res.get("file", ""), out)
        print("  saved", out)


if __name__ == "__main__":
    main()
