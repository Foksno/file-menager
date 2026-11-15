const express = require('express');
const path = require('path');
const multer = require('multer');
const { requireUser } = require('../shared/auth');
const { HttpError, validateName, splitPath, uniqueName } = require('./paths');

const MAX_TEXT_SIZE = 1024 * 1024; // edytować można pliki do 1 MB
const MAX_UPLOAD_SIZE = 50 * 1024 * 1024;

// Express 4 nie łapie błędów z funkcji async - przekazujemy je do next()
const wrap = (fn) => (req, res, next) => fn(req, res, next).catch(next);

// naruszenie UNIQUE (parent_id, name) - ktoś zdążył utworzyć tę samą nazwę
const isDuplicate = (err) => err.code === '23505';

/**
 * Wszystkie zapytania filtrują po owner_id - użytkownik widzi tylko swoje pliki.
 * @param {{query: Function}} db
 */
function createStorage(db) {
  const one = async (sql, params) => (await db.query(sql, params)).rows[0];

  async function rootId(ownerId) {
    const root = await one(
      'SELECT id FROM items WHERE owner_id = $1 AND parent_id IS NULL',
      [ownerId]
    );
    if (root) return root.id;
    const created = await one(
      `INSERT INTO items (owner_id, parent_id, name, is_folder)
       VALUES ($1, NULL, '', TRUE) RETURNING id`,
      [ownerId]
    );
    return created.id;
  }

  const child = (ownerId, parentId, name) =>
    one(
      `SELECT id, name, is_folder, size, mtime FROM items
       WHERE owner_id = $1 AND parent_id = $2 AND name = $3`,
      [ownerId, parentId, name]
    );

  return {
    // "a/b" -> id folderu albo 404
    async folderId(ownerId, clientPath) {
      let id = await rootId(ownerId);
      for (const part of splitPath(clientPath)) {
        const item = await child(ownerId, id, part);
        if (!item || !item.is_folder) throw new HttpError(404, 'Folder nie istnieje');
        id = item.id;
      }
      return id;
    },

    async item(ownerId, folderId, name, message = 'Element nie istnieje') {
      const item = await child(ownerId, folderId, name);
      if (!item) throw new HttpError(404, message);
      return item;
    },

    async file(ownerId, folderId, name) {
      const item = await child(ownerId, folderId, name);
      if (!item || item.is_folder) throw new HttpError(404, 'Plik nie istnieje');
      return item;
    },

    async list(ownerId, folderId) {
      const { rows } = await db.query(
        `SELECT name, is_folder, size, mtime FROM items
         WHERE owner_id = $1 AND parent_id = $2`,
        [ownerId, folderId]
      );
      return rows;
    },

    async takenNames(ownerId, folderId) {
      return new Set((await this.list(ownerId, folderId)).map((r) => r.name));
    },

    async insert(ownerId, folderId, name, isFolder, data = null) {
      await db.query(
        `INSERT INTO items (owner_id, parent_id, name, is_folder, data, size)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [ownerId, folderId, name, isFolder, data, data ? data.length : 0]
      );
    },

    // nowa nazwa z dopiskiem (1), (2)... ponawiana, gdyby inny request zajął ją w międzyczasie
    async insertUnique(ownerId, folderId, name, isFolder, data) {
      for (let attempt = 0; attempt < 5; attempt++) {
        const finalName = uniqueName(await this.takenNames(ownerId, folderId), name, isFolder);
        try {
          await this.insert(ownerId, folderId, finalName, isFolder, data);
          return finalName;
        } catch (err) {
          if (!isDuplicate(err)) throw err;
        }
      }
      throw new HttpError(409, `Nie udało się zapisać „${name}”`);
    },

    async content(id) {
      return (await one('SELECT data FROM items WHERE id = $1', [id])).data;
    },

    async write(id, data) {
      await db.query('UPDATE items SET data = $2, size = $3, mtime = now() WHERE id = $1', [
        id,
        data,
        data.length,
      ]);
    },

    async rename(id, newName) {
      await db.query('UPDATE items SET name = $2, mtime = now() WHERE id = $1', [id, newName]);
    },

    // ON DELETE CASCADE usuwa też całą zawartość folderu
    async remove(id) {
      await db.query('DELETE FROM items WHERE id = $1', [id]);
    },
  };
}

/**
 * @param {object} options
 * @param {{query: Function}} options.db - pula połączeń pg
 * @param {(event: object) => Promise<void>} [options.notify] - wywoływane po każdej zmianie
 */
function createApp({ db, notify = async () => {} }) {
  const store = createStorage(db);
  const app = express();
  app.use(express.json({ limit: '2mb' }));
  app.use('/api', requireUser);

  // ścieżka bieżącego folderu z parametru "path" (query albo body), znormalizowana
  const pathFrom = (req) => splitPath(req.query.path ?? req.body?.path).join('/');
  const changed = (req, event) => notify({ userId: req.user.id, ...event });

  // --- odczyt ---

  app.get(
    '/api/list',
    wrap(async (req, res) => {
      const dirPath = pathFrom(req);
      const folderId = await store.folderId(req.user.id, dirPath);
      const folders = [];
      const files = [];
      for (const row of await store.list(req.user.id, folderId)) {
        if (row.is_folder) folders.push({ name: row.name, mtime: row.mtime });
        else files.push({ name: row.name, size: row.size, mtime: row.mtime });
      }
      const byName = (a, b) => a.name.localeCompare(b.name, 'pl');
      res.json({ path: dirPath, folders: folders.sort(byName), files: files.sort(byName) });
    })
  );

  app.get(
    '/api/content',
    wrap(async (req, res) => {
      const folderId = await store.folderId(req.user.id, pathFrom(req));
      const file = await store.file(req.user.id, folderId, validateName(req.query.name));
      if (file.size > MAX_TEXT_SIZE) {
        throw new HttpError(413, 'Plik jest za duży do edycji');
      }
      const data = await store.content(file.id);
      res.json({ text: data ? data.toString('utf8') : '' });
    })
  );

  app.get(
    '/api/download',
    wrap(async (req, res) => {
      const name = validateName(req.query.name);
      const folderId = await store.folderId(req.user.id, pathFrom(req));
      const file = await store.file(req.user.id, folderId, name);
      const data = (await store.content(file.id)) ?? Buffer.alloc(0);
      res.attachment(name);
      res.type(path.extname(name) || 'application/octet-stream');
      res.send(data);
    })
  );

  // --- zmiany ---

  app.post(
    '/api/folder',
    wrap(async (req, res) => {
      const dirPath = pathFrom(req);
      const folderId = await store.folderId(req.user.id, dirPath);
      const name = await store.insertUnique(
        req.user.id,
        folderId,
        validateName(req.body.name),
        true
      );
      await changed(req, { action: 'nowy folder', path: dirPath, name });
      res.status(201).json({ name });
    })
  );

  app.post(
    '/api/file',
    wrap(async (req, res) => {
      const dirPath = pathFrom(req);
      const folderId = await store.folderId(req.user.id, dirPath);
      let name = validateName(req.body.name);
      // nowy plik tekstowy zawsze dostaje rozszerzenie .txt
      if (!name.toLowerCase().endsWith('.txt')) name += '.txt';
      name = await store.insertUnique(req.user.id, folderId, name, false, Buffer.alloc(0));
      await changed(req, { action: 'nowy plik', path: dirPath, name });
      res.status(201).json({ name });
    })
  );

  // pliki trafiają najpierw do pamięci, potem do kolumny BYTEA
  const uploader = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: MAX_UPLOAD_SIZE },
  });

  app.post(
    '/api/upload',
    // folder sprawdzamy przed odebraniem plików - folder docelowy jest w query
    wrap(async (req, res, next) => {
      req.uploadPath = pathFrom(req);
      req.uploadFolderId = await store.folderId(req.user.id, req.uploadPath);
      next();
    }),
    uploader.array('files'),
    wrap(async (req, res) => {
      const names = [];
      for (const file of req.files || []) {
        // multer podaje nazwę w latin1, polskie znaki wymagają konwersji
        const original = path.basename(
          Buffer.from(file.originalname, 'latin1').toString('utf8')
        );
        names.push(
          await store.insertUnique(
            req.user.id,
            req.uploadFolderId,
            validateName(original),
            false,
            file.buffer
          )
        );
      }
      if (names.length) {
        await changed(req, { action: 'upload', path: req.uploadPath, name: names.join(', ') });
      }
      res.status(201).json({ names });
    })
  );

  app.patch(
    '/api/rename',
    wrap(async (req, res) => {
      const dirPath = pathFrom(req);
      const oldName = validateName(req.body.oldName);
      const newName = validateName(req.body.newName);
      const folderId = await store.folderId(req.user.id, dirPath);
      const item = await store.item(req.user.id, folderId, oldName);
      if (oldName !== newName) {
        const conflict = () => new HttpError(409, `„${newName}” już istnieje`);
        if ((await store.takenNames(req.user.id, folderId)).has(newName)) throw conflict();
        try {
          await store.rename(item.id, newName);
        } catch (err) {
          throw isDuplicate(err) ? conflict() : err;
        }
        await changed(req, { action: 'zmiana nazwy', path: dirPath, name: oldName, newName });
      }
      res.json({ name: newName });
    })
  );

  app.put(
    '/api/content',
    wrap(async (req, res) => {
      const dirPath = pathFrom(req);
      const name = validateName(req.body.name);
      const folderId = await store.folderId(req.user.id, dirPath);
      const file = await store.file(req.user.id, folderId, name);
      if (typeof req.body.text !== 'string') {
        throw new HttpError(400, 'Brak treści pliku');
      }
      await store.write(file.id, Buffer.from(req.body.text, 'utf8'));
      await changed(req, { action: 'edycja', path: dirPath, name });
      res.json({ name });
    })
  );

  app.delete(
    '/api/item',
    wrap(async (req, res) => {
      const dirPath = pathFrom(req);
      const name = validateName(req.query.name);
      const folderId = await store.folderId(req.user.id, dirPath);
      const item = await store.item(req.user.id, folderId, name);
      await store.remove(item.id);
      await changed(req, { action: 'usunięcie', path: dirPath, name });
      res.status(204).end();
    })
  );

  app.use('/api', (req, res) => {
    res.status(404).json({ error: 'Nieznany adres API' });
  });

  // jeden handler błędów - klient zawsze dostaje { error }
  app.use((err, req, res, next) => {
    if (err instanceof HttpError) {
      return res.status(err.status).json({ error: err.message });
    }
    if (err instanceof multer.MulterError) {
      return res.status(400).json({ error: err.message });
    }
    if (err.type === 'entity.parse.failed') {
      return res.status(400).json({ error: 'Niepoprawny JSON' });
    }
    console.error(err);
    res.status(500).json({ error: 'Błąd serwera' });
  });

  return app;
}

module.exports = { createApp, createStorage };
