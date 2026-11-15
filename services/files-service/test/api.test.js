const fs = require('fs');
const os = require('os');
const path = require('path');
const request = require('supertest');
const { createApp } = require('../app');

let root;
let app;
let notify;

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'filemenager-'));
  notify = jest.fn(async () => {});
  app = createApp({ uploadRoot: root, notify });
});

afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true });
});

describe('GET /api/list', () => {
  test('pusty folder główny', async () => {
    const res = await request(app).get('/api/list').expect(200);
    expect(res.body).toEqual({ path: '', folders: [], files: [] });
  });

  test('rozdziela foldery i pliki', async () => {
    fs.mkdirSync(path.join(root, 'zdjęcia'));
    fs.writeFileSync(path.join(root, 'a.txt'), 'abc');
    const res = await request(app).get('/api/list').expect(200);
    expect(res.body.folders.map((f) => f.name)).toEqual(['zdjęcia']);
    expect(res.body.files).toMatchObject([{ name: 'a.txt', size: 3 }]);
  });

  test('nieistniejący folder -> 404', async () => {
    await request(app).get('/api/list?path=brak').expect(404);
  });
});

describe('tworzenie', () => {
  test('folder, a przy powtórzonej nazwie dopisek (1)', async () => {
    await request(app).post('/api/folder').send({ path: '', name: 'nowy' }).expect(201);
    const res = await request(app).post('/api/folder').send({ path: '', name: 'nowy' }).expect(201);
    expect(res.body.name).toBe('nowy(1)');
    expect(fs.existsSync(path.join(root, 'nowy(1)'))).toBe(true);
  });

  test('plik tekstowy dostaje .txt i dopisek przed rozszerzeniem', async () => {
    const first = await request(app).post('/api/file').send({ path: '', name: 'notatka' });
    expect(first.body.name).toBe('notatka.txt');
    const second = await request(app).post('/api/file').send({ path: '', name: 'notatka.txt' });
    expect(second.body.name).toBe('notatka(1).txt');
  });

  test('w podfolderze', async () => {
    fs.mkdirSync(path.join(root, 'a', 'b'), { recursive: true });
    await request(app).post('/api/file').send({ path: 'a/b', name: 'x' }).expect(201);
    expect(fs.existsSync(path.join(root, 'a', 'b', 'x.txt'))).toBe(true);
  });

  test('niedozwolona nazwa -> 400', async () => {
    await request(app).post('/api/folder').send({ path: '', name: 'a/b' }).expect(400);
    await request(app).post('/api/folder').send({ path: '', name: '..' }).expect(400);
    await request(app).post('/api/file').send({ path: '', name: '' }).expect(400);
  });
});

describe('bezpieczeństwo ścieżek', () => {
  test('nie da się wyjść poza katalog upload', async () => {
    await request(app).get('/api/list?path=..').expect(400);
    await request(app).get('/api/list?path=a/../../..').expect(400);
    await request(app).post('/api/folder').send({ path: '../', name: 'x' }).expect(400);
    await request(app).delete('/api/item?path=..&name=x').expect(400);
    expect(fs.existsSync(path.join(root, '..', 'x'))).toBe(false);
  });

  test('ścieżka z wiodącym ukośnikiem jest względna do upload', async () => {
    fs.mkdirSync(path.join(root, 'a'));
    const res = await request(app).get('/api/list?path=/a').expect(200);
    expect(res.body.path).toBe('a');
  });
});

describe('zmiana nazwy', () => {
  test('zmienia nazwę pliku', async () => {
    fs.writeFileSync(path.join(root, 'stary.txt'), '');
    await request(app)
      .patch('/api/rename')
      .send({ path: '', oldName: 'stary.txt', newName: 'nowy.txt' })
      .expect(200);
    expect(fs.existsSync(path.join(root, 'nowy.txt'))).toBe(true);
  });

  test('zajęta nazwa -> 409', async () => {
    fs.writeFileSync(path.join(root, 'a.txt'), '');
    fs.writeFileSync(path.join(root, 'b.txt'), '');
    await request(app)
      .patch('/api/rename')
      .send({ path: '', oldName: 'a.txt', newName: 'b.txt' })
      .expect(409);
  });

  test('brak elementu -> 404', async () => {
    await request(app)
      .patch('/api/rename')
      .send({ path: '', oldName: 'brak', newName: 'x' })
      .expect(404);
  });
});

describe('edycja treści', () => {
  test('zapis i odczyt z polskimi znakami', async () => {
    fs.writeFileSync(path.join(root, 'a.txt'), '');
    await request(app)
      .put('/api/content')
      .send({ path: '', name: 'a.txt', text: 'zażółć gęślą jaźń' })
      .expect(200);
    const res = await request(app).get('/api/content?name=a.txt').expect(200);
    expect(res.body.text).toBe('zażółć gęślą jaźń');
  });
});

describe('usuwanie', () => {
  test('folder razem z zawartością', async () => {
    fs.mkdirSync(path.join(root, 'a', 'b'), { recursive: true });
    await request(app).delete('/api/item?path=&name=a').expect(204);
    expect(fs.existsSync(path.join(root, 'a'))).toBe(false);
  });

  test('brak elementu -> 404', async () => {
    await request(app).delete('/api/item?name=brak').expect(404);
  });
});

describe('upload i pobieranie', () => {
  test('wysłane pliki trafiają do wskazanego folderu', async () => {
    fs.mkdirSync(path.join(root, 'docs'));
    const res = await request(app)
      .post('/api/upload?path=docs')
      .attach('files', Buffer.from('treść'), 'raport.txt')
      .expect(201);
    expect(res.body.names).toEqual(['raport.txt']);

    const file = await request(app).get('/api/download?path=docs&name=raport.txt').expect(200);
    expect(file.headers['content-disposition']).toContain('raport.txt');
  });

  test('upload do nieistniejącego folderu -> 404', async () => {
    await request(app)
      .post('/api/upload?path=brak')
      .attach('files', Buffer.from('x'), 'a.txt')
      .expect(404);
  });
});

test('każda zmiana jest zgłaszana do activity-service', async () => {
  await request(app).post('/api/folder').send({ path: '', name: 'a' });
  await request(app).delete('/api/item?name=a');
  expect(notify).toHaveBeenCalledTimes(2);
  expect(notify).toHaveBeenNthCalledWith(1, { action: 'nowy folder', path: '', name: 'a' });
});
