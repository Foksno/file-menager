const express = require('express');
const fs = require('fs');
const fsp = require('fs').promises;
const path = require('path');
const multer = require('multer');
const {
  HttpError,
  safeJoin,
  toClientPath,
  validateName,
  uniqueName,
} = require('./paths');

const MAX_TEXT_SIZE = 1024 * 1024; // edytować można pliki do 1 MB

// Express 4 nie łapie błędów z funkcji async - przekazujemy je do next()
const wrap = (fn) => (req, res, next) => fn(req, res, next).catch(next);

async function statOr404(abs, message) {
  try {
    return await fsp.stat(abs);
  } catch {
    throw new HttpError(404, message);
  }
}

async function requireDir(abs) {
  const stat = await statOr404(abs, 'Folder nie istnieje');
  if (!stat.isDirectory()) throw new HttpError(404, 'Folder nie istnieje');
}

async function requireFile(abs) {
  const stat = await statOr404(abs, 'Plik nie istnieje');
  if (!stat.isFile()) throw new HttpError(404, 'Plik nie istnieje');
  return stat;
}

/**
 * @param {object} options
 * @param {string} options.uploadRoot - katalog z plikami użytkownika
 * @param {(event: object) => Promise<void>} [options.notify] - wywoływane po każdej zmianie
 */
function createApp({ uploadRoot, notify = async () => {} }) {
  const root = path.resolve(uploadRoot);
  fs.mkdirSync(root, { recursive: true });

  const app = express();
  app.use(express.json({ limit: '2mb' }));

  // folder bieżący z parametru "path" (query albo body)
  const dirFrom = (req) => safeJoin(root, req.query.path ?? req.body?.path);

  // --- odczyt ---

  app.get(
    '/api/list',
    wrap(async (req, res) => {
      const dir = dirFrom(req);
      await requireDir(dir);
      const entries = await fsp.readdir(dir, { withFileTypes: true });
      const folders = [];
      const files = [];
      for (const entry of entries) {
        const stat = await fsp.stat(path.join(dir, entry.name));
        if (entry.isDirectory()) {
          folders.push({ name: entry.name, mtime: stat.mtime });
        } else {
          files.push({ name: entry.name, size: stat.size, mtime: stat.mtime });
        }
      }
      const byName = (a, b) => a.name.localeCompare(b.name, 'pl');
      res.json({
        path: toClientPath(root, dir),
        folders: folders.sort(byName),
        files: files.sort(byName),
      });
    })
  );

  app.get(
    '/api/content',
    wrap(async (req, res) => {
      const file = safeJoin(dirFrom(req), validateName(req.query.name));
      const stat = await requireFile(file);
      if (stat.size > MAX_TEXT_SIZE) {
        throw new HttpError(413, 'Plik jest za duży do edycji');
      }
      res.json({ text: await fsp.readFile(file, 'utf8') });
    })
  );

  app.get(
    '/api/download',
    wrap(async (req, res) => {
      const name = validateName(req.query.name);
      const file = safeJoin(dirFrom(req), name);
      await requireFile(file);
      res.download(file, name);
    })
  );

  // --- zmiany ---

  app.post(
    '/api/folder',
    wrap(async (req, res) => {
      const dir = dirFrom(req);
      await requireDir(dir);
      const name = uniqueName(dir, validateName(req.body.name), true);
      await fsp.mkdir(path.join(dir, name));
      await notify({ action: 'nowy folder', path: toClientPath(root, dir), name });
      res.status(201).json({ name });
    })
  );

  app.post(
    '/api/file',
    wrap(async (req, res) => {
      const dir = dirFrom(req);
      await requireDir(dir);
      let name = validateName(req.body.name);
      // nowy plik tekstowy zawsze dostaje rozszerzenie .txt
      if (!name.toLowerCase().endsWith('.txt')) name += '.txt';
      name = uniqueName(dir, name);
      await fsp.writeFile(path.join(dir, name), '');
      await notify({ action: 'nowy plik', path: toClientPath(root, dir), name });
      res.status(201).json({ name });
    })
  );

  const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, req.uploadDir),
    filename: (req, file, cb) => {
      // multer podaje nazwę w latin1, polskie znaki wymagają konwersji
      const original = path.basename(
        Buffer.from(file.originalname, 'latin1').toString('utf8')
      );
      try {
        cb(null, uniqueName(req.uploadDir, validateName(original)));
      } catch (err) {
        cb(err);
      }
    },
  });
  const uploader = multer({ storage, limits: { fileSize: 50 * 1024 * 1024 } });

  app.post(
    '/api/upload',
    // folder docelowy w query - multer potrzebuje go zanim przeczyta pliki
    wrap(async (req, res, next) => {
      req.uploadDir = safeJoin(root, req.query.path);
      await requireDir(req.uploadDir);
      next();
    }),
    uploader.array('files'),
    wrap(async (req, res) => {
      const names = (req.files || []).map((f) => f.filename);
      if (names.length) {
        await notify({
          action: 'upload',
          path: toClientPath(root, req.uploadDir),
          name: names.join(', '),
        });
      }
      res.status(201).json({ names });
    })
  );

  app.patch(
    '/api/rename',
    wrap(async (req, res) => {
      const dir = dirFrom(req);
      const oldName = validateName(req.body.oldName);
      const newName = validateName(req.body.newName);
      const from = safeJoin(dir, oldName);
      const to = safeJoin(dir, newName);
      await statOr404(from, 'Element nie istnieje');
      if (oldName !== newName) {
        if (fs.existsSync(to)) {
          throw new HttpError(409, `„${newName}” już istnieje`);
        }
        await fsp.rename(from, to);
        await notify({
          action: 'zmiana nazwy',
          path: toClientPath(root, dir),
          name: oldName,
          newName,
        });
      }
      res.json({ name: newName });
    })
  );

  app.put(
    '/api/content',
    wrap(async (req, res) => {
      const dir = dirFrom(req);
      const name = validateName(req.body.name);
      const file = safeJoin(dir, name);
      await requireFile(file);
      if (typeof req.body.text !== 'string') {
        throw new HttpError(400, 'Brak treści pliku');
      }
      await fsp.writeFile(file, req.body.text, 'utf8');
      await notify({ action: 'edycja', path: toClientPath(root, dir), name });
      res.json({ name });
    })
  );

  app.delete(
    '/api/item',
    wrap(async (req, res) => {
      const dir = dirFrom(req);
      const name = validateName(req.query.name);
      const target = safeJoin(dir, name);
      await statOr404(target, 'Element nie istnieje');
      await fsp.rm(target, { recursive: true });
      await notify({ action: 'usunięcie', path: toClientPath(root, dir), name });
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

module.exports = { createApp };
