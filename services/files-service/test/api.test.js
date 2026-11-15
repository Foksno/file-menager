const request = require('supertest');
const { createApp } = require('../app');
const { createTestDb, createUser } = require('../../shared/test-db');

let db;
let app;
let notify;
let alice;
let bob;

// zapytania zalogowanego użytkownika
const as = (who) => ({
  get: (url) => request(app).get(url).set('Cookie', who.cookie),
  post: (url) => request(app).post(url).set('Cookie', who.cookie),
  patch: (url) => request(app).patch(url).set('Cookie', who.cookie),
  put: (url) => request(app).put(url).set('Cookie', who.cookie),
  delete: (url) => request(app).delete(url).set('Cookie', who.cookie),
});

beforeEach(async () => {
  db = createTestDb();
  notify = jest.fn(async () => {});
  app = createApp({ db, notify });
  alice = await createUser(db, 'alice');
  bob = await createUser(db, 'bob');
});

const mkdir = (who, path, name) => as(who).post('/api/folder').send({ path, name }).expect(201);
const upload = (who, path, name, content) =>
  as(who)
    .post(`/api/upload?path=${encodeURIComponent(path)}`)
    .attach('files', Buffer.from(content), name)
    .expect(201);

describe('logowanie wymagane', () => {
  test('bez ciasteczka -> 401', async () => {
    await request(app).get('/api/list').expect(401);
    await request(app).post('/api/folder').send({ path: '', name: 'x' }).expect(401);
  });

  test('podrobiony token -> 401', async () => {
    await request(app).get('/api/list').set('Cookie', 'token=abc.def').expect(401);
  });
});

describe('GET /api/list', () => {
  test('pusty folder główny', async () => {
    const res = await as(alice).get('/api/list').expect(200);
    expect(res.body).toEqual({ path: '', folders: [], files: [] });
  });

  test('rozdziela foldery i pliki', async () => {
    await mkdir(alice, '', 'zdjęcia');
    await upload(alice, '', 'a.txt', 'abc');
    const res = await as(alice).get('/api/list').expect(200);
    expect(res.body.folders.map((f) => f.name)).toEqual(['zdjęcia']);
    expect(res.body.files).toMatchObject([{ name: 'a.txt', size: 3 }]);
  });

  test('nieistniejący folder -> 404', async () => {
    await as(alice).get('/api/list?path=brak').expect(404);
  });
});

describe('pliki są przypisane do konta', () => {
  test('inny użytkownik nie widzi cudzych plików', async () => {
    await mkdir(alice, '', 'tajne');
    await upload(alice, 'tajne', 'hasla.txt', 'sekret');

    const list = await as(bob).get('/api/list').expect(200);
    expect(list.body.folders).toEqual([]);
    await as(bob).get('/api/list?path=tajne').expect(404);
    await as(bob).get('/api/download?path=tajne&name=hasla.txt').expect(404);
    await as(bob).delete('/api/item?name=tajne').expect(404);

    // ta sama nazwa u drugiej osoby nie koliduje
    const res = await mkdir(bob, '', 'tajne');
    expect(res.body.name).toBe('tajne');
  });
});

describe('tworzenie', () => {
  test('folder, a przy powtórzonej nazwie dopisek (1)', async () => {
    await mkdir(alice, '', 'nowy');
    const res = await mkdir(alice, '', 'nowy');
    expect(res.body.name).toBe('nowy(1)');
    const list = await as(alice).get('/api/list');
    expect(list.body.folders.map((f) => f.name)).toEqual(['nowy', 'nowy(1)']);
  });

  test('plik tekstowy dostaje .txt i dopisek przed rozszerzeniem', async () => {
    const first = await as(alice).post('/api/file').send({ path: '', name: 'notatka' });
    expect(first.body.name).toBe('notatka.txt');
    const second = await as(alice).post('/api/file').send({ path: '', name: 'notatka.txt' });
    expect(second.body.name).toBe('notatka(1).txt');
  });

  test('w podfolderze', async () => {
    await mkdir(alice, '', 'a');
    await mkdir(alice, 'a', 'b');
    await as(alice).post('/api/file').send({ path: 'a/b', name: 'x' }).expect(201);
    const list = await as(alice).get('/api/list?path=a/b');
    expect(list.body.files.map((f) => f.name)).toEqual(['x.txt']);
  });

  test('niedozwolona nazwa -> 400', async () => {
    await as(alice).post('/api/folder').send({ path: '', name: 'a/b' }).expect(400);
    await as(alice).post('/api/folder').send({ path: '', name: '..' }).expect(400);
    await as(alice).post('/api/file').send({ path: '', name: '' }).expect(400);
  });
});

describe('ścieżki', () => {
  test('".." w ścieżce -> 400', async () => {
    await as(alice).get('/api/list?path=..').expect(400);
    await as(alice).get('/api/list?path=a/../../..').expect(400);
    await as(alice).post('/api/folder').send({ path: '../', name: 'x' }).expect(400);
  });

  test('wiodący ukośnik jest ignorowany', async () => {
    await mkdir(alice, '', 'a');
    const res = await as(alice).get('/api/list?path=/a/').expect(200);
    expect(res.body.path).toBe('a');
  });

  test('plik nie jest folderem', async () => {
    await upload(alice, '', 'a.txt', 'x');
    await as(alice).get('/api/list?path=a.txt').expect(404);
  });
});

describe('zmiana nazwy', () => {
  test('zmienia nazwę pliku', async () => {
    await upload(alice, '', 'stary.txt', '');
    await as(alice)
      .patch('/api/rename')
      .send({ path: '', oldName: 'stary.txt', newName: 'nowy.txt' })
      .expect(200);
    const list = await as(alice).get('/api/list');
    expect(list.body.files.map((f) => f.name)).toEqual(['nowy.txt']);
  });

  test('zajęta nazwa -> 409', async () => {
    await upload(alice, '', 'a.txt', '');
    await upload(alice, '', 'b.txt', '');
    await as(alice)
      .patch('/api/rename')
      .send({ path: '', oldName: 'a.txt', newName: 'b.txt' })
      .expect(409);
  });

  test('brak elementu -> 404', async () => {
    await as(alice)
      .patch('/api/rename')
      .send({ path: '', oldName: 'brak', newName: 'x' })
      .expect(404);
  });
});

describe('edycja treści', () => {
  test('zapis i odczyt z polskimi znakami', async () => {
    await as(alice).post('/api/file').send({ path: '', name: 'a' });
    await as(alice)
      .put('/api/content')
      .send({ path: '', name: 'a.txt', text: 'zażółć gęślą jaźń' })
      .expect(200);
    const res = await as(alice).get('/api/content?name=a.txt').expect(200);
    expect(res.body.text).toBe('zażółć gęślą jaźń');
    const list = await as(alice).get('/api/list');
    expect(list.body.files[0].size).toBe(Buffer.byteLength('zażółć gęślą jaźń'));
  });
});

describe('usuwanie', () => {
  // pg-mem nie obsługuje ON DELETE CASCADE - sprawdzone na prawdziwym PostgreSQL
  test.skip('folder razem z zawartością', async () => {
    await mkdir(alice, '', 'a');
    await mkdir(alice, 'a', 'b');
    await upload(alice, 'a/b', 'x.txt', 'x');
    await as(alice).delete('/api/item?path=&name=a').expect(204);
    const list = await as(alice).get('/api/list');
    expect(list.body.folders).toEqual([]);
    const { rows } = await db.query('SELECT count(*)::int AS n FROM items WHERE parent_id IS NOT NULL');
    expect(rows[0].n).toBe(0);
  });

  test('usuwa folder z listy', async () => {
    await mkdir(alice, '', 'a');
    await as(alice).delete('/api/item?path=&name=a').expect(204);
    const list = await as(alice).get('/api/list');
    expect(list.body.folders).toEqual([]);
  });

  test('brak elementu -> 404', async () => {
    await as(alice).delete('/api/item?name=brak').expect(404);
  });
});

describe('upload i pobieranie', () => {
  test('wysłany plik wraca w tej samej postaci', async () => {
    await mkdir(alice, '', 'docs');
    const res = await upload(alice, 'docs', 'raport.txt', 'treść');
    expect(res.body.names).toEqual(['raport.txt']);

    const file = await as(alice).get('/api/download?path=docs&name=raport.txt').expect(200);
    expect(file.headers['content-disposition']).toContain('raport.txt');
    expect(file.text).toBe('treść');
  });

  // pg-mem zapisuje BYTEA jako tekst UTF-8 i psuje bajty > 127 - sprawdzone na prawdziwym PostgreSQL
  test.skip('dane binarne', async () => {
    const bytes = Buffer.from([0, 1, 2, 255, 254]);
    await as(alice).post('/api/upload?path=').attach('files', bytes, 'a.bin').expect(201);
    const file = await as(alice)
      .get('/api/download?name=a.bin')
      .buffer(true)
      .parse((res, cb) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => cb(null, Buffer.concat(chunks)));
      })
      .expect(200);
    expect(Buffer.compare(file.body, bytes)).toBe(0);
  });

  test('powtórzona nazwa dostaje dopisek', async () => {
    await upload(alice, '', 'a.txt', '1');
    const res = await upload(alice, '', 'a.txt', '2');
    expect(res.body.names).toEqual(['a(1).txt']);
  });

  test('upload do nieistniejącego folderu -> 404', async () => {
    await as(alice)
      .post('/api/upload?path=brak')
      .attach('files', Buffer.from('x'), 'a.txt')
      .expect(404);
  });
});

test('każda zmiana jest zgłaszana do activity-service z id użytkownika', async () => {
  await mkdir(alice, '', 'a');
  await as(alice).delete('/api/item?name=a');
  expect(notify).toHaveBeenCalledTimes(2);
  expect(notify).toHaveBeenNthCalledWith(1, {
    userId: alice.user.id,
    action: 'nowy folder',
    path: '',
    name: 'a',
  });
});
