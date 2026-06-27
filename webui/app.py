#!/usr/bin/env python3
"""
ACE-Step Web UI (backend)
=========================
Full-featured Flask backend + web interface exposing EVERY documented
parameter of the ACE-Step / acemusic.ai generation API.

Workflow (per official API):
  1. POST {BASE}/release_task        -> returns task_id
  2. POST {BASE}/query_result        -> poll until status == 1 (done) / 2 (failed)
  3. GET  {BASE}/v1/audio?path=...    -> download generated audio

Run:
  pip install -r requirements.txt
  export ACE_BASE_URL="http://localhost:8001"     # or your acemusic.ai gateway
  export ACE_API_KEY="your-api-key"               # optional, can also be set in UI
  python app.py
  open http://localhost:5000
"""
import os
import json
import mimetypes
from flask import Flask, request, jsonify, Response, send_from_directory

try:
    import requests
except ImportError:  # pragma: no cover
    raise SystemExit("Please `pip install requests flask` first.")

app = Flask(__name__, static_folder=None)

DEFAULT_BASE_URL = os.environ.get("ACE_BASE_URL", "http://localhost:8001")
DEFAULT_API_KEY = os.environ.get("ACE_API_KEY", "")
HERE = os.path.dirname(os.path.abspath(__file__))

# ----------------------------------------------------------------------------
# Parameter schema -- single source of truth, also rendered into the UI.
# Each field: name, type, default, group, help, and optional choices/min/max.
# ----------------------------------------------------------------------------
PARAM_SCHEMA = [
    # --- Content ---
    {"name": "prompt", "type": "textarea", "group": "Content", "default": "", "help": "Music description prompt (alias: caption)"},
    {"name": "lyrics", "type": "textarea", "group": "Content", "default": "", "help": "Lyrics content. Use [instrumental] for no vocals."},
    {"name": "vocal_language", "type": "text", "group": "Content", "default": "en", "help": "Lyrics language (en, zh, ja, ...)"},
    {"name": "audio_format", "type": "select", "group": "Content", "default": "mp3", "choices": ["mp3", "flac", "opus", "aac", "wav", "wav32"], "help": "Output format"},
    {"name": "thinking", "type": "bool", "group": "Content", "default": False, "help": "Use 5Hz LM to generate audio codes (lm-dit)"},
    # --- Sample / Format ---
    {"name": "sample_mode", "type": "bool", "group": "Sample / Format", "default": False, "help": "Auto-generate caption/lyrics/metas via LM"},
    {"name": "sample_query", "type": "text", "group": "Sample / Format", "default": "", "help": "Natural-language description (alias: description/desc)"},
    {"name": "use_format", "type": "bool", "group": "Sample / Format", "default": False, "help": "LM enhances/formats the provided caption + lyrics"},
    # --- Model ---
    {"name": "model", "type": "text", "group": "Model", "default": "", "help": "DiT model name (e.g. acestep-v15-turbo). Empty = default."},
    # --- Music attributes ---
    {"name": "bpm", "type": "int", "group": "Music attributes", "default": "", "min": 30, "max": 300, "help": "Tempo 30-300"},
    {"name": "key_scale", "type": "text", "group": "Music attributes", "default": "", "help": "Key/scale, e.g. 'C Major', 'Am'"},
    {"name": "time_signature", "type": "select", "group": "Music attributes", "default": "", "choices": ["", "2", "3", "4", "6"], "help": "2/4, 3/4, 4/4, 6/8"},
    {"name": "audio_duration", "type": "float", "group": "Music attributes", "default": "", "min": 10, "max": 600, "help": "Duration seconds 10-600 (alias: duration)"},
    # --- Generation control ---
    {"name": "inference_steps", "type": "int", "group": "Generation control", "default": 8, "min": 1, "max": 200, "help": "Turbo 1-20 (rec 8); Base 1-200 (rec 32-64)"},
    {"name": "guidance_scale", "type": "float", "group": "Generation control", "default": 7.0, "help": "Prompt guidance (Base model only)"},
    {"name": "use_random_seed", "type": "bool", "group": "Generation control", "default": True, "help": "Use random seed"},
    {"name": "seed", "type": "int", "group": "Generation control", "default": -1, "help": "Fixed seed (when use_random_seed=false)"},
    {"name": "batch_size", "type": "int", "group": "Generation control", "default": 2, "min": 1, "max": 8, "help": "Variants per run (max 8)"},
    # --- Advanced DiT ---
    {"name": "shift", "type": "float", "group": "Advanced DiT", "default": 3.0, "min": 1.0, "max": 5.0, "help": "Timestep shift 1.0-5.0 (Base only)"},
    {"name": "infer_method", "type": "select", "group": "Advanced DiT", "default": "ode", "choices": ["ode", "sde"], "help": "ode (Euler, faster) or sde (stochastic)"},
    {"name": "timesteps", "type": "text", "group": "Advanced DiT", "default": "", "help": "Custom timesteps CSV; overrides steps+shift"},
    {"name": "use_adg", "type": "bool", "group": "Advanced DiT", "default": False, "help": "Adaptive Dual Guidance (Base only)"},
    {"name": "cfg_interval_start", "type": "float", "group": "Advanced DiT", "default": 0.0, "min": 0.0, "max": 1.0, "help": "CFG start ratio 0-1"},
    {"name": "cfg_interval_end", "type": "float", "group": "Advanced DiT", "default": 1.0, "min": 0.0, "max": 1.0, "help": "CFG end ratio 0-1"},
    # --- Audio codes ---
    {"name": "audio_code_string", "type": "textarea", "group": "Audio codes", "default": "", "help": "5Hz semantic tokens for llm_dit"},
    # --- 5Hz LM ---
    {"name": "lm_model_path", "type": "text", "group": "5Hz LM", "default": "", "help": "LM checkpoint dir, e.g. acestep-5Hz-lm-0.6B"},
    {"name": "lm_backend", "type": "select", "group": "5Hz LM", "default": "vllm", "choices": ["vllm", "pt"], "help": "LM backend"},
    {"name": "lm_temperature", "type": "float", "group": "5Hz LM", "default": 0.85, "help": "Sampling temperature"},
    {"name": "lm_cfg_scale", "type": "float", "group": "5Hz LM", "default": 2.5, "help": "CFG scale (>1 enables CFG)"},
    {"name": "lm_negative_prompt", "type": "text", "group": "5Hz LM", "default": "NO USER INPUT", "help": "Negative prompt for CFG"},
    {"name": "lm_top_k", "type": "int", "group": "5Hz LM", "default": "", "help": "Top-k (0/empty disables)"},
    {"name": "lm_top_p", "type": "float", "group": "5Hz LM", "default": 0.9, "help": "Top-p (>=1 disables)"},
    {"name": "lm_repetition_penalty", "type": "float", "group": "5Hz LM", "default": 1.0, "help": "Repetition penalty"},
    # --- LM CoT ---
    {"name": "use_cot_caption", "type": "bool", "group": "LM CoT", "default": True, "help": "LM rewrites/enhances caption via CoT"},
    {"name": "use_cot_language", "type": "bool", "group": "LM CoT", "default": True, "help": "LM detects vocal language via CoT"},
    {"name": "constrained_decoding", "type": "bool", "group": "LM CoT", "default": True, "help": "FSM-based constrained decoding"},
    {"name": "constrained_decoding_debug", "type": "bool", "group": "LM CoT", "default": False, "help": "Debug logging for constrained decoding"},
    {"name": "allow_lm_batch", "type": "bool", "group": "LM CoT", "default": True, "help": "Allow LM batch processing"},
    # --- Edit / Reference ---
    {"name": "task_type", "type": "select", "group": "Edit / Reference", "default": "text2music", "choices": ["text2music", "cover", "repaint", "lego", "extract", "complete"], "help": "Task type"},
    {"name": "reference_audio_path", "type": "text", "group": "Edit / Reference", "default": "", "help": "Server path to reference audio (style transfer)"},
    {"name": "src_audio_path", "type": "text", "group": "Edit / Reference", "default": "", "help": "Server path to source audio (repaint/cover)"},
    {"name": "instruction", "type": "text", "group": "Edit / Reference", "default": "", "help": "Edit instruction (auto if empty)"},
    {"name": "repainting_start", "type": "float", "group": "Edit / Reference", "default": 0.0, "help": "Repaint start (sec)"},
    {"name": "repainting_end", "type": "float", "group": "Edit / Reference", "default": "", "help": "Repaint end (sec), -1 = end"},
    {"name": "audio_cover_strength", "type": "float", "group": "Edit / Reference", "default": 1.0, "min": 0.0, "max": 1.0, "help": "Cover strength 0-1 (0.2 = light style transfer)"},
]

BOOL_NAMES = {p["name"] for p in PARAM_SCHEMA if p["type"] == "bool"}
INT_NAMES = {p["name"] for p in PARAM_SCHEMA if p["type"] == "int"}
FLOAT_NAMES = {p["name"] for p in PARAM_SCHEMA if p["type"] == "float"}


def _headers(api_key):
    h = {"Content-Type": "application/json"}
    if api_key:
        h["Authorization"] = "Bearer " + api_key
    return h


def _coerce(payload):
    """Drop empty values and coerce types to match the API schema."""
    out = {}
    for k, v in payload.items():
        if v is None:
            continue
        if isinstance(v, str) and v.strip() == "":
            continue
        if k in BOOL_NAMES:
            out[k] = bool(v)
        elif k in INT_NAMES:
            try:
                out[k] = int(v)
            except (TypeError, ValueError):
                continue
        elif k in FLOAT_NAMES:
            try:
                out[k] = float(v)
            except (TypeError, ValueError):
                continue
        else:
            out[k] = v
    return out


@app.route("/")
def index():
    return send_from_directory(HERE, "index.html")


@app.route("/api/schema")
def schema():
    return jsonify({
        "schema": PARAM_SCHEMA,
        "default_base_url": DEFAULT_BASE_URL,
        "has_env_key": bool(DEFAULT_API_KEY),
    })


@app.route("/api/models")
def models():
    base = request.args.get("base_url") or DEFAULT_BASE_URL
    api_key = request.args.get("api_key") or DEFAULT_API_KEY
    try:
        r = requests.get(base.rstrip("/") + "/v1/models", headers=_headers(api_key), timeout=30)
        return Response(r.content, status=r.status_code, content_type=r.headers.get("Content-Type", "application/json"))
    except Exception as e:
        return jsonify({"error": str(e)}), 502


@app.route("/api/generate", methods=["POST"])
def generate():
    body = request.get_json(force=True) or {}
    base = (body.pop("base_url", None) or DEFAULT_BASE_URL).rstrip("/")
    api_key = body.pop("api_key", None) or DEFAULT_API_KEY
    payload = _coerce(body)
    if api_key:
        payload["ai_token"] = api_key
    try:
        r = requests.post(base + "/release_task", headers=_headers(api_key), data=json.dumps(payload), timeout=120)
        return Response(r.content, status=r.status_code, content_type=r.headers.get("Content-Type", "application/json"))
    except Exception as e:
        return jsonify({"error": str(e)}), 502


@app.route("/api/status", methods=["POST"])
def status():
    body = request.get_json(force=True) or {}
    base = (body.get("base_url") or DEFAULT_BASE_URL).rstrip("/")
    api_key = body.get("api_key") or DEFAULT_API_KEY
    task_ids = body.get("task_id_list") or []
    try:
        r = requests.post(base + "/query_result", headers=_headers(api_key), data=json.dumps({"task_id_list": task_ids}), timeout=60)
        return Response(r.content, status=r.status_code, content_type=r.headers.get("Content-Type", "application/json"))
    except Exception as e:
        return jsonify({"error": str(e)}), 502


@app.route("/api/audio")
def audio():
    """Proxy/stream generated audio so the browser can play & download it."""
    base = (request.args.get("base_url") or DEFAULT_BASE_URL).rstrip("/")
    api_key = request.args.get("api_key") or DEFAULT_API_KEY
    path = request.args.get("path", "")
    if not path:
        return jsonify({"error": "missing path"}), 400
    # path may already be a full /v1/audio?path=... url fragment
    if path.startswith("http"):
        url = path
    elif path.startswith("/v1/audio"):
        url = base + path
    else:
        url = base + "/v1/audio?path=" + path
    try:
        r = requests.get(url, headers={"Authorization": "Bearer " + api_key} if api_key else {}, stream=True, timeout=120)
        ct = r.headers.get("Content-Type") or mimetypes.guess_type(path)[0] or "audio/mpeg"
        return Response(r.iter_content(8192), status=r.status_code, content_type=ct)
    except Exception as e:
        return jsonify({"error": str(e)}), 502


if __name__ == "__main__":
    port = int(os.environ.get("PORT", "5000"))
    print("ACE-Step Web UI -> http://localhost:%d  (backend base: %s)" % (port, DEFAULT_BASE_URL))
    app.run(host="0.0.0.0", port=port, debug=True)
