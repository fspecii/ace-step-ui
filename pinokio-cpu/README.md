# ACE-Step UI (CPU) — Pinokio launcher

Запуск ACE-Step UI + движка ACE-Step 1.5 **только на CPU**, для ПК без дискретной видеокарты (например, AMD Ryzen 5 5600G со встроенной Radeon).

## Что делает
- Клонирует UI (`Landers125/ace-step-ui_CPU`) и движок `ACE-Step 1.5` в папку `app/`.
- Создаёт Python-окружение и ставит **CPU-сборку PyTorch** (`--index-url https://download.pytorch.org/whl/cpu`).
- Запускает ACE-Step API + бэкенд + фронтенд с принудительным CPU-режимом:
  `CUDA_VISIBLE_DEVICES=-1`, `HIP_VISIBLE_DEVICES=-1`, `ACESTEP_LM_BACKEND=pt`, `ACESTEP_INIT_LLM=false` (DiT-only под ~16 ГБ RAM), `ACESTEP_VAE_ON_CPU=1`.

## Как установить в Pinokio

Создание нового репозитория через ассистента заблокировано, поэтому пакет лежит в подпапке этого форка. Два способа подключить его к Pinokio:

**Способ A — локальная папка (без отдельного репозитория):**
1. Откройте папку Pinokio: `~/pinokio/api/` (на Windows обычно `C:\Users\<вы>\pinokio\api\`).
2. Создайте папку `ace-step-ui-cpu` и скопируйте в неё все файлы из `pinokio-cpu/` этого репозитория (`pinokio.js`, `pinokio.json`, `install.js`, `start.js`, `update.js`, `reset.js`).
3. Перезапустите Pinokio — приложение появится в списке. Нажмите **Install**, затем **Start**.

**Способ B — отдельный git-репозиторий (полноценный «1-click»):**
1. Создайте на GitHub новый репозиторий (например, `ace-step-ui-cpu.pinokio`).
2. Скопируйте в его КОРЕНЬ файлы из `pinokio-cpu/` (важно: `pinokio.js` должен лежать в корне репозитория).
3. В Pinokio: **Discover → Download from URL** → вставьте URL вашего репозитория → **Install** → **Start**.

## Требования
- Node.js 18+, Python 3.11, `uv` (`pip install uv`), Git, FFmpeg.

## Порты
- UI: http://127.0.0.1:3000
- Бэкенд: http://127.0.0.1:3001
- ACE-Step API: http://127.0.0.1:8001

## Скорость
Генерация идёт на CPU и медленная. Для скорости: Inference Steps ~20, Batch Size = 1, короткая длительность, Thinking/AI Enhance выключены.
