// Unit tests for src/books.js and the Open Library helper.
// Run with: npm test

const { test, beforeEach } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

// use a temporary file so the real data/books.json is never touched
process.env.DATA_FILE = path.join(os.tmpdir(), 'lyb-unit-test.json');

const books = require('../src/books');
const { simplifyResults } = require('../src/openLibrary');

beforeEach(() => {
  fs.rmSync(process.env.DATA_FILE, { force: true });
});

test('validate: a new book needs a title', () => {
  assert.strictEqual(books.validate({}, true), 'Title is required');
  assert.strictEqual(books.validate({ title: '   ' }, true), 'Title is required');
  assert.strictEqual(books.validate({ title: 'Dune' }, true), null);
});

test('validate: rating must be 1 to 5', () => {
  assert.ok(books.validate({ rating: 0 }, false));
  assert.ok(books.validate({ rating: 6 }, false));
  assert.ok(books.validate({ rating: 3.5 }, false));
  assert.strictEqual(books.validate({ rating: 4 }, false), null);
  assert.strictEqual(books.validate({ rating: null }, false), null); // removing a rating is ok
});

test('validate: status must be a known one', () => {
  assert.ok(books.validate({ status: 'Lost it' }, false));
  assert.strictEqual(books.validate({ status: 'Reading' }, false), null);
});

test('addBook saves a book with default values', () => {
  const { book } = books.addBook({ title: 'Dune', author: 'Frank Herbert' });
  assert.strictEqual(book.status, 'Want to read');
  assert.strictEqual(book.rating, null);
  assert.strictEqual(books.listBooks().length, 1);
});

test('addBook does not allow the same Open Library book twice', () => {
  books.addBook({ title: 'Dune', olKey: '/works/OL893415W' });
  const second = books.addBook({ title: 'Dune', olKey: '/works/OL893415W' });
  assert.ok(second.error);
  assert.strictEqual(books.listBooks().length, 1);
});

test('listBooks can filter by status', () => {
  const { book } = books.addBook({ title: 'Book A' });
  books.addBook({ title: 'Book B' });
  books.updateBook(book.id, { status: 'Finished' });

  const finished = books.listBooks('Finished');
  assert.strictEqual(finished.length, 1);
  assert.strictEqual(finished[0].title, 'Book A');
});

test('updateBook and deleteBook return null/false for unknown ids', () => {
  assert.strictEqual(books.updateBook('nope', { status: 'Reading' }), null);
  assert.strictEqual(books.deleteBook('nope'), false);
});

test('simplifyResults keeps only the fields the frontend needs', () => {
  const fakeAnswer = {
    docs: [
      { key: '/works/OL1W', title: 'The Hobbit', author_name: ['J.R.R. Tolkien'], first_publish_year: 1937, cover_i: 123 },
      { key: '/works/OL2W', title: 'No Author Book' },
    ],
  };
  const result = simplifyResults(fakeAnswer);

  assert.deepStrictEqual(result[0], {
    olKey: '/works/OL1W', title: 'The Hobbit', author: 'J.R.R. Tolkien', year: 1937, coverId: 123,
  });
  assert.strictEqual(result[1].author, 'Unknown author');
  assert.strictEqual(result[1].coverId, null);
});
