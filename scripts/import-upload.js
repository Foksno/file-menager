// jednorazowe przeniesienie plików z katalogu na dysku do bazy, na konto wybranego użytkownika
//   npm run import -- <login> [katalog]      (domyślnie katalog upload/)
// istniejące nazwy dostają dopisek (1), (2)... - nic nie jest nadpisywane
const fs = require('fs');
const path = require('path');
const { createPool, migrate } = require('../services/shared/db');
const { createStorage } = require('../services/files-service/app');

async function importDir(store, ownerId, folderId, dir) {
  let count = 0;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      const name = await store.insertUnique(ownerId, folderId, entry.name, true);
      const childId = (await store.item(ownerId, folderId, name)).id;
      count += await importDir(store, ownerId, childId, full);
    } else if (entry.isFile()) {
      await store.insertUnique(ownerId, folderId, entry.name, false, fs.readFileSync(full));
      count++;
    }
  }
  return count;
}

async function main() {
  const [login, dirArg] = process.argv.slice(2);
  if (!login) {
    console.error('Użycie: npm run import -- <login> [katalog]');
    process.exit(1);
  }
  const dir = path.resolve(dirArg || path.join(__dirname, '..', 'upload'));
  if (!fs.existsSync(dir)) {
    console.error(`Katalog ${dir} nie istnieje`);
    process.exit(1);
  }

  const db = createPool();
  try {
    await migrate(db);
    const { rows } = await db.query('SELECT id FROM users WHERE login = $1', [
      login.toLowerCase(),
    ]);
    if (!rows.length) {
      throw new Error(`Brak użytkownika „${login}” - najpierw załóż konto w aplikacji`);
    }
    const store = createStorage(db);
    const ownerId = rows[0].id;
    const count = await importDir(store, ownerId, await store.folderId(ownerId, ''), dir);
    console.log(`Zaimportowano ${count} plików z ${dir} na konto „${login}”`);
  } finally {
    await db.end();
  }
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
