// wspólne dla wszystkich serwisów: token sesji w ciasteczku podpisany HMAC-SHA256
const crypto = require('crypto');

const COOKIE = 'token';
const MAX_AGE = 7 * 24 * 60 * 60; // 7 dni, w sekundach

const SECRET =
  process.env.AUTH_SECRET ||
  (process.env.NODE_ENV === 'test' ? 'test-secret' : 'dev-secret-zmien-mnie');

if (!process.env.AUTH_SECRET && process.env.NODE_ENV === 'production') {
  // z domyślnym, publicznie znanym kluczem każdy mógłby podrobić sesję dowolnego użytkownika
  console.error('Brak AUTH_SECRET - na produkcji ta zmienna jest wymagana');
  process.exit(1);
}
if (!process.env.AUTH_SECRET && process.env.NODE_ENV !== 'test') {
  console.warn('Brak AUTH_SECRET w .env - używany jest domyślny klucz (tylko do testów lokalnych)');
}

const b64 = (buf) => Buffer.from(buf).toString('base64url');
const hmac = (data) => crypto.createHmac('sha256', SECRET).update(data).digest();

/** @param {{id: number, login: string}} user */
function signToken(user) {
  const payload = b64(
    JSON.stringify({ uid: user.id, login: user.login, exp: Date.now() + MAX_AGE * 1000 })
  );
  return `${payload}.${b64(hmac(payload))}`;
}

/** @returns {{id: number, login: string} | null} */
function verifyToken(token) {
  if (typeof token !== 'string') return null;
  const [payload, sig] = token.split('.');
  if (!payload || !sig) return null;
  const expected = hmac(payload);
  const given = Buffer.from(sig, 'base64url');
  if (given.length !== expected.length || !crypto.timingSafeEqual(given, expected)) {
    return null;
  }
  try {
    const { uid, login, exp } = JSON.parse(Buffer.from(payload, 'base64url').toString());
    if (!Number.isInteger(uid) || typeof exp !== 'number' || exp < Date.now()) return null;
    return { id: uid, login };
  } catch {
    return null;
  }
}

function parseCookies(header = '') {
  const cookies = {};
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i < 0) continue;
    const key = part.slice(0, i).trim();
    try {
      cookies[key] = decodeURIComponent(part.slice(i + 1).trim());
    } catch {
      // uszkodzone ciasteczko - pomijamy
    }
  }
  return cookies;
}

const userFromCookieHeader = (header) => verifyToken(parseCookies(header)[COOKIE]);

// middleware Express: req.user albo 401
function requireUser(req, res, next) {
  const user = userFromCookieHeader(req.headers.cookie);
  if (!user) return res.status(401).json({ error: 'Musisz się zalogować' });
  req.user = user;
  next();
}

// na produkcji (HTTPS) ciasteczko z flagą Secure - przeglądarka nie wyśle go zwykłym HTTP;
// lokalnie (http://localhost) flaga musi być wyłączona, inaczej logowanie by nie działało
const SECURE = process.env.NODE_ENV === 'production' ? '; Secure' : '';

const sessionCookie = (token) =>
  `${COOKIE}=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${MAX_AGE}${SECURE}`;
const clearCookie = () => `${COOKIE}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0${SECURE}`;

module.exports = {
  signToken,
  verifyToken,
  userFromCookieHeader,
  requireUser,
  sessionCookie,
  clearCookie,
};
