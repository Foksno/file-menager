const request = require('supertest');
const { createApp } = require('../app');
const { signToken } = require('../../shared/auth');

const cookieFor = (id) => `token=${signToken({ id, login: `u${id}` })}`;

test('zapisuje zdarzenia, najnowsze pierwsze', async () => {
  const app = createApp();
  await request(app).post('/activity').send({ userId: 1, action: 'nowy plik', name: 'a.txt' }).expect(201);
  await request(app).post('/activity').send({ userId: 1, action: 'usunięcie', name: 'a.txt' }).expect(201);
  const res = await request(app).get('/activity').set('Cookie', cookieFor(1)).expect(200);
  expect(res.body.map((e) => e.action)).toEqual(['usunięcie', 'nowy plik']);
});

test('każdy użytkownik widzi tylko swoją historię', async () => {
  const app = createApp();
  await request(app).post('/activity').send({ userId: 1, action: 'edycja', name: 'a' });
  await request(app).post('/activity').send({ userId: 2, action: 'edycja', name: 'b' });
  const res = await request(app).get('/activity').set('Cookie', cookieFor(2));
  expect(res.body.map((e) => e.name)).toEqual(['b']);
});

test('trzyma najwyżej 50 zdarzeń', async () => {
  const app = createApp();
  for (let i = 0; i < 55; i++) {
    await request(app).post('/activity').send({ userId: 1, action: 'edycja', name: `${i}` });
  }
  const res = await request(app).get('/activity').set('Cookie', cookieFor(1));
  expect(res.body).toHaveLength(50);
  expect(res.body[0].name).toBe('54');
});

test('odczyt bez logowania -> 401', async () => {
  await request(createApp()).get('/activity').expect(401);
});

test('brak pola action lub userId -> 400', async () => {
  await request(createApp()).post('/activity').send({ userId: 1 }).expect(400);
  await request(createApp()).post('/activity').send({ action: 'x' }).expect(400);
});
