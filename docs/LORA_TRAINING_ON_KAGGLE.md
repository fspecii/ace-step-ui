# 🎸 Обучение LoRA на Kaggle (16 ГБ, бесплатно) — ACE-Step 1.5

Этот гайд позволяет **обучить свою LoRA** для ACE-Step на бесплатном GPU **Kaggle (P100/T4, 16 ГБ)** — там, где у тебя уже всё поднято и телефон уже верифицирован.

> **⚠️ Честно про 16 ГБ:** это **минимум** для обучения ACE-Step LoRA (пик ~17 ГБ, рекомендуется 20+ ГБ). На XL (4B) возможен OOM — поэтому ниже даны все рычаги экономии памяти (раздел 2) и запасной вариант на **2B-модели** (раздел 6), которая точно влезает в 16 ГБ.

> **Напоминание про архитектуру:** для LoRA запускаем **нативное Gradio-приложение ACE-Step** (`app.py`), а не React `ace-step-ui` — вкладка **LoRA Training** есть только в нём. Это отдельный запуск от `RUN_ON_KAGGLE_GPU.md` (там — React-интерфейс для генерации).

---

## 0. Подготовка Kaggle-ноутбука

1. https://kaggle.com → **Create → New Notebook**.
2. Справа **Settings**:
   - **Accelerator** = `GPU P100` (или `GPU T4 x2` — используем 1 GPU).
   - **Internet** = `On` (требует верифицированный телефон — у тебя уже есть).
3. ⚠️ **Хранилище:** `/kaggle/temp` чистится между сессиями; `/kaggle/working` сохраняется как вывод ноутбука. **Обученную LoRA сохраняй в `/kaggle/working`** (см. раздел 5).

---

## 1. Ячейки установки

**Ячейка 1 — проверка GPU:**
```python
!nvidia-smi
!python --version
import torch; print(torch.__version__, torch.cuda.is_available(), torch.cuda.get_device_name(0))
```

**Ячейка 2 — ffmpeg:**
```python
!apt-get update -qq && apt-get install -y -qq ffmpeg
```

**Ячейка 3 — движок + зависимости (без torch, чтобы не сломать CUDA):**
```python
import os
os.chdir('/kaggle/temp')
!git clone https://github.com/ace-step/ACE-Step-1.5.git
os.chdir('/kaggle/temp/ACE-Step-1.5')
!pip install -e . --no-deps
!pip install --no-cache-dir \
  "transformers>=4.51.0,<4.58.0" "diffusers>=0.37.0" "accelerate>=1.12.0" \
  "huggingface_hub[hf_xet]>=0.34.0,<1.0" \
  "soundfile>=0.13.1" librosa soxr loguru einops scipy diskcache numba \
  "vector-quantize-pytorch>=1.27.15" pytorch-wavelets pywavelets toml modelscope matplotlib gradio
```

**Ячейка 4 — запуск Gradio + публичный URL (cloudflared):**
```python
import os, subprocess, time
os.environ['HF_HOME'] = '/kaggle/temp/hf'   # XL скачается сюда (чистится между сессиями)
os.chdir('/kaggle/temp/ACE-Step-1.5')

# cloudflared
!wget -q -O /kaggle/temp/cloudflared https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64
!chmod +x /kaggle/temp/cloudflared

# Gradio в фоне (XL turbo 4B). Для 16 ГБ НЕ инициализируем LM (экономия VRAM)
subprocess.Popen(['python','app.py','--config','acestep-v15-xl-turbo','--port','7860'])
time.sleep(5)
# туннель
!/kaggle/temp/cloudflared tunnel --url http://localhost:7860 --no-autoupdate
```
Скопируй выведенный `https://....trycloudflare.com` и открой в браузере.

---

## 2. 🔑 Рычаги экономии памяти (КРИТИЧНО на 16 ГБ)

Чтобы XL-LoRA влезла в 16 ГБ, включи всё:
1. **Не инициализируй LM** перед препроцессингом/обучением (LM нужен только для Auto Label).
2. **`gradient_checkpointing = true`** — сильно снижает память активаций.
3. **`batch_size = 1`**, `gradient_accumulation = 4`.
4. **Короткие клипы 15–30 сек** — длинные треки = больше VRAM.
5. **LoKr** (а не полная LoRA) — легче и в ~10× быстрее.
6. При желании — **BF16-веса XL** (`marcorez8/acestep-v15-xl-turbo-bf16`, ~10 ГБ вместо ~19 ГБ FP32).

Если всё равно OOM → раздел 6 (2B-модель).

---

## 3. Датасет (свои оригинальные треки)

Положи файлы в `/kaggle/temp/dataset/` (или загрузи как Kaggle Dataset и подключи — см. раздел 8):
```
dataset/
├── song1.mp3            # аудио (лучше обрезать до 15–30 сек)
├── song1.lyrics.txt     # текст (или song1.txt)
├── song1.json           # метаданные (опционально)
└── ...
```
`song1.json` (всё опционально): `caption`, `bpm`, `keyscale`, `timesignature`, `language`.
- **8–20 треков** для стиля (качество > количество).
- BPM/Key → https://vocalremover.org/key-bpm-finder (Export CSV в папку).

---

## 4. Обучение LoRA — пошагово (в UI)

1. **Initialize Service** → вкладка **LoRA Training**.
2. **Scan** → укажи `/kaggle/temp/dataset` → проверь Labeled. При нужде **Auto Label**, правь, **Save** → **Save Dataset**.
3. **Препроцессинг в тензоры** → укажи путь → запусти. 💡 Если использовал LM — перезапусти Gradio без LM, чтобы освободить VRAM.
4. **Train LoKr** → путь к тензорам → параметры:
   - **output_dir = `/kaggle/working/lokr_output`** (чтобы сохранилось!).
   - Max Epochs: ~100 треков → 500; 10–20 → ~800.
   - Batch 1, gradient_accumulation 4, **gradient_checkpointing ON**.
   - **Start Training** → LoKr обычно ~5 мин.
5. **Использование:** перезапусти Gradio → загрузи файл LoRA/LoKr → генерируй 🎶

Подробный туториал: https://github.com/ace-step/ACE-Step-1.5/blob/main/docs/en/LoRA_Training_Tutorial.md

---

## 5. 💾 Сохранение обученной LoRA (важно — `/kaggle/temp` чистится!)

Выбери любой способ:
- **Простой:** сохраняй в `/kaggle/working/lokr_output` → после остановки ноутбука файлы останутся в Output, скачаешь их из вкладки Data/Output.
- **Скачать сразу:** через файл-менеджер студии или `from IPython.display import FileLink; FileLink('/kaggle/working/lokr_output/...')`.
- **В облако:** залей на HuggingFace (`huggingface_hub.upload_folder`) или сохрани как новый Kaggle Dataset (раздел 8).

---

## 6. 🪂 Запасной вариант: LoRA на 2B-модели (если XL даёт OOM)

2B-модель значительно легче и точно влезает в 16 ГБ. Запусти Gradio без `--config` (по умолчанию 2B turbo):
```python
subprocess.Popen(['python','app.py','--port','7860'])
```
Дальше все шаги LoRA идентичны. Минус — качество ниже XL, плюс — обучается быстрее и без OOM.

---

## 7. Траблшутинг

- **CUDA out of memory при обучении:** включи `gradient_checkpointing`, уменьши длину клипов, убери LM, перейди на BF16, и в крайнем случае — на 2B (раздел 6).
- **OOM при препроцессинге:** перезапусти Gradio без LM.
- **Сессия Kaggle завершилась (9 ч лимит / 12 ч GPU в неделю):** веса в `/kaggle/temp` удалятся — поэтому LoRA сразу сохраняй в `/kaggle/working` (раздел 5).
- **Авторские права:** обучай только на своих оригинальных треках.

---

## 8. 🔌 Kaggle API: загрузка датасета и сохранение LoRA

Чтобы не перезаливать треки вручную каждую сессию и не терять обученную LoRA, удобно использовать Kaggle API.

### Установка и ключ
1. Kaggle → **Settings / Account → API → Create New Token** → скачается `kaggle.json`.
2. На СВОЁМ ПК положи его в `~/.kaggle/kaggle.json` (Windows: `C:\Users\<имя>\.kaggle\kaggle.json`).
```bash
pip install kaggle
```

### Загрузить свои треки как приватный датасет (1 раз)
```bash
mkdir my_tracks && cp /путь/к/трекам/* my_tracks/
kaggle datasets init -p my_tracks            # создаст dataset-metadata.json
# в dataset-metadata.json отредактируй title и id: "<username>/ace-lora-tracks"
kaggle datasets create -p my_tracks          # первая загрузка (по умолчанию приватный)
# обновления потом:
kaggle datasets version -p my_tracks -m "update tracks"
```
В ноутбуке: **Add Input** → найди свой датасет → подключится в `/kaggle/input/ace-lora-tracks/`.

### Сохранить обученную LoRA как датасет
```bash
kaggle datasets init -p /kaggle/working/lokr_output
# правим id → "<username>/my-ace-lora", затем:
kaggle datasets create -p /kaggle/working/lokr_output
```

### Скачать на ПК
```bash
kaggle datasets download -d <username>/my-ace-lora
```

### ⚠️ Безопасность
`kaggle.json` = пароль к аккаунту. Не клади в репозиторий/публичные ноутбуки. Если засветился — Account → API → **Expire API Token** и создай новый.

---

## TL;DR
1. Kaggle → New Notebook → GPU P100 + Internet On.
2. Ячейки 1–4: установка движка + запуск `app.py --config acestep-v15-xl-turbo` + cloudflared.
3. Включи рычаги памяти (раздел 2): без LM, gradient_checkpointing, batch 1, короткие клипы, LoKr.
4. **LoRA Training**: датасет → Scan → препроцессинг → Train LoKr (output в `/kaggle/working`) → загрузить → генерировать.
5. Сохрани LoRA из `/kaggle/working` (раздел 5) или через Kaggle API (раздел 8). Если XL OOM → 2B (раздел 6).
