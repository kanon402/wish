# Pastebin

Один `index.html`, без сборки. Телефон → комп (и обратно) через приватный Gist.

## Запуск
1. Запушь `index.html` в репо, включи Pages (Settings → Pages → `main` / root).
2. Создай токен (classic) со scope **gist**: https://github.com/settings/tokens/new?scopes=gist&description=pastebin
3. Открой сайт: пока нет `config.js`, покажется форма настройки. Введи токен и PIN → получишь текст для `config.js`. Закоммить его в корень репо.
4. Дальше на любом устройстве достаточно PIN-кода (устройство запоминается, «⚙» — выйти).

Токен лежит в `config.js` зашифрованным PIN-ом (PBKDF2 600k + AES-GCM). 4-значный PIN можно перебрать офлайн, поэтому лучше завести отдельный GitHub-аккаунт только под pastebin.

Файлы (до 10 МБ): кнопка 📎, drag&drop или вставка из буфера; хранятся в base64 во втором приватном Gist `pastebin-files`.

Расшифрованный токен хранится только в localStorage браузера; страница ходит напрямую в api.github.com.
