# Filemenager

Menedżer plików działający w przeglądarce, coś jak bardzo uproszczony Dysk Google.
Każdy użytkownik zakłada konto, a potem w swojej przestrzeni może tworzyć foldery, wysyłać i pobierać pliki,
edytować pliki tekstowe i śledzić historię zmian. Widok odświeża się na żywo we wszystkich otwartych kartach.

Projekt na przedmiot **Wprowadzenie do aplikacji internetowych** (AGH, WIINFS.Ii4.08695.25).
Cały stos jest w JavaScripcie: **React** (SPA) po stronie przeglądarki,
**Node.js + Express** w czterech mikroserwisach, **PostgreSQL** jako baza danych i **WebSocket** (socket.io) do odświeżania na żywo.

---

## Spis treści

1. [Co potrafi aplikacja](#co-potrafi-aplikacja)
2. [Jak działa aplikacja](#jak-działa-aplikacja)
3. [Struktura projektu](#struktura-projektu)
4. [REST API](#rest-api)
5. [Testy](#testy)
6. [Uruchomienie lokalne](#uruchomienie-lokalne)
7. [Wdrożenie: Render + Neon](#wdrożenie-render--neon)

---

## Co potrafi aplikacja

| Funkcja | Opis |
|---|---|
| Konta użytkowników | rejestracja, logowanie i wylogowanie; sesja trwa 7 dni |
| Prywatne pliki | każdy użytkownik widzi tylko swoje pliki i foldery |
| Foldery | tworzenie, zagnieżdżanie, zmiana nazwy, usuwanie razem z zawartością |
| Pliki | wysyłanie wielu plików naraz (do 50 MB każdy), pobieranie, zmiana nazwy, usuwanie |
| Edytor tekstu | tworzenie plików `.txt` oraz podgląd i edycja plików tekstowych (`.txt`, `.md`, `.json`, `.js`, `.css`, `.html`, `.csv`…) |
| Nawigacja | ścieżka okruszkowa (breadcrumbs) nad listą; przyciski *Wstecz* i *Dalej* w przeglądarce działają |
| Kolizje nazw | przy powtórzonej nazwie aplikacja dopisuje numer zamiast nadpisywać: `plik(1).txt`, `folder(2)` |
| Historia zmian | panel *Ostatnie zmiany* z ostatnimi operacjami użytkownika |
| Odświeżanie na żywo | zmiana zrobiona w jednej karcie pojawia się od razu we wszystkich kartach tego użytkownika |
| Wersja na telefon | układ dopasowuje się do wąskiego ekranu |

---

## Jak działa aplikacja

### Architektura

Aplikacja składa się z frontendu (SPA w React) i czterech niezależnych serwisów. Każdy serwis to osobny proces Node.js
na własnym porcie, z jedną odpowiedzialnością. Przeglądarka rozmawia tylko z **gatewayem**, a ten przekazuje
zapytania dalej.

```
                   przeglądarka - React SPA
                          │
                          │  HTTP /api/*  +  WebSocket (socket.io)
                          │  ciasteczko "token" = sesja
                          ▼
   gateway :3000  ─ wydaje zbudowany frontend (client/dist)
                  ─ przekazuje zapytania do właściwego serwisu (reverse proxy)
                  ─ po każdej zmianie wysyła przez WebSocket zdarzenie "changed"
          │                    │                          │
          │ /api/auth          │ /api/activity (GET)      │ /api/*
          ▼                    ▼                          ▼
   auth-service :3003   activity-service :3002 ◄──── files-service :3001
   konta i sesje        historia zmian       POST     operacje na plikach
          │                                  /activity    │
          │                                               │
          └──────────────────► PostgreSQL ◄───────────────┘
                     tabele users (konta) i items (foldery i pliki)
```

| Serwis | Port | Zadanie |
|---|---|---|
| **gateway** | 3000 | jedyny punkt wejścia: wydaje frontend, przekierowuje `/api/*` do serwisów, utrzymuje połączenia WebSocket |
| **auth-service** | 3003 | rejestracja i logowanie, hashowanie haseł, wydawanie sesji (ciasteczko) |
| **files-service** | 3001 | całe REST API plików: lista, tworzenie, upload, pobieranie, edycja, zmiana nazwy, usuwanie |
| **activity-service** | 3002 | przechowuje ostatnie 50 operacji każdego użytkownika |

Serwisy nie dzielą pamięci i komunikują się wyłącznie przez HTTP. Awaria jednego nie wyłącza pozostałych.
Na przykład gdy activity-service nie działa, operacje na plikach dalej się wykonują, a w panelu historii pojawia się
komunikat *Serwis historii niedostępny*.

### Przykład: co się dzieje po wysłaniu pliku

1. Użytkownik wybiera pliki przyciskiem **⬆ wyślij pliki**. Komponent `Toolbar` przekazuje je do `FileManager`,
   który wywołuje `api.upload()` (`client/src/api.js`). Przeglądarka wysyła `POST /api/upload?path=docs` jako
   `multipart/form-data` i automatycznie dołącza ciasteczko sesji.
2. **gateway** rozpoznaje adres `/api/*` i przekazuje zapytanie do **files-service**.
3. **files-service**:
   - sprawdza podpis ciasteczka i ustala, kto wysyła plik (`requireUser`);
   - zamienia ścieżkę `docs` na id folderu w bazie, ale szuka go tylko wśród folderów tego użytkownika;
   - odbiera pliki do pamięci (biblioteka `multer`), w razie kolizji nadaje nazwę z numerem i zapisuje zawartość do kolumny `BYTEA`;
   - wysyła zdarzenie `{userId, action: 'upload', ...}` do **activity-service**;
   - odpowiada `201 {names: [...]}`.
4. **gateway** widzi udaną odpowiedź na zapytanie zmieniające dane i przez WebSocket wysyła zdarzenie `changed`
   do wszystkich kart **tego samego użytkownika** (pokój socket.io `user:<id>`).
5. W każdej karcie `FileManager` po otrzymaniu `changed` zwiększa licznik `version`. To uruchamia ponowne pobranie
   listy plików i historii, a React przerysowuje tylko to, co się zmieniło. Strona się nie przeładowuje.

### Logowanie i sesja

1. Formularz `LoginPage` wysyła `POST /api/auth/login` (albo `/register`) z loginem i hasłem.
2. **auth-service** porównuje hasło ze skrótem w bazie (`scrypt` z losową solą; samo hasło nigdy nie jest zapisywane).
3. Po poprawnym logowaniu odsyła ciasteczko `token`. Zawiera ono id i login użytkownika, datę ważności oraz
   **podpis HMAC-SHA256** kluczem `AUTH_SECRET`. Ciasteczko ma flagi:
   - `HttpOnly`: JavaScript na stronie go nie odczyta, co chroni przed kradzieżą przez XSS;
   - `SameSite=Lax`: inne strony nie wyślą w Twoim imieniu zmieniających zapytań (CSRF);
   - `Secure` na produkcji: wysyłane tylko przez HTTPS.
4. Każdy serwis **samodzielnie** sprawdza podpis (`services/shared/auth.js`), bez odpytywania auth-service.
   To typowe podejście w mikroserwisach, bo nie ma jednego wąskiego gardła. Podrobienie lub zmiana tokenu kończy się błędem 401.
5. Gdy sesja wygaśnie w trakcie pracy, pierwsze zapytanie dostaje 401 i aplikacja sama wraca do ekranu logowania.

### Baza danych

```sql
users (id, login UNIQUE, password_hash, created_at)

items (id,
       owner_id  → users(id)  ON DELETE CASCADE,   -- właściciel
       parent_id → items(id)  ON DELETE CASCADE,   -- folder nadrzędny
       name, is_folder, data BYTEA, size, mtime,
       UNIQUE (parent_id, name))
```

- Foldery i pliki tworzą **drzewo** w jednej tabeli. Każdy użytkownik ma niewidoczny folder główny (`parent_id = NULL`).
- `UNIQUE (parent_id, name)` gwarantuje, że w folderze nie ma dwóch elementów o tej samej nazwie, nawet gdy dwa zapytania przyjdą jednocześnie.
- `ON DELETE CASCADE` sprawia, że usunięcie folderu jednym zapytaniem `DELETE` usuwa całą jego zawartość.
- Każde zapytanie filtruje po `owner_id`, więc nie da się dostać do cudzego pliku, nawet znając jego nazwę i ścieżkę.
- Tabele tworzą się automatycznie przy starcie (`services/shared/db.js`).

### Bezpieczeństwo w skrócie

| Zagrożenie | Zabezpieczenie |
|---|---|
| wyciek haseł z bazy | `scrypt` + losowa sól, porównanie w stałym czasie (`timingSafeEqual`) |
| podrobienie sesji | podpis HMAC-SHA256; na produkcji aplikacja nie wystartuje bez `AUTH_SECRET` |
| dostęp do cudzych plików | `owner_id` w każdym zapytaniu SQL |
| SQL injection | wyłącznie zapytania parametryzowane (`$1, $2…`) |
| niebezpieczne nazwy i ścieżki (`..`, `/`, `<>`…) | walidacja w `services/files-service/paths.js` |
| dopisywanie fałszywej historii z zewnątrz | gateway przepuszcza do activity-service tylko `GET` |
| przechwycenie danych w drodze | HTTPS na hostingu, połączenie z bazą w chmurze przez SSL |

---

## Struktura projektu

```
client/                         frontend (React + Vite)
  index.html                    jedyna strona HTML (SPA)
  src/
    main.jsx                    punkt startowy React
    App.jsx                     logowanie albo menedżer plików
    FileManager.jsx             główny widok
    api.js                      wszystkie wywołania REST API
    paths.js                    routing w hashu, formatowanie
    styles.css                  style
    components/                 LoginPage, Toolbar, Breadcrumbs, FileGrid,
                                NameDialog, TextEditor, ActivityPanel
services/
  gateway/index.js              proxy + WebSocket + frontend
  auth-service/                 konta i sesje        (app.js, index.js, test/)
  files-service/                pliki w bazie        (app.js, paths.js, index.js, test/)
  activity-service/             historia zmian       (app.js, index.js, test/)
  shared/
    auth.js                     podpisywanie i weryfikacja sesji
    db.js                       schemat bazy i połączenie z PostgreSQL
    test-db.js                  baza w pamięci do testów
.env.example                    wzór konfiguracji
```

---

## REST API

Przez gateway: `http://localhost:3000`. Błędy zawsze mają postać `{ "error": "opis po polsku" }`.

### Konta (auth-service)

| Metoda | Adres | Opis |
|---|---|---|
| POST | `/api/auth/register` `{login, password}` | nowe konto i od razu zalogowanie (201, 409 gdy login zajęty) |
| POST | `/api/auth/login` `{login, password}` | logowanie (200 lub 401) |
| POST | `/api/auth/logout` | wylogowanie (204) |
| GET | `/api/auth/me` | dane zalogowanego użytkownika albo 401 |

### Pliki (files-service)

Wymagają zalogowania (inaczej 401) i działają tylko na plikach zalogowanego użytkownika.
`path` to ścieżka folderu, np. `zdjęcia/wakacje` (pusta oznacza folder główny).

| Metoda | Adres | Opis |
|---|---|---|
| GET | `/api/list?path=` | zawartość folderu: `{path, folders[], files[]}` |
| POST | `/api/folder` `{path, name}` | nowy folder |
| POST | `/api/file` `{path, name}` | nowy pusty plik `.txt` |
| POST | `/api/upload?path=` (multipart, pole `files`) | wysyłanie plików |
| PATCH | `/api/rename` `{path, oldName, newName}` | zmiana nazwy (409 gdy nazwa zajęta) |
| DELETE | `/api/item?path=&name=` | usunięcie pliku albo folderu z zawartością |
| GET | `/api/content?path=&name=` | treść pliku tekstowego (413 gdy > 1 MB) |
| PUT | `/api/content` `{path, name, text}` | zapis pliku tekstowego |
| GET | `/api/download?path=&name=` | pobranie pliku |

### Historia (activity-service)

| Metoda | Adres | Opis |
|---|---|---|
| GET | `/api/activity` | ostatnie 50 operacji zalogowanego użytkownika |

---

## Testy

```sh
npm test
```

**Jest** + **Supertest**: 37 testów wysyła prawdziwe zapytania HTTP do serwisów. Działają na **pg-mem**
(PostgreSQL w pamięci), więc nie wymagają zainstalowanej bazy.

| Plik | Co sprawdza |
|---|---|
| `services/auth-service/test/auth.test.js` | rejestracja, logowanie, złe hasło, zajęty login, walidacja, hasło nie jest jawne w bazie, ciasteczko `HttpOnly` |
| `services/files-service/test/api.test.js` | wszystkie operacje na plikach, wymóg logowania, podrobiony token, **izolacja użytkowników**, kolizje nazw, `..` w ścieżkach, polskie znaki, powiadamianie activity-service |
| `services/activity-service/test/activity.test.js` | kolejność i limit 50 zdarzeń, osobna historia dla każdego użytkownika, walidacja |

Dwa testy są pomijane, bo pg-mem nie obsługuje `ON DELETE CASCADE` ani danych binarnych `BYTEA`.
Te dwa zachowania zostały sprawdzone ręcznie na prawdziwym PostgreSQL.

---

## Uruchomienie lokalne

Wymagany **Node.js 22.9+** i **PostgreSQL**.

```sh
npm install

# 1. utwórz pustą bazę (np. w pgAdmin albo):
#    psql -U postgres -c "CREATE DATABASE filemenager"
#    tabele utworzą się same przy pierwszym starcie

# 2. skopiuj .env.example do .env i uzupełnij DATABASE_URL oraz AUTH_SECRET

npm start          # buduje frontend i uruchamia serwisy -> http://localhost:3000
npm run dev        # tryb deweloperski z hot reloadem (Vite) -> http://localhost:5173
npm test           # testy
```

---

## Wdrożenie: Render + Neon

Wszystkie cztery serwisy działają w jednym kontenerze (`npm run services`), a na zewnątrz wystawiony jest tylko gateway.

**1. Baza: [neon.tech](https://neon.tech)**
- załóż projekt (region np. *Frankfurt*);
- *Connect* → wyłącz *Connection pooling* → skopiuj connection string;
- tabele utworzą się same przy pierwszym starcie aplikacji.

**2. Aplikacja: [render.com](https://render.com)** → *New → Web Service* → podłącz repozytorium z GitHuba

| Pole | Wartość |
|---|---|
| Language | Node |
| Region | Frankfurt (blisko bazy) |
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
- *Connection pooling* w Neonie musi być wyłączony: przy starcie serwisy używają blokady w bazie (`pg_advisory_lock`), która wymaga stałego połączenia.
- Darmowa instancja usypia po ~15 min bez ruchu, więc pierwsze wejście potem trwa ok. minuty.
- Historia zmian jest trzymana w pamięci, więc znika przy uśpieniu. Pliki i konta są w bazie i zostają.
- Pliki zajmują miejsce w bazie, a darmowy Neon ma ograniczoną pojemność.
