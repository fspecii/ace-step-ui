# ⚡ ACE-Step 1.5 XL + обучение LoRA на Lightning AI (L4 24 ГБ, бесплатно)

Этот гайд поднимает **ACE-Step 1.5 XL (4B)** на **бесплатном GPU NVIDIA L4 (24 ГБ)** в **Lightning AI Studios** и позволяет **обучать свою LoRA** на собственном стиле.

> **Почему Lightning AI, а не Snowflake?**
> - **Snowflake-триал полностью блокирует внешний доступ** (External Access) — без карты не скачать пакеты/модели.
> - Lightning AI даёт **L4 24 ГБ VRAM** и ~**17–22 бесплатных GPU-часов/мес** (15 кредитов = $15; L4 ≈ 0.7 кредита/час).
> - **Постоянное хранилище** — веса XL и обученные LoRA НЕ теряются между сессиями (в отличие от Kaggle/Snowflake).
> - Это обычная Linux-студия с полным интернетом, `sudo` и SSH — раз в несколько проще Snowflake.

> **⚠️ Архитектурная заметка:** для обучения LoRA запускаем **нативное Gradio-приложение ACE-Step** (`app.py`), а не React-интерфейс `ace-step-ui`: вкладка **LoRA Training** есть только в нём. Оно делает и генерацию, и обучение в одном окне.

---

## 1. Регистрация и создание Studio

1. Зарегистрируйся на https://lightning.ai (бесплатно). После входа ты получаешь 1 бесплатную CPU-студию + ~22 GPU-часа/мес.
2. Нажми **+ New Studio** → выбери шаблон с PyTorch/CUDA (например базовый “Code” с GPU-образом) → **Start**.
3. Откроется VS Code / Jupyter в браузере с терминалом.

## 2. Включить L4 GPU

1. В правом верхнем углу студии найди переключатель компьюта (сейчас там CPU).
2. Выбери **GPU → L4 (24 GB)** → студия перезапустится на GPU (файлы сохраняются!).
3. 💡 **Экономия:** GPU-часы тратятся только пока GPU включён. Когда не работаешь — переключись обратно на CPU или останови студию.

```bash
nvidia-smi          # должно показать NVIDIA L4, ~24 ГБ
python --version    # ACE-Step требует Python >= 3.11 (см. примечание в конце)
python -c "import torch; print(torch.__version__, torch.cuda.is_available(), torch.cuda.get_device_name(0))"
```

---

## 3. Установка (терминал)

```bash
# 0) системные зависимости (на Lightning есть sudo)
sudo apt-get update && sudo apt-get install -y ffmpeg git

# 1) клонируем нативный движок ACE-Step 1.5 (в ~/ — это постоянное хранилище)
cd ~
git clone https://github.com/ace-step/ACE-Step-1.5.git
cd ACE-Step-1.5

# 2) сам пакет БЕЗ зависимостей (не ломаем предустановленный CUDA-torch)
pip install -e . --no-deps

# 3) рантайм-зависимости (без torch!)
pip install --no-cache-dir \
  "transformers>=4.51.0,<4.58.0" "diffusers>=0.37.0" "accelerate>=1.12.0" \
  "huggingface_hub[hf_xet]>=0.34.0,<1.0" \
  "soundfile>=0.13.1" librosa soxr loguru einops scipy diskcache numba \
  "vector-quantize-pytorch>=1.27.15" pytorch-wavelets pywavelets toml modelscope matplotlib \
  gradio nano-vllm

python -c "import torch,transformers; print('torch', torch.__version__, 'CUDA', torch.cuda.is_available(), '| transformers', transformers.__version__)"
```

> Если `nano-vllm` не ставится — пропусти его: для обучения LoRA LM не нужен.

---

## 4. Запуск Gradio + публичный URL

```bash
cd ~/ACE-Step-1.5
export HF_HOME=~/hf            # кэш моделей в постоянном хранилище (XL скачается 1 раз)

# запуск Gradio: --config acestep-v15-xl-turbo = 4B XL turbo
python app.py --config acestep-v15-xl-turbo --port 7860
```

Как открыть UI в браузере — два способа:

**А) Встроенный проброс порта Lightning (проще всего):** в студии открой плагин **Ports** → добавь порт **7860** → нажми **Open** — получишь публичный URL студии.

**Б) cloudflared (универсальный туннель)** — в НОВОМ терминале (Gradio пусть работает в первом):

```bash
wget -q -O ~/cloudflared https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64
chmod +x ~/cloudflared
~/cloudflared tunnel --url http://localhost:7860 --no-autoupdate
# скопируй выведенный https://....trycloudflare.com
```

---

## 5. Обучение LoRA — пошагово

Открой UI → **Initialize Service** → внизу вкладка **LoRA Training**.

### Шаг 1. Датасет (свои оригинальные треки!)

Положи файлы в папку (напр. `~/dataset/`):

```
dataset/
├── song1.mp3            # аудио (.mp3/.wav/.flac/.ogg/.opus)
├── song1.lyrics.txt     # текст (или song1.txt)
├── song1.json           # метаданные (опционально)
└── ...
```

`song1.json` (все поля опциональны):

```json
{
  "caption": "A high-energy J-pop track with synthesizer leads and fast tempo",
  "bpm": 190,
  "keyscale": "D major",
  "timesignature": "4",
  "language": "ru"
}
```

- **Сколько:** 8–20 треков для стиля (качество важнее количества).
- **BPM/Key:** проще взять на https://vocalremover.org/key-bpm-finder → Export CSV → положить CSV в папку.
- **Caption:** либо вручную, либо **Auto Label** в UI (через LM acestep-5Hz-lm).

### Шаг 2. Scan и разметка
Вкладка **LoRA Training** → впиши путь к папке → **Scan**. Проверь, что у треков есть текст и caption (Labeled = ✅). При нужде — **Auto Label**, правь записи, **Save** после каждой правки → **Save Dataset** (экспорт JSON).

### Шаг 3. Препроцессинг в тензоры
Укажи путь сохранения тензоров → запусти. 💡 Если использовал LM для caption — перезапусти Gradio без LM, чтобы освободить VRAM.

### Шаг 4. Обучение (рекомендую LoKr)
Вкладка **Train LoKr** (в ~10× быстрее LoRA, минуты вместо часа) → путь к тензорам → загрузи.
- **Max Epochs:** ~100 треков → 500; 10–20 треков → ~800.
- **Batch Size:** 1 (на 24 ГБ можно 2).
- **gradient_checkpointing:** включи при OOM.
- **Start Training** → следи за loss.

### Шаг 5. Использование
Перезапусти Gradio (без LM) → загрузи обученный файл LoRA/LoKr → генерируй 🎶

### (Альтернатива) REST API на localhost:8001
```bash
curl -X POST http://localhost:8001/v1/training/start_lokr \
  -H 'Content-Type: application/json' \
  -d '{"tensor_dir":"~/tensors","output_dir":"~/lokr_output","lokr_linear_dim":64,"lokr_linear_alpha":128,"lokr_factor":-1,"lokr_weight_decompose":true,"learning_rate":0.03,"train_epochs":500,"train_batch_size":1,"gradient_accumulation":4,"save_every_n_epochs":5}'
```
Подробный туториал: https://github.com/ace-step/ACE-Step-1.5/blob/main/docs/en/LoRA_Training_Tutorial.md

---

## 6. Сохранение и экономия часов

- **Хранилище постоянное:** всё в `~/` (веса XL в `~/hf`, LoRA в `~/lokr_output`) переживает перезапуски и смену GPU→CPU. **Ничего не нужно заливать в облако вручную** (в отличие от Kaggle/Snowflake).
- **Экономь GPU-часы:** после работы переключи компьют обратно на **CPU** или останови студию — GPU-часы идут только пока GPU активен. LoKr-обучение быстрое, так что 17–22 ч/мес хватает.

---

## 7. Примечания

- **Python < 3.11:** ACE-Step требует ≥3.11. Если в образе 3.10 — создай окружение: `conda create -y -n ace python=3.11 && conda activate ace`, переустанови torch под CUDA (https://pytorch.org/get-started/locally/ ) и повтори раздел 3.
- **OOM при обучении:** включи `gradient_checkpointing`, уменьши длину треков, используй LoKr.
- **OOM при препроцессинге:** перезапусти Gradio без LM перед препроцессингом.
- **Авторские права:** обучай LoRA только на своих оригинальных произведениях.

---

## TL;DR

1. lightning.ai → New Studio → переключи компьют на **L4 (24 GB)**.
2. Терминал: установить движок (раздел 3).
3. `python app.py --config acestep-v15-xl-turbo --port 7860` → открыть порт 7860 (Ports или cloudflared).
4. Вкладка **LoRA Training** → датасет → Scan → препроцессинг → **Train LoKr** → загрузить LoRA → генерировать.
5. После работы → переключи на CPU/останови студию (файлы сохраняются).
