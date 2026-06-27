# Запуск ACE-Step UI на CPU (AMD Ryzen 5 5600G, без дискретной видеокарты)

Эта инструкция описывает, как запустить ace-step-ui на ПК с процессором **AMD Ryzen 5 5600G** со встроенной графикой Radeon, без дискретной видеокарты (Windows, 16 ГБ RAM).

## Главное про железо

Сам `ace-step-ui` — это только интерфейс (React) и сервер на Node/Express, и GPU ему не нужен. Всю музыку генерирует отдельный движок [ACE-Step 1.5](https://github.com/ace-step/ACE-Step-1.5), к которому UI подключается по API.

Встроенная Radeon (Vega, gfx90c) ускорить генерацию **не может**: PyTorch работает с AMD только через ROCm, а ROCm не поддерживает интегрированную графику APU. Поэтому рабочий режим на этом ПК — **CPU**. Это медленнее, но работает.

## Что понадобится

- Node.js 18+ — https://nodejs.org/
- Python 3.11 — https://www.python.org/downloads/
- uv: `pip install uv`
- FFmpeg — https://ffmpeg.org/ (иначе у треков будет длительность 0:00)
- Git — https://git-scm.com/

## Шаг 1. Движок ACE-Step 1.5 в режиме CPU

По умолчанию ставится сборка PyTorch под CUDA, которая на вашем ПК не работает. Нужна **CPU-сборка**:

```bash
git clone https://github.com/ace-step/ACE-Step-1.5
cd ACE-Step-1.5

uv venv
uv pip install -e .

# принудительно ставим CPU-версию PyTorch поверх
uv pip install --force-reinstall torch torchaudio --index-url https://download.pytorch.org/whl/cpu

cd ..
```

Проверка (`False` — это норма для CPU):

```bash
uv run python -c "import torch; print('CUDA:', torch.cuda.is_available())"
```

## Шаг 2. ACE-Step UI

```bash
git clone https://github.com/Landers125/ace-step-ui_CPU
cd ace-step-ui_CPU
setup.bat
```

Расположите папки рядом, чтобы скрипт нашёл движок автоматически:

```
любая-папка
  ACE-Step-1.5
  ace-step-ui_CPU
```

Если движок в другом месте: `set ACESTEP_PATH=C:\путь\к\ACE-Step-1.5`

## Шаг 3. Запуск

```bash
cd ace-step-ui_CPU
start-all-cpu.bat
```

Скрипт `start-all-cpu.bat` принудительно прячет GPU, включает лёгкий режим DiT-only (без тяжёлой LLM) и запускает API + бэкенд + фронтенд. Откроется http://localhost:3000.

Переменные окружения, которые выставляет скрипт:

| Переменная | Значение | Зачем |
| --- | --- | --- |
| `CUDA_VISIBLE_DEVICES` | `-1` | скрыть NVIDIA GPU |
| `HIP_VISIBLE_DEVICES` | `-1` | скрыть AMD GPU |
| `ACESTEP_LM_BACKEND` | `pt` | PyTorch-бэкенд LLM |
| `ACESTEP_INIT_LLM` | `false` | DiT-only, экономия RAM |
| `ACESTEP_VAE_ON_CPU` | `1` | VAE на CPU |

## Настройки для скорости и памяти

- **Thinking Mode** — выкл (в DiT-only недоступен).
- **AI Enhance** — выкл (требует LLM).
- **Inference Steps** — начните с 20.
- **Batch Size** — 1.
- **Audio Duration** — начните с 30–60 сек.

> Если хотите вернуть AI Enhance / Thinking и есть запас RAM — поменяйте в `start-all-cpu.bat` `ACESTEP_INIT_LLM=false` на `true` (подгрузится LLM 0.6B на CPU, будет медленнее).

## Возможные проблемы

| Симптом | Решение |
| --- | --- |
| `ACE-Step not reachable` | Проверьте, что окно API слушает порт 8001 |
| Длительность 0:00 | Установите FFmpeg и добавьте в PATH |
| Нехватка памяти | `ACESTEP_INIT_LLM=false`, Batch Size = 1, короткая длительность |
| Долгая генерация | Ожидаемо на CPU; снизьте Inference Steps и длительность |
