# Sakura Bakery

Статический сайт с рецептами. Для локального просмотра откройте `sakura_bakery.html` в браузере.

## Публикация на GitHub Pages

1. В настройках репозитория откройте **Settings → Pages**.
2. В разделе **Build and deployment → Source** выберите **GitHub Actions**.
3. Отправьте файлы в ветку `main`. Workflow `.github/workflows/pages.yml` автоматически опубликует сайт. Его также можно запустить вручную через **Actions → Deploy to GitHub Pages → Run workflow**.

Адрес сайта после успешной публикации: https://DeadRaaat.github.io/cookbook/

Workflow копирует `sakura_bakery.html` в `index.html` артефакта публикации. Исходный файл остаётся без изменений.
