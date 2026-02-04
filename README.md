<p align="center">
  <img src="https://img.shields.io/badge/🎵-ACE--Step_UI-ff69b4?style=for-the-badge&labelColor=1a1a1a" alt="ACE-Step UI" height="60">
</p>

<h1 align="center">ACE-Step UI</h1>

<p align="center">
  <strong>The Ultimate Open Source Suno Alternative</strong><br>
  <em>Seamless integration with <a href="https://github.com/ace-step/ACE-Step">ACE-Step 1.5</a> - The Open Source AI Music Generation Model</em>
</p>

<p align="center">
  <a href="https://www.youtube.com/@Ambsd-yy7os">
    <img src="https://img.shields.io/badge/▶_Subscribe-YouTube-FF0000?style=for-the-badge&logo=youtube" alt="Subscribe on YouTube">
  </a>
  <a href="https://x.com/AmbsdOP">
    <img src="https://img.shields.io/badge/Follow-@AmbsdOP-1DA1F2?style=for-the-badge&logo=x&logoColor=white" alt="Follow on X">
  </a>
</p>

<p align="center">
  <a href="#-why-ace-step-ui">Why ACE-Step</a> •
  <a href="#-features">Features</a> •
  <a href="#-demo">Demo</a> •
  <a href="#-installation">Installation</a> •
  <a href="#-usage">Usage</a> •
  <a href="#-contributing">Contributing</a>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/React-18.3-61DAFB?style=flat-square&logo=react" alt="React">
  <img src="https://img.shields.io/badge/TypeScript-5.x-3178C6?style=flat-square&logo=typescript" alt="TypeScript">
  <img src="https://img.shields.io/badge/TailwindCSS-3.x-06B6D4?style=flat-square&logo=tailwindcss" alt="TailwindCSS">
  <img src="https://img.shields.io/badge/SQLite-Local_First-003B57?style=flat-square&logo=sqlite" alt="SQLite">
  <img src="https://img.shields.io/badge/License-MIT-green?style=flat-square" alt="License">
  <img src="https://img.shields.io/github/stars/fspecii/ace-step-ui?style=flat-square" alt="Stars">
</p>

---

## 🚀 Why ACE-Step UI?

**Tired of paying $10+/month for Suno or Udio?** ACE-Step 1.5 is the **open source Suno killer** that runs locally on your own GPU - and ACE-Step UI gives you a **beautiful, professional interface** to harness its full power.

| Feature | Suno/Udio | ACE-Step UI |
|---------|-----------|-------------|
| **Cost** | $10-50/month | **FREE forever** |
| **Privacy** | Cloud-based | **100% local** |
| **Ownership** | Licensed | **You own everything** |
| **Customization** | Limited | **Full control** |
| **Queue Limits** | Restricted | **Unlimited** |
| **Commercial Use** | Expensive tiers | **No restrictions** |

### What Makes ACE-Step 1.5 Special?

- **State-of-the-art quality** rivaling commercial services
- **Full song generation** up to 4+ minutes with vocals
- **Runs locally** - no internet required after setup
- **Open source** - inspect, modify, improve
- **Active development** - constant improvements

---

## 🎬 Demo

<p align="center">
  <img src="docs/demo.gif" alt="ACE-Step UI - Open Source Suno Alternative" width="100%">
</p>

<p align="center">
  <em>Generate professional AI music with a Spotify-like interface - 100% free and local</em>
</p>

---

## ✨ Features

### 🎵 AI Music Generation
| Feature | Description |
|---------|-------------|
| **Full Song Generation** | Create complete songs with vocals and lyrics up to 4+ minutes |
| **Instrumental Mode** | Generate instrumental tracks without vocals |
| **Custom Mode** | Fine-tune BPM, key, time signature, and duration |
| **Style Tags** | Define genre, mood, tempo, and instrumentation |
| **Batch Generation** | Generate multiple variations at once |
| **Thinking Mode** | Let AI enhance your prompts automatically |

### 🎨 Advanced Parameters
| Feature | Description |
|---------|-------------|
| **Reference Audio** | Use any audio file as a style reference |
| **Audio Cover** | Transform existing audio with new styles |
| **Repainting** | Regenerate specific sections of a track |
| **Seed Control** | Reproduce exact generations for consistency |
| **Inference Steps** | Control quality vs speed tradeoff |

### 🎤 Lyrics & Prompts
| Feature | Description |
|---------|-------------|
| **Lyrics Editor** | Write and format lyrics with structure tags |
| **Format Assistant** | AI-powered caption and lyrics formatting |
| **Prompt Templates** | Quick-start with genre presets |
| **Reuse Prompts** | Clone settings from any previous generation |

### 🎧 Professional Interface
| Feature | Description |
|---------|-------------|
| **Spotify-Inspired UI** | Clean, modern design with dark/light mode |
| **Bottom Player** | Full-featured player with waveform and progress |
| **Library Management** | Browse, search, and organize all your tracks |
| **Likes & Playlists** | Organize favorites into custom playlists |
| **Real-time Progress** | Live generation progress with queue position |
| **LAN Access** | Use from any device on your local network |

### 🛠️ Built-in Tools
| Feature | Description |
|---------|-------------|
| **Audio Editor** | Trim, fade, and apply effects with AudioMass |
| **Stem Extraction** | Separate vocals, drums, bass, and other with Demucs |
| **Video Generator** | Create music videos with Pexels backgrounds |
| **Gradient Covers** | Beautiful procedural album art (no internet needed) |

---

## 💻 Tech Stack

| Layer | Technologies |
|-------|-------------|
| **Frontend** | React 18, TypeScript, TailwindCSS, Vite |
| **Backend** | Express.js, SQLite, better-sqlite3 |
| **AI Engine** | [ACE-Step 1.5](https://github.com/ace-step/ACE-Step) |
| **Audio Tools** | AudioMass, Demucs, FFmpeg |

---

## 📋 Requirements

| Requirement | Specification |
|-------------|---------------|
| **Node.js** | 18 or higher |
| **Python** | 3.10+ (3.11 recommended) |
| **NVIDIA GPU** | 8GB+ VRAM (12GB+ recommended) |
| **FFmpeg** | For audio processing |
| **uv** | Python package manager (recommended) |

---

## ⚡ Quick Start

```bash
# 1. Start ACE-Step API (in ACE-Step directory)
cd /path/to/ACE-Step
uv run acestep-api --port 8001

# 2. Start ACE-Step UI (in another terminal)
cd ace-step-ui
./start.sh
```

Open **http://localhost:3000** and start creating!

---

## 📦 Installation

### 1. Install ACE-Step (The AI Engine)

```bash
# Clone ACE-Step - the open source Suno alternative
git clone https://github.com/ace-step/ACE-Step
cd ACE-Step

# Create virtual environment and install
uv venv
uv pip install -e .

# Models download automatically on first run (~5GB)
cd ..
```

### 2. Install ACE-Step UI (This Repository)

```bash
# Clone the UI
git clone https://github.com/fspecii/ace-step-ui
cd ace-step-ui

# Run setup script (installs all dependencies)
./setup.sh
```

**Or install manually:**

```bash
# Install frontend dependencies
npm install

# Install server dependencies
cd server
npm install
cd ..

# Copy environment file
cp server/.env.example server/.env
```

---

## 🎮 Usage

### Step 1: Start ACE-Step API Server

```bash
cd /path/to/ACE-Step
uv run acestep-api --port 8001
```

Wait for "Application startup complete" before proceeding.

### Step 2: Start ACE-Step UI

```bash
cd ace-step-ui
./start.sh
```

### Step 3: Create Music!

| Access | URL |
|--------|-----|
| Local | http://localhost:3000 |
| LAN (other devices) | http://YOUR_IP:3000 |

---

## ⚙️ Configuration

Edit `server/.env`:

```env
# Server
PORT=3001

# ACE-Step API (seamless integration)
ACESTEP_API_URL=http://localhost:8001

# Database (local-first, no cloud)
DATABASE_PATH=./data/acestep.db

# Optional: Pexels API for video backgrounds
PEXELS_API_KEY=your_key_here
```

---

## 🎼 Generation Modes

### Simple Mode
Just describe what you want. ACE-Step handles the rest.

> "An upbeat pop song about summer adventures with catchy hooks"

### Custom Mode
Full control over every parameter:

| Parameter | Description |
|-----------|-------------|
| **Lyrics** | Full lyrics with `[Verse]`, `[Chorus]` tags |
| **Style** | Genre, mood, instruments, tempo |
| **Duration** | 30-240 seconds |
| **BPM** | 60-200 beats per minute |
| **Key** | Musical key (C major, A minor, etc.) |

---

## 🔧 Built-in Tools

| Tool | Description |
|------|-------------|
| **🎚️ Audio Editor** | Cut, trim, fade, and apply effects |
| **🎤 Stem Extraction** | Separate vocals, drums, bass, other |
| **🎬 Video Generator** | Create music videos with stock footage |
| **🎨 Album Art** | Auto-generated gradient covers |

---

## 🐛 Troubleshooting

| Issue | Solution |
|-------|----------|
| **ACE-Step API not reachable** | Ensure `uv run acestep-api --port 8001` is running |
| **CUDA out of memory** | Close other GPU apps, reduce duration |
| **Songs show 0:00 duration** | Install FFmpeg: `sudo apt install ffmpeg` |
| **LAN access not working** | Check firewall allows ports 3000 and 3001 |

---

## 🤝 Contributing

**We need your help to make ACE-Step UI even better!**

This is a community-driven project and contributions are what make open source amazing. Whether you're fixing bugs, adding features, improving documentation, or sharing ideas - every contribution counts!

### Ways to Contribute

- 🐛 **Report bugs** - Found an issue? Open a GitHub issue
- 💡 **Suggest features** - Have an idea? We'd love to hear it
- 🔧 **Submit PRs** - Code contributions are always welcome
- 📖 **Improve docs** - Help others get started
- ⭐ **Star the repo** - Show your support!

### How to Contribute

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

---

## 📣 Stay Connected

<p align="center">
  <a href="https://www.youtube.com/@Ambsd-yy7os">
    <img src="https://img.shields.io/badge/YouTube-Subscribe_for_Tutorials-FF0000?style=for-the-badge&logo=youtube" alt="YouTube">
  </a>
</p>

<p align="center">
  <a href="https://x.com/AmbsdOP">
    <img src="https://img.shields.io/badge/X_(Twitter)-Follow_for_Updates-1DA1F2?style=for-the-badge&logo=x&logoColor=white" alt="X/Twitter">
  </a>
</p>

<p align="center">
  <strong>Subscribe and follow for:</strong><br>
  🎥 Video tutorials and demos<br>
  🚀 New feature announcements<br>
  💡 Tips and tricks<br>
  🎵 AI music generation news
</p>

---

## 🙏 Credits

- **[ACE-Step](https://github.com/ace-step/ACE-Step)** - The revolutionary open source AI music generation model
- **[AudioMass](https://github.com/pkalogiros/AudioMass)** - Web audio editor
- **[Demucs](https://github.com/facebookresearch/demucs)** - Audio source separation
- **[Pexels](https://www.pexels.com)** - Stock video backgrounds

---

## 📄 License

This project is open source under the [MIT License](LICENSE).

---

<p align="center">
  <strong>⭐ If ACE-Step UI helps you create amazing music, please star this repo! ⭐</strong>
</p>

<p align="center">
  <em>Made with ❤️ for the open-source AI music community</em>
</p>

<p align="center">
  <strong>Stop paying for Suno. Start creating with ACE-Step.</strong>
</p>
