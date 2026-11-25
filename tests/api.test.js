// Integration tests: starts the real server on a free port and sends
// HTTP requests to it, the same way the browser does.
// The Open Library search itself is not called here (needs internet),
// only the input check of /api/search.

const { test, before, after } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

process.env.DATA_FILE = path.join(os.tmpdir(), 'lyb-api-test.json');
fs.rmSync(process.env.DATA_FILE, { force: true });

const { createServer } = require('../server');

let server;
let baseUrl;

before(async () => {
  server = createServer();
  await new Promise((resolve) => server.listen(0, resolve)); // port 0 = any free port
  baseUrl = `http://localhost:${server.address().port}`;
});

after(() => {
  server.close();
  fs.rmSync(process.env.DATA_FILE, { force: true });
});

// small helper so the tests stay short
async function request(method, url, body) {
  const res = await fetch(baseUrl + url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  return { status: res.status, data: text ? JSON.parse(text) : null };
}

test('GET / serves the web page', async () => {
  const res = await fetch(baseUrl + '/');
  assert.strictEqual(res.status, 200);
  assert.match(await res.text(), /ListYourBooks/);
});

test('POST /api/books without a title gives 400', async () => {
  const res = await request('POST', '/api/books', { author: 'Someone' });
  assert.strictEqual(res.status, 400);
});

test('full flow: add, rate, filter, delete', async () => {
  const added = await request('POST', '/api/books', { title: 'Dune', author: 'Frank Herbert', olKey: '/works/OL1W' });
  assert.strictEqual(added.status, 201);
  const id = added.data.id;

  // adding it again is a conflict
  const again = await request('POST', '/api/books', { title: 'Dune', olKey: '/works/OL1W' });
  assert.strictEqual(again.status, 409);

  const updated = await request('PUT', '/api/books/' + id, { status: 'Finished', rating: 5, note: 'Loved it' });
  assert.strictEqual(updated.status, 200);
  assert.strictEqual(updated.data.rating, 5);

  const finished = await request('GET', '/api/books?status=Finished');
  assert.strictEqual(finished.data.length, 1);

  const reading = await request('GET', '/api/books?status=Reading');
  assert.strictEqual(reading.data.length, 0);

  const deleted = await request('DELETE', '/api/books/' + id);
  assert.strictEqual(deleted.status, 204);

  const deletedAgain = await request('DELETE', '/api/books/' + id);
  assert.strictEqual(deletedAgain.status, 404);
});

test('PUT with a rating of 7 gives 400', async () => {
  const added = await request('POST', '/api/books', { title: 'Test book' });
  const res = await request('PUT', '/api/books/' + added.data.id, { rating: 7 });
  assert.strictEqual(res.status, 400);
});

test('GET /api/search with an empty query gives 400', async () => {
  const res = await request('GET', '/api/search?q=');
  assert.strictEqual(res.status, 400);
});

test('unknown status filter gives 400', async () => {
  const res = await request('GET', '/api/books?status=Something');
  assert.strictEqual(res.status, 400);
});

test('static files cannot escape the public folder', async () => {
  const res = await fetch(baseUrl + '/../server.js');
  assert.notStrictEqual(res.status, 200);
});
