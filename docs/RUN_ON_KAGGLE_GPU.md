# 🎵 ACE-Step — Kaggle (GPU P100) + наш full-param веб-интерфейс

Запуск движка **ACE-Step** на бесплатном GPU Kaggle вместе с нашим **full-param Flask-интерфейсом** (`webui/app.py`, ~46 параметров). Всё работает на Kaggle — **на ПК ничего ставить не нужно**, интерфейс открывается в браузере по ссылке `*.trycloudflare.com`.

Готовый ноутбук: [`kaggle/ACE_Step_API_Backend_Kaggle.ipynb`](../kaggle/ACE_Step_API_Backend_Kaggle.ipynb) — можно сразу импортировать в Kaggle (*File → Import Notebook*).

**Преимущество Kaggle:** ~29 ГБ RAM (против 12 у Colab), поэтому большая модель **XL (4B)** грузится без OOM и без патчей движка.

## 🧩 Архитектура (как «прикручен» наш бэкенд)
- **Движок** ACE-Step поднимает свой **REST API** (`acestep-api`) на `:8001`.
- **Наш Flask-интерфейс** (`webui/app.py`) запускается на `:5000` и обращается к движку по `http://localhost:8001` (переменная `ACE_BASE_URL`).
- Наружу через **cloudflared** туннелируется именно `:5000` → открываешь в браузере полноценный UI со всеми параметрами.

## 🖥️ Какую GPU выбрать — **P100**
- Движок работает на **одной** GPU (без мультиGPU-шардинга), поэтому в режиме **T4 x2 вторая карта простаивает** — толку от двух T4 нет.
- P100 (16 ГБ, ~732 ГБ/с) против одной T4 (16 ГБ, ~320 ГБ/с): диффузия упирается в пропускную способность памяти, у P100 она вдвое выше → генерация быстрее.
- 16 ГБ VRAM хватает: XL в fp16 занимает ~10 ГБ.

## Подготовка (один раз)
1. Нужен аккаунт Kaggle с **подтверждённым телефоном** — иначе не включить Интернет и GPU.
2. **Create → New Notebook** (или импортируйте готовый `.ipynb`, ссылка выше).
3. Панель справа → **Settings → Accelerator → GPU P100**.
4. **Settings → Internet → On** (обязательно).
5. Выполняйте ячейки сверху вниз (Shift+Enter).
6. В конце откройте публичную ссылку `*.trycloudflare.com` в браузере.

## 🎯 Выбор модели (ячейка 3, переменная `DIT_MODEL`)
- `acestep-v15-turbo` — 2B, быстрая (8 шагов), качается автоматически.
- `acestep-v15-xl-turbo` — **XL 4B, макс. качество при 8 шагах**.
- `acestep-v15-xl-sft` — XL 4B, 50 шагов + CFG (абсолютный максимум, медленно).

> ⚠️ **Важно про диск:** `/kaggle/working` ограничена ~20 ГБ (Output). Веса XL (~20 ГБ) туда не влезают, поэтому ячейка 3 качает их в `/kaggle/temp` (scratch ~50–60 ГБ) и подключает через симлинк.

---

### 0) Проверка GPU и RAM
```python
!nvidia-smi
!free -h
```

### 1) Системные пакеты + cloudflared (Node больше не нужен — UI на Python)
```python
!apt-get install -y ffmpeg > /dev/null 2>&1
# cloudflared ставим прямым бинарником в /usr/local/bin (dpkg на Kaggle часто падает из-за зависимостей → `cloudflared: command not found`)
!wget -q https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64 -O /usr/local/bin/cloudflared
!chmod +x /usr/local/bin/cloudflared
!cloudflared --version
```
> Если ранее видели `cloudflared: command not found` — это как раз из-за старого `dpkg`-способа; теперь бинарник кладётся напрямую в PATH.

### 2) Клонирование репо + установка движка и зависимостей
```python
%cd /kaggle/working
![ -d ace-step-ui_CPU ] || git clone -q https://github.com/Landers125/ace-step-ui_CPU.git
![ -d ACE-Step-1.5 ] || git clone -q https://github.com/ace-step/ACE-Step-1.5.git
%cd /kaggle/working/ACE-Step-1.5
!pip install -q -e . --no-deps
!pip install -q -e acestep/third_parts/nano-vllm --no-deps
!pip install -q "transformers>=4.51.0,<4.58.0" "diffusers>=0.37.0" "accelerate>=1.12.0" "soundfile>=0.13.1" loguru einops scipy "vector-quantize-pytorch>=1.27.15" diskcache numba pytorch-wavelets pywavelets toml modelscope matplotlib librosa soxr python-dotenv
!pip install -q fastapi "uvicorn[standard]" flask requests
import torch; print('torch', torch.__version__, '| CUDA:', torch.cuda.is_available())
```
> `nano-vllm` нет в PyPI — он лежит локально в репозитории движка (`acestep/third_parts/nano-vllm`), поэтому ставим его отдельно через `-e`. Предупреждения pip про `lightning`/`gradio`/`torchao` — нормально (движок ставим с `--no-deps`). Главное — `CUDA: True`.
> Если `CUDA: False`: `!pip install -q --force-reinstall torch torchaudio --index-url https://download.pytorch.org/whl/cu121`

### 3) Выбор и скачивание модели (веса XL → /kaggle/temp через симлинк)
```python
import os, shutil, subprocess, sys
DIT_MODEL = 'acestep-v15-xl-turbo'   # или 'acestep-v15-turbo' (2B)

shutil.rmtree('/kaggle/working/ACE-Step-1.5/checkpoints', ignore_errors=True)
SCRATCH = '/kaggle/temp/checkpoints'; os.makedirs(SCRATCH, exist_ok=True)
LINK = '/kaggle/working/ACE-Step-1.5/checkpoints'
if os.path.islink(LINK):
    os.remove(LINK)
elif os.path.exists(LINK):
    shutil.rmtree(LINK)
os.symlink(SCRATCH, LINK)
print('checkpoints ->', os.path.realpath(LINK))

_t,_u,_f = shutil.disk_usage('/kaggle/temp'); print('scratch free: %.1f GB' % (_f/1e9))

XL_REPOS = {
  'acestep-v15-xl-turbo': 'ACE-Step/acestep-v15-xl-turbo',
  'acestep-v15-xl-base':  'ACE-Step/acestep-v15-xl-base',
  'acestep-v15-xl-sft':   'ACE-Step/acestep-v15-xl-sft',
}
if DIT_MODEL in XL_REPOS:
    subprocess.run([sys.executable,'-m','pip','install','-q','-U','huggingface_hub[hf_xet]','hf_xet'], check=False)
    from huggingface_hub import snapshot_download
    dest = os.path.join(LINK, DIT_MODEL)
    print('Скачиваю', XL_REPOS[DIT_MODEL], '->', os.path.realpath(dest))
    snapshot_download(repo_id=XL_REPOS[DIT_MODEL], local_dir=dest, max_workers=4)
    subprocess.run([sys.executable,'-m','pip','install','-q','huggingface_hub>=0.34.0,<1.0'], check=False)
    print('Готово, файлов:', len(os.listdir(dest)))
else:
    print('2B-модель скачается автоматически при первой генерации.')
```

### 4) Запуск REST API движка (порт 8001)
```python
import subprocess, os, time
ENGINE = '/kaggle/working/ACE-Step-1.5'
e = os.environ.copy()
e['ACESTEP_API_HOST'] = '0.0.0.0'
e['ACESTEP_API_PORT'] = '8001'
e['ACESTEP_NO_INIT'] = 'true'   # ленивая загрузка: модель грузится при первом запросе (выбранная в UI)
subprocess.Popen('acestep-api > /kaggle/working/engine.log 2>&1', shell=True, cwd=ENGINE, env=e)
print('REST API движка стартует на :8001, ждём ~40 сек...'); time.sleep(40)
!tail -n 25 /kaggle/working/engine.log
```
> `acestep-api` читает `ACESTEP_API_HOST`/`ACESTEP_API_PORT`. `ACESTEP_NO_INIT=true` экономит VRAM: дефолтная 2B не грузится перед XL. LLM (chain-of-thought) по умолчанию выключен — это и быстрее, и без риска segfault на новых torch.
> Ждём строку `Uvicorn running on http://0.0.0.0:8001`. Если ещё грузится — повторите `!tail`.

### 5) Запуск нашего full-param интерфейса (порт 5000)
```python
import subprocess, os, time
UI = '/kaggle/working/ace-step-ui_CPU/webui'
e = os.environ.copy()
e['ACE_BASE_URL'] = 'http://localhost:8001'
e['PORT'] = '5000'
subprocess.Popen('python app.py > /kaggle/working/webui.log 2>&1', shell=True, cwd=UI, env=e)
print('Веб-интерфейс стартует на :5000, ждём 8 сек...'); time.sleep(8)
!tail -n 15 /kaggle/working/webui.log
```

### 6) Публичный туннель cloudflared (порт 5000)
```python
import subprocess, time, re
subprocess.Popen('cloudflared tunnel --url http://localhost:5000 --no-autoupdate > /kaggle/working/cf.log 2>&1', shell=True)
url=None
for _ in range(40):
    time.sleep(2)
    try: log=open('/kaggle/working/cf.log').read()
    except Exception: log=''
    m=re.search('https://[a-z0-9-]+[.]trycloudflare[.]com', log)
    if m: url=m.group(0); break
print('ОТКРОЙ В БРАУЗЕРЕ:', url or 'см. /kaggle/working/cf.log')
```

---

## ✅ Готово
- Открой ссылку `https://....trycloudflare.com` из ячейки 6 **в браузере** — это и есть наш full-param интерфейс.
- В интерфейсе выбери модель `acestep-v15-xl-turbo` (или `acestep-v15-turbo` для скорости).
- XL качает ~20 ГБ весов в ячейке 3; на ~29 ГБ RAM грузится без OOM.
- На P100 (16 ГБ VRAM) для XL держите **Batch Size = 1**, длительность 30–120 сек.
- Логи: `!tail -n 60 /kaggle/working/engine.log` (движок) и `!tail -n 60 /kaggle/working/webui.log` (интерфейс).
- ⚠️ Веса XL лежат в `/kaggle/temp` (scratch, не входит в лимит Output), но **он очищается при завершении сессии** — XL придётся качать заново при каждом новом запуске (либо сохраните их в приватный Kaggle Dataset).

> 💡 Если нужен старый вариант с React-интерфейсом `ace-step-ui` (Node на :3000), смотрите историю git этого файла — текущая версия настроена на наш Python-бэкенд `webui/app.py`.
