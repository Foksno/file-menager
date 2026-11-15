# file-menager

Prosty menedżer plików w przeglądarce: React SPA + trzy mikroserwisy w Express + WebSocket.

[Edit on StackBlitz ⚡️](https://stackblitz.com/edit/express-simple-cchjzf)

## Uruchomienie

```sh
npm install
npm start        # buduje frontend i uruchamia serwisy -> http://localhost:3000
npm run dev      # tryb developerski z Vite (hot reload) -> http://localhost:5173
npm test         # testy API (Jest + Supertest)
```

## Architektura

```
przeglądarka (React SPA)
      │  HTTP /api/*  +  WebSocket (socket.io)
      ▼
gateway :3000 ── serwuje client/dist, proxy, emituje "changed" po każdej zmianie
      │ /api/activity            │ /api/*
      ▼                          ▼
activity-service :3002 ◄──── files-service :3001 ── operacje na katalogu upload/
  (historia zmian)   POST /activity
```

| Katalog | Rola |
|---|---|
| `client/` | React (Vite): komponenty `Toolbar`, `Breadcrumbs`, `FileGrid`, `NameDialog`, `TextEditor`, `ActivityPanel` |
| `services/files-service/` | REST API na plikach, walidacja ścieżek i nazw, testy |
| `services/activity-service/` | historia ostatnich 50 operacji (w pamięci) |
| `services/gateway/` | jeden punkt wejścia: statyczny frontend, proxy, WebSocket |
| `upload/` | pliki użytkownika |

## REST API (files-service)

| Metoda | Adres | Opis |
|---|---|---|
| GET | `/api/list?path=a/b` | zawartość folderu |
| POST | `/api/folder` `{path, name}` | nowy folder |
| POST | `/api/file` `{path, name}` | nowy plik `.txt` |
| POST | `/api/upload?path=a/b` (multipart `files`) | wysyłanie plików |
| PATCH | `/api/rename` `{path, oldName, newName}` | zmiana nazwy |
| DELETE | `/api/item?path=&name=` | usunięcie pliku/folderu |
| GET | `/api/content?path=&name=` | treść pliku tekstowego |
| PUT | `/api/content` `{path, name, text}` | zapis pliku tekstowego |
| GET | `/api/download?path=&name=` | pobranie pliku |

Błędy zwracane są jako `{ "error": "..." }` z odpowiednim kodem (400, 404, 409, 413).

## Powiązanie z efektami uczenia się

| Efekt | Gdzie w projekcie |
|---|---|
| W1 HTML5, CSS3 | `client/index.html`, `client/src/styles.css` (grid, flex, `<dialog>`, media queries) |
| W2 JavaScript | cały projekt: Node.js + przeglądarka, `async/await`, moduły |
| W3, U1 komponenty | `client/src/components/*` |
| W4, U1 SPA | nawigacja przez `#/ścieżka`, dane przez `fetch`, bez przeładowań |
| U2 asynchroniczność, WebSockety | `client/src/api.js`, socket.io w `gateway` i `App.jsx` |
| W5, U3 mikroserwisy | `services/*` - trzy niezależne procesy komunikujące się po HTTP |
| HTTP/REST | API powyżej |
| testowanie | `services/*/test/*.test.js` |
