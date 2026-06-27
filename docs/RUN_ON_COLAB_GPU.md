# 🚀 Запуск на GPU через Google Colab (T4)

Этот вариант запускает **ace-step-ui** на бесплатном GPU NVIDIA T4 в Google Colab — генерация в десятки раз быстрее, чем на CPU.

## Открыть ноутбук

[![Open In Colab](https://colab.research.google.com/assets/colab-badge.svg)](https://colab.research.google.com/github/Landers125/ace-step-ui_CPU/blob/main/colab/ACE_Step_UI_GPU_T4.ipynb)

Или вручную загрузите файл `colab/ACE_Step_UI_GPU_T4.ipynb` на https://colab.research.google.com

## Как это работает
- Движок ACE-Step ставится с PyTorch + CUDA (T4, 16 ГБ VRAM).
- Frontend (Vite, порт 3000) проксирует `/api` и `/audio` на backend (порт 3001), поэтому наружу публикуется только один порт.
- Публичная ссылка выдаётся через `cloudflared` без регистрации: `https://<...>.trycloudflare.com`.
- Генерация идёт прямым вызовом Python-движка на GPU (`server/scripts/simple_generate.py`).

## Шаги
1. Откройте ноутбук в Colab (кнопка выше).
2. **Среда выполнения → Сменить среду выполнения → T4 GPU**.
3. Выполните ячейки по порядку (Shift+Enter).
4. Откройте публичную ссылку из последней ячейки.

## Ограничения
- Сессия Colab временная и отключается при простое — скачивайте треки сразу.
- Первая генерация скачивает веса модели (несколько ГБ).
- У бесплатного T4 есть суточные лимиты по времени.
