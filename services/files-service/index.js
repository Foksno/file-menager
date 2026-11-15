const { createApp } = require('./app');
const { createPool, migrate } = require('../shared/db');

const PORT = process.env.FILES_PORT || 3001;
const ACTIVITY_URL = process.env.ACTIVITY_URL || 'http://localhost:3002';

// każda zmiana trafia do activity-service; jego awaria nie blokuje operacji na plikach
async function notify(event) {
  try {
    await fetch(`${ACTIVITY_URL}/activity`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(event),
      signal: AbortSignal.timeout(1000),
    });
  } catch (err) {
    console.warn('activity-service niedostępny:', err.message);
  }
}

async function main() {
  const db = createPool();
  await migrate(db);
  createApp({ db, notify }).listen(PORT, () => {
    console.log(`files-service na porcie ${PORT} (PostgreSQL)`);
  });
}

main().catch((err) => {
  console.error('files-service nie wystartował:', err.message);
  process.exit(1);
});
