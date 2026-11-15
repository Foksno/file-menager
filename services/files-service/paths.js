const fs = require('fs');
const path = require('path');

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

// ścieżka z klienta ("a/b") zamieniona na absolutną - nigdy poza katalog root
function safeJoin(root, ...parts) {
  const clean = parts.map((p) => String(p ?? '').replace(/^[/\\]+/, ''));
  const target = path.resolve(root, ...clean);
  if (target !== root && !target.startsWith(root + path.sep)) {
    throw new HttpError(400, 'Niedozwolona ścieżka');
  }
  return target;
}

// ścieżka absolutna -> względna z "/" (tak jak widzi ją klient)
function toClientPath(root, abs) {
  return path.relative(root, abs).split(path.sep).filter(Boolean).join('/');
}

const FORBIDDEN = /[<>:"/\\|?*\x00-\x1F]/;

function validateName(name) {
  name = String(name ?? '').trim();
  if (!name || name === '.' || name === '..' || name.length > 255) {
    throw new HttpError(400, 'Nieprawidłowa nazwa');
  }
  if (FORBIDDEN.test(name) || name.endsWith('.')) {
    throw new HttpError(400, 'Nazwa zawiera niedozwolone znaki');
  }
  return name;
}

// "plik.txt" -> "plik(1).txt", "folder" -> "folder(1)" jeśli nazwa jest zajęta
function uniqueName(dir, name, isFolder = false) {
  const ext = isFolder ? '' : path.extname(name);
  const base = name.slice(0, name.length - ext.length);
  let candidate = name;
  let n = 1;
  while (fs.existsSync(path.join(dir, candidate))) {
    candidate = `${base}(${n++})${ext}`;
  }
  return candidate;
}

module.exports = { HttpError, safeJoin, toClientPath, validateName, uniqueName };
