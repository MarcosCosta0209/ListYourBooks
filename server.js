// ListYourBooks backend.
//
// I used Node's built-in http module instead of Express. The app only has
// a few routes, so a small router is easy enough to write myself, and the
// project has zero dependencies (no "npm install" needed).
//
// Routes:
//   GET    /api/search?q=...        search Open Library (through this server)
//   GET    /api/books?status=...    my saved books, optional status filter
//   POST   /api/books               add a book
//   PUT    /api/books/:id           change status, rating or note
//   DELETE /api/books/:id           remove a book
// Everything else is treated as a file from the public folder.

const http = require('http');
const fs = require('fs');
const path = require('path');

const books = require('./src/books');
const openLibrary = require('./src/openLibrary');

const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(__dirname, 'public');

const CONTENT_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

function sendJson(res, status, data) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(data));
}

// Collects the request body and parses it as JSON.
function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk;
      // nobody needs to send more than this for a book
      if (body.length > 10000) reject(new Error('Body too large'));
    });
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch {
        reject(new Error('Invalid JSON'));
      }
    });
  });
}

function serveStatic(res, pathname) {
  if (pathname === '/') pathname = '/index.html';

  // path.normalize + the startsWith check stop requests like /../server.js
  const filePath = path.join(PUBLIC_DIR, path.normalize(pathname));
  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403);
    return res.end('Forbidden');
  }

  fs.readFile(filePath, (err, content) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      return res.end('Not found');
    }
    const type = CONTENT_TYPES[path.extname(filePath)] || 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': type });
    res.end(content);
  });
}

async function handleApi(req, res, url) {
  const { pathname, searchParams } = url;
  const method = req.method;

  // Search on Open Library
  if (pathname === '/api/search' && method === 'GET') {
    const q = (searchParams.get('q') || '').trim();
    if (!q) return sendJson(res, 400, { error: 'Please type a title or an author' });

    try {
      const results = await openLibrary.searchBooks(q);
      return sendJson(res, 200, results);
    } catch (err) {
      console.error('Search failed:', err.message);
      return sendJson(res, 502, { error: 'Open Library is not reachable right now, try again later' });
    }
  }

  // My list: read all / add one
  if (pathname === '/api/books') {
    if (method === 'GET') {
      const status = searchParams.get('status');
      if (status && !books.STATUSES.includes(status)) {
        return sendJson(res, 400, { error: 'Unknown status' });
      }
      return sendJson(res, 200, books.listBooks(status));
    }

    if (method === 'POST') {
      const data = await readBody(req);
      const error = books.validate(data, true);
      if (error) return sendJson(res, 400, { error });

      const result = books.addBook(data);
      if (result.error) return sendJson(res, 409, { error: result.error });
      return sendJson(res, 201, result.book);
    }
  }

  // My list: change or delete one book, e.g. /api/books/abc123
  const match = pathname.match(/^\/api\/books\/([\w-]+)$/);
  if (match) {
    const id = match[1];

    if (method === 'PUT') {
      const data = await readBody(req);
      const error = books.validate(data, false);
      if (error) return sendJson(res, 400, { error });

      const book = books.updateBook(id, data);
      if (!book) return sendJson(res, 404, { error: 'Book not found' });
      return sendJson(res, 200, book);
    }

    if (method === 'DELETE') {
      if (!books.deleteBook(id)) return sendJson(res, 404, { error: 'Book not found' });
      res.writeHead(204);
      return res.end();
    }
  }

  sendJson(res, 404, { error: 'Unknown API route' });
}

function createServer() {
  return http.createServer(async (req, res) => {
    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);

    try {
      if (url.pathname.startsWith('/api/')) {
        await handleApi(req, res, url);
      } else {
        serveStatic(res, url.pathname);
      }
    } catch (err) {
      // readBody errors end up here (bad JSON etc.)
      const status = err.message === 'Invalid JSON' || err.message === 'Body too large' ? 400 : 500;
      if (status === 500) console.error(err);
      sendJson(res, status, { error: status === 400 ? err.message : 'Something went wrong on the server' });
    }
  });
}

// Only start listening when run directly (node server.js).
// The tests import createServer and start it on their own port.
if (require.main === module) {
  createServer().listen(PORT, () => {
    console.log(`ListYourBooks is running on http://localhost:${PORT}`);
  });
}

module.exports = { createServer };
