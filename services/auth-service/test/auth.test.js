const request = require('supertest');
const { createApp } = require('../app');
const { createTestDb } = require('../../shared/test-db');

let app;

beforeEach(() => {
  app = createApp({ db: createTestDb() });
});

const register = (login, password = 'tajne123') =>
  request(app).post('/auth/register').send({ login, password });

test('rejestracja loguje od razu i ustawia ciasteczko httpOnly', async () => {
  const res = await register('Ala').expect(201);
  expect(res.body).toMatchObject({ login: 'ala' });
  const cookie = res.headers['set-cookie'][0];
  expect(cookie).toMatch(/^token=/);
  expect(cookie).toContain('HttpOnly');

  const me = await request(app).get('/auth/me').set('Cookie', cookie.split(';')[0]).expect(200);
  expect(me.body.login).toBe('ala');
});

test('hasło nie jest zapisywane jawnie', async () => {
  const db = createTestDb();
  app = createApp({ db });
  await register('ala').expect(201);
  const { rows } = await db.query('SELECT password_hash FROM users');
  expect(rows[0].password_hash).not.toContain('tajne123');
});

test('zajęty login -> 409 (bez względu na wielkość liter)', async () => {
  await register('ala').expect(201);
  await register('ALA').expect(409);
});

test('walidacja loginu i hasła', async () => {
  await register('a').expect(400);
  await register('ala ma kota').expect(400);
  await register('ala', '123').expect(400);
});

test('logowanie', async () => {
  await register('ala');
  const ok = await request(app)
    .post('/auth/login')
    .send({ login: 'ala', password: 'tajne123' })
    .expect(200);
  expect(ok.headers['set-cookie'][0]).toMatch(/^token=/);

  await request(app).post('/auth/login').send({ login: 'ala', password: 'zle' }).expect(401);
  await request(app).post('/auth/login').send({ login: 'brak', password: 'x' }).expect(401);
});

test('wylogowanie czyści ciasteczko', async () => {
  const res = await request(app).post('/auth/logout').expect(204);
  expect(res.headers['set-cookie'][0]).toContain('Max-Age=0');
});

test('/auth/me bez sesji -> 401', async () => {
  await request(app).get('/auth/me').expect(401);
});
