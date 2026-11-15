const path = require('path');
const { createApp } = require('./app');

const PORT = process.env.FILES_PORT || 3001;
const ACTIVITY_URL = process.env.ACTIVITY_URL || 'http://localhost:3002';
const UPLOAD_ROOT =
  process.env.UPLOAD_ROOT || path.join(__dirname, '..', '..', 'upload');

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

createApp({ uploadRoot: UPLOAD_ROOT, notify }).listen(PORT, () => {
  console.log(`files-service na porcie ${PORT}, katalog: ${UPLOAD_ROOT}`);
});
