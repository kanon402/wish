# Pastebin

Один `index.html`, без сборки. Телефон → комп (и обратно) через приватный Gist.

## Запуск
1. Создай репо (например `pastebin`) и запушь туда `index.html`.
2. Settings → Pages → Deploy from branch → `main` / root.
3. Создай токен (classic) со scope **gist**: https://github.com/settings/tokens/new?scopes=gist&description=pastebin
4. Открой `https://<user>.github.io/pastebin/` и вставь токен. Gist `pastebin-data` создастся сам.
5. На телефоне открой `https://<user>.github.io/pastebin/#token=ТОКЕН` — войдёт и сотрёт токен из адреса.

Токен хранится только в localStorage браузера; страница ходит напрямую в api.github.com.
