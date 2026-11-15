const crypto = require('crypto');
const { promisify } = require('util');
const express = require('express');
const {
  signToken,
  requireUser,
  sessionCookie,
  clearCookie,
} = require('../shared/auth');

const scrypt = promisify(crypto.scrypt);

// hasło nigdy nie trafia do bazy - zapisujemy "sól:skrót" (scrypt)
async function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const hash = await scrypt(password, salt, 64);
  return `${salt.toString('hex')}:${hash.toString('hex')}`;
}

async function checkPassword(password, stored) {
  const [saltHex, hashHex] = stored.split(':');
  const expected = Buffer.from(hashHex, 'hex');
  const hash = await scrypt(password, Buffer.from(saltHex, 'hex'), expected.length);
  return crypto.timingSafeEqual(hash, expected);
}

const LOGIN = /^[a-z0-9_.-]{3,32}$/;

function readCredentials(body) {
  const login = String(body?.login ?? '').trim().toLowerCase();
  const password = String(body?.password ?? '');
  return { login, password };
}

/**
 * @param {object} options
 * @param {{query: Function}} options.db - pula połączeń pg
 */
function createApp({ db }) {
  const app = express();
  app.use(express.json());

  const wrap = (fn) => (req, res, next) => fn(req, res, next).catch(next);

  function startSession(res, user) {
    res.setHeader('Set-Cookie', sessionCookie(signToken(user)));
    res.json({ id: user.id, login: user.login });
  }

  app.post(
    '/auth/register',
    wrap(async (req, res) => {
      const { login, password } = readCredentials(req.body);
      if (!LOGIN.test(login)) {
        return res
          .status(400)
          .json({ error: 'Login: 3-32 znaki, litery, cyfry, "_", "." lub "-"' });
      }
      if (password.length < 6) {
        return res.status(400).json({ error: 'Hasło musi mieć co najmniej 6 znaków' });
      }
      try {
        const { rows } = await db.query(
          'INSERT INTO users (login, password_hash) VALUES ($1, $2) RETURNING id, login',
          [login, await hashPassword(password)]
        );
        res.status(201);
        startSession(res, rows[0]);
      } catch (err) {
        if (err.code === '23505') {
          return res.status(409).json({ error: 'Ten login jest już zajęty' });
        }
        throw err;
      }
    })
  );

  app.post(
    '/auth/login',
    wrap(async (req, res) => {
      const { login, password } = readCredentials(req.body);
      const { rows } = await db.query(
        'SELECT id, login, password_hash FROM users WHERE login = $1',
        [login]
      );
      const user = rows[0];
      if (!user || !(await checkPassword(password, user.password_hash))) {
        return res.status(401).json({ error: 'Nieprawidłowy login lub hasło' });
      }
      startSession(res, user);
    })
  );

  app.post('/auth/logout', (req, res) => {
    res.setHeader('Set-Cookie', clearCookie());
    res.status(204).end();
  });

  app.get('/auth/me', requireUser, (req, res) => {
    res.json(req.user);
  });

  app.use((err, req, res, next) => {
    if (err.type === 'entity.parse.failed') {
      return res.status(400).json({ error: 'Niepoprawny JSON' });
    }
    console.error(err);
    res.status(500).json({ error: 'Błąd serwera' });
  });

  return app;
}

module.exports = { createApp, hashPassword };
