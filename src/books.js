// Everything that has to do with the saved reading list lives here.
//
// The list is stored in a plain JSON file (data/books.json). I thought about
// using a real database, but the app has one user and maybe a few hundred
// books at most, so a file is enough and nobody has to install anything.

const fs = require('fs');
const path = require('path');

// The three states a book can be in. The frontend uses the same names.
const STATUSES = ['Want to read', 'Reading', 'Finished'];

// The data file can be changed with an environment variable.
// The tests use this so they don't overwrite my real list.
function getDataFile() {
  return process.env.DATA_FILE || path.join(__dirname, '..', 'data', 'books.json');
}

function loadBooks() {
  const file = getDataFile();
  if (!fs.existsSync(file)) return [];

  const text = fs.readFileSync(file, 'utf8');
  return text.trim() ? JSON.parse(text) : [];
}

function saveBooks(books) {
  const file = getDataFile();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(books, null, 2));
}

/**
 * Checks the values coming from the browser.
 * Returns an error message (string) or null if everything is fine.
 * isNew = true means we are adding a book, so a title is required.
 */
function validate(data, isNew) {
  if (isNew && (!data.title || !String(data.title).trim())) {
    return 'Title is required';
  }
  if (data.status !== undefined && !STATUSES.includes(data.status)) {
    return 'Status must be one of: ' + STATUSES.join(', ');
  }
  // rating can be null (= no rating yet), otherwise a whole number 1-5
  if (data.rating !== undefined && data.rating !== null) {
    const rating = Number(data.rating);
    if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
      return 'Rating must be a whole number from 1 to 5';
    }
  }
  if (data.note !== undefined && String(data.note).length > 500) {
    return 'Note is too long (max 500 characters)';
  }
  return null;
}

// Returns all books, or only the ones with the given status.
function listBooks(status) {
  const books = loadBooks();
  return status ? books.filter((b) => b.status === status) : books;
}

function addBook(data) {
  const books = loadBooks();

  // Same Open Library book twice makes no sense, so block it.
  if (data.olKey && books.some((b) => b.olKey === data.olKey)) {
    return { error: 'This book is already on your list' };
  }

  const book = {
    // simple unique id: time + a bit of randomness
    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    title: String(data.title).trim(),
    author: data.author || 'Unknown author',
    year: data.year || null,
    coverId: data.coverId || null,
    olKey: data.olKey || null,
    status: data.status || 'Want to read',
    rating: null,
    note: '',
    addedAt: new Date().toISOString(),
  };

  books.push(book);
  saveBooks(books);
  return { book };
}

// Only status, rating and note can be changed. Title/author come from
// Open Library and stay as they are. Returns the updated book or null.
function updateBook(id, changes) {
  const books = loadBooks();
  const book = books.find((b) => b.id === id);
  if (!book) return null;

  if (changes.status !== undefined) book.status = changes.status;
  if (changes.rating !== undefined) {
    book.rating = changes.rating === null ? null : Number(changes.rating);
  }
  if (changes.note !== undefined) book.note = String(changes.note).trim();

  saveBooks(books);
  return book;
}

// Returns true if something was deleted.
function deleteBook(id) {
  const books = loadBooks();
  const remaining = books.filter((b) => b.id !== id);
  if (remaining.length === books.length) return false;

  saveBooks(remaining);
  return true;
}

module.exports = { STATUSES, validate, listBooks, addBook, updateBook, deleteBook };
