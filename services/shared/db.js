// połączenie z PostgreSQL i schemat bazy (wspólny dla auth-service i files-service)

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS users (
    id            SERIAL PRIMARY KEY,
    login         TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
  );

  -- foldery i pliki w jednym drzewie; każdy użytkownik ma swój folder główny
  -- (parent_id = NULL, name = ''), usunięcie folderu kasuje całą zawartość
  CREATE TABLE IF NOT EXISTS items (
    id         SERIAL PRIMARY KEY,
    owner_id   INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    parent_id  INTEGER REFERENCES items(id) ON DELETE CASCADE,
    name       TEXT NOT NULL,
    is_folder  BOOLEAN NOT NULL,
    data       BYTEA,
    size       INTEGER NOT NULL DEFAULT 0,
    mtime      TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (parent_id, name)
  );

  CREATE INDEX IF NOT EXISTS items_owner ON items (owner_id);
`;

const LOCAL_HOSTS = ['localhost', '127.0.0.1', '::1', '[::1]'];

function createPool() {
  const { Pool } = require('pg');
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error('Brak DATABASE_URL - skopiuj .env.example do .env i uzupełnij hasło');
    process.exit(1);
  }

  // baza w chmurze (np. Neon) przyjmuje tylko połączenia szyfrowane SSL z poprawnym certyfikatem;
  // lokalny PostgreSQL zwykle nie ma SSL, więc tam szyfrowanie zostaje wyłączone
  const isLocal = LOCAL_HOSTS.includes(new URL(connectionString).hostname);
  const pool = new Pool({
    connectionString,
    ssl: isLocal ? false : { rejectUnauthorized: true },
  });

  // serwer bazy może zamknąć bezczynne połączenie (Neon usypia bazę po kilku minutach);
  // bez tego handlera taki błąd wyłączyłby cały serwis, a pula i tak otworzy nowe połączenie
  pool.on('error', (err) => {
    console.warn('Zerwane połączenie z bazą (zostanie otwarte nowe):', err.message);
  });

  return pool;
}

// kilka serwisów startuje naraz - blokada, żeby nie tworzyły tabel równocześnie
async function migrate(pool) {
  const client = await pool.connect();
  try {
    await client.query('SELECT pg_advisory_lock(4242)');
    await client.query(SCHEMA);
  } finally {
    await client.query('SELECT pg_advisory_unlock(4242)').catch(() => {});
    client.release();
  }
}

module.exports = { SCHEMA, createPool, migrate };
