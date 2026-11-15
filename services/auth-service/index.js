const { createApp } = require('./app');
const { createPool, migrate } = require('../shared/db');

const PORT = process.env.AUTH_PORT || 3003;

async function main() {
  const db = createPool();
  await migrate(db);
  createApp({ db }).listen(PORT, () => {
    console.log(`auth-service na porcie ${PORT}`);
  });
}

main().catch((err) => {
  console.error('auth-service nie wystartował:', err.message);
  process.exit(1);
});
