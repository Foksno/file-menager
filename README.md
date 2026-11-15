# file-menager

Prosty menedżer plików w przeglądarce: React SPA + cztery mikroserwisy w Express + PostgreSQL + WebSocket.
Każdy użytkownik ma własne konto i widzi tylko swoje pliki.

[Edit on StackBlitz ⚡️](https://stackblitz.com/edit/express-simple-cchjzf)

## Uruchomienie

Wymagany Node.js 22+ i PostgreSQL.

```sh
npm install
# 1. utwórz bazę (tabele powstaną same przy starcie):
#    psql -U postgres -c "CREATE DATABASE filemenager"
# 2. skopiuj .env.example do .env i uzupełnij DATABASE_URL oraz AUTH_SECRET
npm start        # buduje frontend i uruchamia serwisy -> http://localhost:3000
npm run dev      # tryb developerski z Vite (hot reload) -> http://localhost:5173
npm test         # testy API (Jest + Supertest, baza w pamięci pg-mem - bez PostgreSQL)
npm run import -- <login>   # jednorazowo: pliki z katalogu upload/ na konto <login>
```

## Wdrożenie: Render (aplikacja) + Neon (baza)

Wszystkie cztery serwisy działają w jednym kontenerze (`npm run services`), na zewnątrz wystawiony jest tylko gateway.

**1. Baza: [neon.tech](https://neon.tech)**
- załóż projekt (region np. *Frankfurt*), skopiuj *Connection string*
  (`postgresql://...neon.tech/neondb?sslmode=require...`)
- tabele utworzą się same przy pierwszym starcie aplikacji

**2. Aplikacja: [render.com](https://render.com)** → *New → Web Service* → podłącz repozytorium z GitHuba

| Pole | Wartość |
|---|---|
| Runtime | Node |
| Build Command | `npm ci --include=dev && npm run build` |
| Start Command | `npm run services` |
| Instance Type | Free |

Zmienne środowiskowe (*Environment*):

| Zmienna | Wartość |
|---|---|
| `DATABASE_URL` | connection string z Neona |
| `AUTH_SECRET` | długi losowy ciąg: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` |
| `NODE_ENV` | `production` |
| `PORT` | `10000` |

Uwagi:
- `--include=dev` jest potrzebne, bo Vite (budowanie frontendu) jest w `devDependencies`, a przy `NODE_ENV=production` npm by go pominął.
- Darmowa instancja usypia po ~15 min bez ruchu - pierwsze wejście potem trwa ok. minuty.
- Historia zmian (activity-service) jest w pamięci, więc znika przy uśpieniu. Pliki i konta są w bazie i zostają.
- Pliki zajmują miejsce w bazie - darmowy Neon ma ograniczoną pojemność.

## Architektura

```
przeglądarka (React SPA)
      │  HTTP /api/*  +  WebSocket (socket.io)   ciasteczko "token" (sesja)
      ▼
gateway :3000 ── serwuje client/dist, proxy, emituje "changed" do kart danego użytkownika
      │ /api/auth           │ /api/activity (GET)        │ /api/*
      ▼                     ▼                            ▼
auth-service :3003   activity-service :3002 ◄──── files-service :3001
  (konta, sesje)       (historia zmian)  POST /activity       │
      │                                                       │
      └────────────────────► PostgreSQL ◄─────────────────────┘
                     tabele users, items (pliki w BYTEA)
```

| Katalog | Rola |
|---|---|
| `client/` | React (Vite): `LoginPage`, `FileManager` i komponenty `Toolbar`, `Breadcrumbs`, `FileGrid`, `NameDialog`, `TextEditor`, `ActivityPanel` |
| `services/auth-service/` | rejestracja, logowanie (hasła: scrypt + sól), wylogowanie |
| `services/files-service/` | REST API na plikach w bazie, walidacja ścieżek i nazw, testy |
| `services/activity-service/` | historia ostatnich 50 operacji każdego użytkownika (w pamięci) |
| `services/gateway/` | jeden punkt wejścia: statyczny frontend, proxy, WebSocket |
| `services/shared/` | schemat bazy, połączenie z PostgreSQL, podpisywanie i weryfikacja sesji |
| `scripts/import-upload.js` | przeniesienie plików z dysku do bazy |

### Baza danych

- `users` - `login` (unikalny, małe litery), `password_hash` (`sól:skrót` scrypt - hasło nie jest zapisywane).
- `items` - drzewo folderów i plików: `owner_id`, `parent_id`, `name`, `is_folder`, `data` (BYTEA), `size`, `mtime`.
  Każdy użytkownik ma folder główny (`parent_id = NULL`), `UNIQUE (parent_id, name)` pilnuje nazw,
  a `ON DELETE CASCADE` usuwa folder razem z zawartością.

### Sesja

Po zalogowaniu auth-service ustawia ciasteczko `token` (`HttpOnly`, `SameSite=Lax`, 7 dni) z id użytkownika
podpisanym HMAC-SHA256 kluczem `AUTH_SECRET`. Pozostałe serwisy weryfikują podpis samodzielnie - nie muszą pytać auth-service.

## REST API (auth-service)

| Metoda | Adres | Opis |
|---|---|---|
| POST | `/api/auth/register` `{login, password}` | nowe konto + zalogowanie |
| POST | `/api/auth/login` `{login, password}` | logowanie |
| POST | `/api/auth/logout` | wylogowanie |
| GET | `/api/auth/me` | zalogowany użytkownik albo 401 |

## REST API (files-service)

Wszystkie adresy wymagają zalogowania (inaczej 401) i działają tylko na plikach zalogowanego użytkownika.

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

Błędy zwracane są jako `{ "error": "..." }` z odpowiednim kodem (400, 401, 404, 409, 413).

## Powiązanie z efektami uczenia się

| Efekt | Gdzie w projekcie |
|---|---|
| W1 HTML5, CSS3 | `client/index.html`, `client/src/styles.css` (grid, flex, `<dialog>`, media queries) |
| W2 JavaScript | cały projekt: Node.js + przeglądarka, `async/await`, moduły |
| W3, U1 komponenty | `client/src/components/*` |
| W4, U1 SPA | nawigacja przez `#/ścieżka`, dane przez `fetch`, bez przeładowań |
| U2 asynchroniczność, WebSockety | `client/src/api.js`, socket.io w `gateway` i `App.jsx` |
| W5, U3 mikroserwisy | `services/*` - cztery niezależne procesy komunikujące się po HTTP |
| bazy danych | PostgreSQL: `services/shared/db.js`, zapytania w `services/*/app.js` |
| uwierzytelnianie | `services/auth-service`, `services/shared/auth.js`, `client/src/components/LoginPage.jsx` |
| HTTP/REST | API powyżej |
| testowanie | `services/*/test/*.test.js` |
