#!/usr/bin/env bash
# ============================================================
#  ACE-Step Web UI launcher (Linux / macOS)
#  Usage:  chmod +x start_webui.sh && ./start_webui.sh
# ============================================================
set -e
cd "$(dirname "$0")"

# ---- Settings (edit if needed) ----
export ACE_BASE_URL="${ACE_BASE_URL:-http://localhost:8001}"
# export ACE_API_KEY="your-api-key"   # or type it in the web UI
export PORT="${PORT:-5000}"

echo "Installing dependencies (flask, requests)..."
python3 -m pip install -r requirements.txt

echo "============================================================"
echo " Web UI:  http://localhost:${PORT}"
echo " Backend: ${ACE_BASE_URL}"
echo "============================================================"
python3 app.py
