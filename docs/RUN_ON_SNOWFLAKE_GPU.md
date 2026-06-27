# 🎵 ACE-Step 1.5 XL + обучение LoRA на Snowflake (GPU A10G 24 ГБ)

Этот гайд поднимает **ACE-Step 1.5 XL (4B)** на бесплатных/триальных ресурсах **Snowflake** с GPU **NVIDIA A10G 24 ГБ** и позволяет **обучать свою LoRA** на собственном стиле.

> **Почему Snowflake A10G, а не Kaggle P100?**
> - **24 ГБ VRAM** (против 16 ГБ у P100) — комфортно тянет и генерацию XL, и обучение LoRA.
> - LoRA-обучению нужно **16 ГБ минимум, 20+ ГБ рекомендуется** (в пике ~17 ГБ) — на 16 ГБ P100 это уже впритык/OOM, а на 24 ГБ A10G нормально.
> - **Минус:** Snowflake платный (жжёт кредиты), но **триал даёт $400 на 30 дней** — этого хватит на ~200+ часов GPU.

---

## ⚠️ Важная архитектурная заметка

Для Snowflake мы запускаем **нативное Gradio-приложение ACE-Step** (`app.py`), а **не** React-интерфейс `ace-step-ui`.

Причина: вкладка **LoRA Training** (обучение LoRA в один клик) есть только в нативном Gradio-приложении. Оно делает и **генерацию**, и **обучение LoRA** в одном окне.

---

## 0. Что нам понадобится

- Аккаунт Snowflake (триал с $400 кредитов: https://signup.snowflake.com/ ). При регистрации в регионе **AWS eu-west-2 (London)** доступен инстанс `GPU_NV_S` (A10G).
- Права **ACCOUNTADMIN** — нужны, чтобы создать External Access Integration (для скачивания пакетов/моделей и публичного URL).
  - 💡 На триал-аккаунтах твой пользователь **по умолчанию уже ACCOUNTADMIN**.
  - Проверить: в Snowsight нажми на имя роли внизу слева — если в списке есть `ACCOUNTADMIN`, переключись на неё. Или выполни в SQL: `SELECT CURRENT_AVAILABLE_ROLES();`

---

## 1. Настройка доступа в интернет (SQL, один раз)

Открой в Snowsight **Worksheets → New SQL Worksheet** и выполни:

```sql
USE ROLE ACCOUNTADMIN;

-- 1) Правило сети: разрешаем исходящий трафик на любые хосты
--    (нужно для pip / HuggingFace / публичного туннеля)
CREATE OR REPLACE NETWORK RULE acestep_allow_all
  MODE = EGRESS
  TYPE = HOST_PORT
  VALUE_LIST = ('0.0.0.0:443', '0.0.0.0:80');

-- 2) External Access Integration на основе этого правила
CREATE OR REPLACE EXTERNAL ACCESS INTEGRATION acestep_eai
  ALLOWED_NETWORK_RULES = (acestep_allow_all)
  ENABLED = TRUE;

-- 3) Доступ к системному GPU-пулу (A10G) и к EAI для твоей роли
--    (на триале роль обычно ACCOUNTADMIN)
GRANT USAGE ON INTEGRATION acestep_eai TO ROLE ACCOUNTADMIN;
GRANT USAGE ON COMPUTE POOL SYSTEM_COMPUTE_POOL_GPU TO ROLE ACCOUNTADMIN;

-- 4) (опционально) стейдж для сохранения весов и обученных LoRA между сессиями
CREATE STAGE IF NOT EXISTS ACESTEP_STAGE
  ENCRYPTION = (TYPE = 'SNOWFLAKE_SSE');
```

> `SYSTEM_COMPUTE_POOL_GPU` = инстанс `GPU_NV_S` = **1× A10G 24 ГБ, 6 vCPU, 28 ГБ RAM, 450 ГБ NVMe**. Он есть в каждом аккаунте и доступен сразу для ноутбуков на Container Runtime — отдельный пул создавать не нужно.

---

## 2. Создание GPU-ноутбука (Notebooks on Container Runtime)

1. В Snowsight: **Notebooks → + Notebook**.
2. В диалоге создания:
   - **Runtime / Run on:** `Run on container` (Container Runtime).
   - **Compute type:** `GPU`.
   - **Compute pool:** `SYSTEM_COMPUTE_POOL_GPU (GPU_NV_S)`.
   - **External access integrations:** включи **`acestep_eai`** (созданный в шаге 1).
3. **Create** → дождись запуска контейнера (статус Active).

> На AWS GPU-ноутбуки используют быстрый NVMe-диск (~450 ГБ) — места под веса XL (~20 ГБ) хватает.

---

## 3. Ячейки ноутбука

> Каждая ячейка — Python. Команды оболочки запускаем через `!` или `%%bash`.

### Ячейка 1 — проверка GPU и ресурсов

```python
!nvidia-smi
!echo '--- RAM ---'; free -h
!echo '--- DISK ---'; df -h /
!python -c "import sys; print('Python', sys.version)"
!python -c "import torch; print('torch', torch.__version__, '| CUDA:', torch.cuda.is_available(), '|', torch.cuda.get_device_name(0))"
```

Ожидаем: `NVIDIA A10G`, `CUDA: True`, ~24 ГБ VRAM, ~28 ГБ RAM. ACE-Step требует **Python ≥ 3.11** — если в образе 3.10, см. примечание в конце.

### Ячейка 2 — системные зависимости (ffmpeg)

```python
# ffmpeg нужен для аудио. В Container Runtime ставим через conda (canал conda-forge)
import subprocess, shutil
if shutil.which('ffmpeg') is None:
    subprocess.run('conda install -y -c conda-forge ffmpeg', shell=True)
print('ffmpeg:', shutil.which('ffmpeg'))
```

### Ячейка 3 — клонирование движка и установка зависимостей

```python
import os
WORK = '/home/app/acestep'          # на NVMe контейнера
os.makedirs(WORK, exist_ok=True)
os.chdir(WORK)

# Клонируем нативный движок ACE-Step 1.5 (в нём есть Gradio app.py с LoRA Training)
if not os.path.isdir('ACE-Step-1.5'):
    !git clone https://github.com/ace-step/ACE-Step-1.5.git
os.chdir('ACE-Step-1.5')

# Ставим сам пакет БЕЗ зависимостей, чтобы не сломать предустановленный CUDA-torch
!pip install -e . --no-deps

# Доустанавливаем рантайм-зависимости (без torch!) — версии проверены под движок
!pip install --no-cache-dir \
  "transformers>=4.51.0,<4.58.0" "diffusers>=0.37.0" "accelerate>=1.12.0" \
  "huggingface_hub[hf_xet]>=0.34.0,<1.0" \
  "soundfile>=0.13.1" librosa soxr loguru einops scipy diskcache numba \
  "vector-quantize-pytorch>=1.27.15" pytorch-wavelets pywavelets toml modelscope matplotlib \
  gradio nano-vllm

!python -c "import torch,transformers; print('torch', torch.__version__, 'CUDA', torch.cuda.is_available(), '| transformers', transformers.__version__)"
```

> Если `nano-vllm` не ставится — пропусти его: для **обучения LoRA** языковая модель (LM) не нужна, а для генерации можно использовать PyTorch-бэкенд LM.

### Ячейка 4 — куда складывать модели (кэш HuggingFace на NVMe)

```python
import os
os.environ['HF_HOME'] = '/home/app/hf'      # большой NVMe-диск
os.environ['HF_HUB_ENABLE_HF_TRANSFER'] = '0'
os.makedirs('/home/app/hf', exist_ok=True)
print('HF_HOME =', os.environ['HF_HOME'])
```

`app.py --config acestep-v15-xl-turbo` сам докачает веса XL (~20 ГБ) с HuggingFace в этот кэш при первом запуске.

### Ячейка 5 — запуск Gradio + публичный URL (cloudflared)

```python
import os, subprocess, time, threading, urllib.request

WORK = '/home/app/acestep/ACE-Step-1.5'
os.chdir(WORK)
env = os.environ.copy()
env['HF_HOME'] = '/home/app/hf'

# 1) Скачиваем cloudflared (туннель для публичного URL)
if not os.path.exists('/home/app/cloudflared'):
    !wget -q -O /home/app/cloudflared https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64
    !chmod +x /home/app/cloudflared

# 2) Запускаем Gradio-приложение ACE-Step на порту 7860
#    --config задаёт DiT-модель: acestep-v15-xl-turbo = 4B XL turbo
#    (LM можно подгрузить позже в самом UI; для LoRA он не обязателен)
log = open('/home/app/gradio.log', 'w')
proc = subprocess.Popen(
    ['python', 'app.py', '--config', 'acestep-v15-xl-turbo', '--port', '7860'],
    cwd=WORK, env=env, stdout=log, stderr=subprocess.STDOUT
)
print('Gradio PID', proc.pid, '— ждём поднятия порта (модель XL качается ~5-15 мин при первом запуске)...')

# 3) Ждём, пока поднимется localhost:7860
for i in range(180):
    try:
        urllib.request.urlopen('http://localhost:7860', timeout=3); print('Gradio up!'); break
    except Exception:
        time.sleep(5)

# 4) Поднимаем cloudflared-туннель к 7860
cf = subprocess.Popen(['/home/app/cloudflared','tunnel','--url','http://localhost:7860','--no-autoupdate'],
                       stdout=open('/home/app/cf.log','w'), stderr=subprocess.STDOUT)
time.sleep(8)
!grep -o 'https://[-a-z0-9]*\.trycloudflare\.com' /home/app/cf.log | head -1
print('^ Открой этот URL. Если пусто — подожди и выполни ячейку 6.')
```

### Ячейка 6 — показать публичный URL и хвост логов

```python
!echo '--- PUBLIC URL ---'; grep -o 'https://[-a-z0-9]*\.trycloudflare\.com' /home/app/cf.log | head -1
!echo '--- gradio.log (хвост) ---'; tail -n 30 /home/app/gradio.log
```

---

## 4. Обучение LoRA — пошагово (во вкладке LoRA Training)

Открой публичный URL → нажми **Initialize Service** (загрузка модели в память). Внизу будут вкладки генерации и **LoRA Training**.

### Шаг 1. Подготовь датасет (свои оригинальные треки!)

Положи файлы в папку (например `/home/app/dataset/`) по схеме:

```
dataset/
├── song1.mp3            # аудио (.mp3/.wav/.flac/.ogg/.opus)
├── song1.lyrics.txt     # текст песни (или song1.txt)
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

- **Сколько треков:** 8–20 для стиля (можно больше). Качество важнее количества.
- **BPM/Key:** проще получить онлайн на https://vocalremover.org/key-bpm-finder → Export CSV → положить CSV в папку датасета.
- **Caption:** можно сгенерировать в UI (**Auto Label** через LM-модель acestep-5Hz-lm) или заполнить вручную.

### Шаг 2. Сканирование и разметка

1. Вкладка **LoRA Training** → впиши путь к папке датасета → **Scan**.
2. Проверь, что у треков есть тексты и captions (колонка **Labeled** = ✅).
3. При необходимости — **Auto Label** (нужна загруженная LM-модель), отредактируй записи, жми **Save** после каждой правки.
4. **Save Dataset** — экспорт в JSON.

### Шаг 3. Препроцессинг в тензоры

- Укажи путь сохранения тензоров → запусти препроцессинг.
- 💡 Если перед этим использовал LM для caption — **перезапусти Gradio без LM**, чтобы освободить VRAM, затем загрузи сохранённый JSON и сделай препроцессинг.

### Шаг 4. Обучение

Рекомендую **LoKr** (вкладка **Train LoKr**) — он в ~10 раз быстрее LoRA (минуты вместо часа) и отлично подходит под одну A10G.

1. Вкладка **Train LoRA** или **Train LoKr** → укажи путь к тензорам → загрузи.
2. Параметры (по умолчанию обычно ОК):
   - **Max Epochs:** ~100 треков → 500 эпох; 10–20 треков → ~800 эпох.
   - **Batch Size:** 1 (на 24 ГБ можно попробовать 2).
   - **gradient_checkpointing:** включи, если ловишь OOM (медленнее, но меньше VRAM).
   - **Save Every N Epochs:** 5.
3. **Start Training** → следи за кривой loss.

### Шаг 5. Использование обученной LoRA

1. **Перезапусти Gradio**, загрузи модель (без LM).
2. Подгрузи файл обученной LoRA/LoKr.
3. Генерируй музыку в своём стиле 🎶

### (Альтернатива) Обучение через REST API

Движок поднимает HTTP API на `localhost:8001`:

```bash
curl -X POST http://localhost:8001/v1/training/start_lokr \
  -H 'Content-Type: application/json' \
  -d '{
    "tensor_dir": "/home/app/tensors",
    "output_dir": "/home/app/lokr_output",
    "lokr_linear_dim": 64,
    "lokr_linear_alpha": 128,
    "lokr_factor": -1,
    "lokr_weight_decompose": true,
    "learning_rate": 0.03,
    "train_epochs": 500,
    "train_batch_size": 1,
    "gradient_accumulation": 4,
    "save_every_n_epochs": 5
  }'
```

(LoRA — эндпоинт `POST /v1/training/start` с полями rank/alpha/dropout.)

---

## 5. Сохранение между сессиями (важно!)

NVMe-диск контейнера **очищается при остановке ноутбука**. Чтобы не качать веса XL и не терять обученные LoRA — сохрани их в стейдж `ACESTEP_STAGE`:

```python
from snowflake.snowpark.context import get_active_session
session = get_active_session()

# Сохранить обученную LoRA в стейдж
session.file.put('/home/app/lokr_output/*', '@ACESTEP_STAGE/lora/', auto_compress=False, overwrite=True)

# В следующей сессии — скачать обратно
session.file.get('@ACESTEP_STAGE/lora/', '/home/app/lokr_output/')
```

---

## 6. Стоимость и экономия кредитов

- `GPU_NV_S` (A10G) стоит **примерно ~0.5–1 кредит/час** (точные цифры — в Snowflake Service Consumption Table: https://www.snowflake.com/legal-files/CreditConsumptionTable.pdf ). При ~$2–3/кредит это ~$1–2/час.
- Триал **$400** ≈ сотни часов GPU.
- **Обязательно** завершай сессию, когда не работаешь: в ноутбуке **End session** (через дропдаун подключения). Простаивающий пул всё равно жжёт кредиты.
- Можно задать автоусыпление пулу: `ALTER COMPUTE POOL SYSTEM_COMPUTE_POOL_GPU SET AUTO_SUSPEND_SECS = 600;`

---

## 7. Примечания и устранение проблем

- **Python < 3.11 в образе:** ACE-Step требует ≥3.11. Если в Container Runtime стоит 3.10 — создай conda-окружение: `conda create -y -n ace python=3.11 && conda activate ace`, затем переустанови torch под CUDA и повтори ячейку 3.
- **Туннель пустой:** подожди 10–20 сек и выполни ячейку 6 ещё раз; cloudflared печатает URL не мгновенно.
- **OOM при обучении:** включи `gradient_checkpointing`, уменьши длину треков/датасет, используй LoKr вместо LoRA.
- **OOM при препроцессинге:** перезапусти Gradio без LM-модели перед препроцессингом (LM съедает VRAM).
- **Авторские права:** обучай LoRA **только на своих оригинальных произведениях** или на материалах, на которые у тебя есть права.

---

## TL;DR

1. SQL (шаг 1): создать network rule + EAI + гранты.
2. Создать GPU-ноутбук на `SYSTEM_COMPUTE_POOL_GPU` с EAI `acestep_eai`.
3. Ячейки 1–6: поставить движок, запустить Gradio (`app.py --config acestep-v15-xl-turbo`), получить публичный URL.
4. Вкладка **LoRA Training** → датасет → Scan → препроцессинг → **Train LoKr** → загрузить LoRA → генерировать.
5. Сохранить LoRA в стейдж, **End session** для экономии кредитов.
