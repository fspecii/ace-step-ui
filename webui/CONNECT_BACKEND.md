# How to get an ACE-Step backend on port 8001

The web UI in this folder is only a **frontend**. It sends requests to the actual
ACE-Step generation engine, which exposes a REST API (default `http://localhost:8001`).
You have three ways to provide that engine. Pick one, then start the web UI
(`start_webui.bat` on Windows, `./start_webui.sh` on Linux/macOS) and point its
**Base URL** at the engine.

---

## Option A — Run the engine locally (your own PC)

Official ACE-Step 1.5 install (Python 3.11–3.12):

```powershell
# 1. Install uv (Windows PowerShell)
powershell -ExecutionPolicy ByPass -c "irm https://astral.sh/uv/install.ps1 | iex"

# 2. Clone & install the engine
git clone https://github.com/ACE-Step/ACE-Step-1.5.git
cd ACE-Step-1.5
uv sync

# 3. Start the REST API server (listens on http://localhost:8001)
uv run acestep-api
```

Linux / macOS: same, but install uv with
`curl -LsSf https://astral.sh/uv/install.sh | sh`.

**Ready-made launchers** also ship in that repo:

| Platform | API server script |
|----------|-------------------|
| Windows (NVIDIA) | `start_api_server.bat` |
| Windows (AMD ROCm) | `start_api_server_rocm.bat` |
| Linux | `start_api_server.sh` |
| macOS (Apple Silicon) | `start_api_server_macos.sh` |

Then in the web UI set **Base URL = `http://localhost:8001`**.

> ⚠️ **Your hardware (Ryzen 5 5600G, integrated Radeon, no CUDA):** the engine
> will run in **CPU mode**. It works, but generation is slow (minutes per track).
> Models auto-download on first run (≥4 GB). For acceptable speed, use Option B or C.
>
> Windows portable package (no manual Python setup):
> <https://files.acemusic.ai/acemusic/win/ACE-Step-1.5.7z>

---

## Option B — Run the engine on a free GPU (Kaggle T4) + tunnel

Run the engine on Kaggle's free GPU and expose it to your PC with a Cloudflare
tunnel. In a **GPU** Kaggle notebook (Internet = ON), run:

```python
# 1. Get the engine
!git clone https://github.com/ACE-Step/ACE-Step-1.5.git
%cd ACE-Step-1.5
!pip install -q -e .

# 2. Get cloudflared (free public tunnel, no signup)
!wget -q https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64 -O /usr/local/bin/cloudflared
!chmod +x /usr/local/bin/cloudflared

# 3. Start the API server in the background (binds 0.0.0.0:8001)
import subprocess, time, os
os.environ["ACESTEP_API_HOST"] = "0.0.0.0"
os.environ["ACESTEP_API_PORT"] = "8001"
srv = subprocess.Popen(["python", "-m", "acestep.api.server_cli", "--host", "0.0.0.0", "--port", "8001"])
time.sleep(60)  # wait for models to load

# 4. Open the public tunnel -> copy the printed https URL
!cloudflared tunnel --url http://localhost:8001
```

Cloudflared prints a URL like `https://something.trycloudflare.com`.
Paste that into the web UI's **Base URL** field on your PC. Done.

> If `acestep.api.server_cli` is unavailable in your install, use the repo's
> `uv run acestep-api` instead (after `uv sync`), keeping host `0.0.0.0`.

---

## Option C — Use the hosted acemusic.ai API (no GPU at all)

If you have an acemusic.ai API key, just point the web UI at their gateway:

- **Base URL:** the acemusic.ai API base URL
- **API key:** your key (sent as `Authorization: Bearer` + `ai_token`)

No local install needed. This is the simplest path if cloud generation is fine.

---

## Quick recap

1. Get a backend on `:8001` via **A**, **B**, or **C** above.
2. Start the web UI: `start_webui.bat` (Windows) / `./start_webui.sh` (Linux/macOS).
3. Open <http://localhost:5000>, set **Base URL** (+ API key), click **List models** to verify, then **Generate**.
