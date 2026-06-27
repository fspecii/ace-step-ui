# ACE-Step Web UI + API client

A full-featured web interface (Flask backend) and a standalone Python client for
the **ACE-Step / acemusic.ai** music-generation API. Every documented
`/release_task` parameter is exposed.

## Contents

| File | Purpose |
|------|---------|
| `app.py` | Flask backend + serves the web UI. Proxies `/release_task`, `/query_result`, `/v1/audio`, `/v1/models`. |
| `index.html` | Single-page UI with all parameters grouped by category, live request preview, audio players + download. |
| `acestep_client.py` | Standalone library + CLI (every parameter as a `--flag`). |
| `requirements.txt` | `flask`, `requests`. |

## Quick start (web UI)

```bash
pip install -r requirements.txt

# point to a running ACE-Step server (local) or your acemusic.ai gateway
export ACE_BASE_URL="http://localhost:8001"
export ACE_API_KEY="your-api-key"     # optional; can also be typed in the UI

python app.py
# open http://localhost:5000
```

In the UI:
1. Set **Base URL** and **API key** (saved in your browser's localStorage).
2. Click **List models** to verify the connection.
3. Fill any parameters (sensible defaults pre-filled), watch the live **Request preview**.
4. Click **Generate** — the page submits the task, polls status, then shows audio players + download links.

## Quick start (CLI)

```bash
python acestep_client.py \
  --base-url http://localhost:8001 --api-key KEY \
  --prompt "atmospheric instrumental rock, space rock, clean electric guitar lead, sustained melodic solo with reverb and subtle delay, light percussion, warm bass, post-rock, instrumental" \
  --bpm 70 --key-scale "A minor" --time-signature 4 --duration 120 \
  --lyrics "[instrumental]" --audio-format wav --batch-size 2 --out dreaming_space
```

## Library usage

```python
from acestep_client import AceStepClient
c = AceStepClient("http://localhost:8001", api_key="...")
task = c.generate(prompt="space rock, clean electric guitar lead",
                  bpm=70, key_scale="A minor", time_signature="4",
                  audio_duration=120, lyrics="[instrumental]", audio_format="wav")
for i, res in enumerate(c.wait(task["task_id"])):
    c.download(res["file"], f"out_{i+1}.wav")
```

## Notes

- The parameter schema in `app.py` (`PARAM_SCHEMA`) is the single source of truth and
  is what the UI renders — add/edit a field there and it appears in the form automatically.
- The documented REST shape targets the self-hosted ACE-Step `api_server` (default
  `localhost:8001`). If acemusic.ai's hosted gateway uses a different base path or
  auth header, just change **Base URL** / **API key** accordingly.
- The backend strips empty fields and coerces types before forwarding, so you only
  send the parameters you actually set.
- API key is sent as both the `Authorization: Bearer` header and the `ai_token` body
  field for maximum compatibility.
