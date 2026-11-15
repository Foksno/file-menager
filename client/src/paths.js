// bieżący folder trzymamy w hashu: #/a/b -> "a/b"

// ręcznie wpisany adres może mieć uszkodzone kodowanie (np. "%E0%A4%A") - wtedy zostawiamy tekst
// bez dekodowania zamiast rzucać wyjątek; serwer i tak odrzuci niepoprawną nazwę
function safeDecode(part) {
  try {
    return decodeURIComponent(part);
  } catch {
    return part;
  }
}

export function pathFromHash() {
  return window.location.hash
    .slice(1)
    .split('/')
    .filter(Boolean)
    .map(safeDecode)
    .join('/');
}

export function hashFor(path) {
  return '#/' + path.split('/').filter(Boolean).map(encodeURIComponent).join('/');
}

export function joinPath(path, name) {
  return path ? `${path}/${name}` : name;
}

const TEXT_FILE = /\.(txt|md|json|js|jsx|css|html|csv|log|xml|ya?ml)$/i;

export const isTextFile = (name) => TEXT_FILE.test(name);

export function formatSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
