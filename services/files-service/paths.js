const path = require('path');

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
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

// ścieżka z klienta ("a/b", "/a/b/") -> ["a", "b"]; każdy człon musi być poprawną nazwą
function splitPath(clientPath) {
  const parts = String(clientPath ?? '').split(/[/\\]+/).filter(Boolean);
  for (const part of parts) {
    if (part === '.' || part === '..') throw new HttpError(400, 'Niedozwolona ścieżka');
    validateName(part);
  }
  return parts;
}

// "plik.txt" -> "plik(1).txt", "folder" -> "folder(1)" jeśli nazwa jest zajęta
function uniqueName(taken, name, isFolder = false) {
  const ext = isFolder ? '' : path.extname(name);
  const base = name.slice(0, name.length - ext.length);
  let candidate = name;
  let n = 1;
  while (taken.has(candidate)) {
    candidate = `${base}(${n++})${ext}`;
  }
  return candidate;
}

module.exports = { HttpError, validateName, splitPath, uniqueName };
