const request = require('supertest');
const { createApp } = require('../app');

test('zapisuje zdarzenia, najnowsze pierwsze', async () => {
  const app = createApp();
  await request(app).post('/activity').send({ action: 'nowy plik', name: 'a.txt' }).expect(201);
  await request(app).post('/activity').send({ action: 'usunięcie', name: 'a.txt' }).expect(201);
  const res = await request(app).get('/activity').expect(200);
  expect(res.body.map((e) => e.action)).toEqual(['usunięcie', 'nowy plik']);
});

test('trzyma najwyżej 50 zdarzeń', async () => {
  const app = createApp();
  for (let i = 0; i < 55; i++) {
    await request(app).post('/activity').send({ action: 'edycja', name: `${i}` });
  }
  const res = await request(app).get('/activity');
  expect(res.body).toHaveLength(50);
  expect(res.body[0].name).toBe('54');
});

test('brak pola action -> 400', async () => {
  await request(createApp()).post('/activity').send({}).expect(400);
});
