// ListYourBooks frontend.
// All data comes from my own backend (/api/...). The browser never calls
// Open Library directly, only the cover images are loaded from there.

const STATUSES = ['Want to read', 'Reading', 'Finished'];

// state kept in memory while the page is open
let searchResults = [];
let myBooks = [];
let currentFilter = '';

const searchForm = document.getElementById('search-form');
const searchInput = document.getElementById('search-input');
const searchMessage = document.getElementById('search-message');
const resultsBox = document.getElementById('results');
const myBooksBox = document.getElementById('my-books');
const listMessage = document.getElementById('list-message');
const counter = document.getElementById('counter');
const filters = document.getElementById('filters');

// Small helper around fetch: sends/reads JSON and throws with the
// server's error message if something goes wrong.
async function api(url, options = {}) {
  const response = await fetch(url, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });

  if (response.status === 204) return null;

  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Request failed');
  return data;
}

// Book titles come from outside, so escape them before putting them in HTML.
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text == null ? '' : String(text);
  return div.innerHTML;
}

function showMessage(element, text, isError = false) {
  element.textContent = text;
  element.classList.toggle('error', isError);
}

// Cover from Open Library, or the first letter of the title if there is none.
function coverHtml(book) {
  const letter = escapeHtml((book.title || '?').charAt(0).toUpperCase());
  if (!book.coverId) {
    return `<div class="cover no-cover">${letter}</div>`;
  }
  return `<img class="cover" src="https://covers.openlibrary.org/b/id/${book.coverId}-M.jpg"
            alt="Cover of ${escapeHtml(book.title)}" loading="lazy" data-letter="${letter}">`;
}

// If a cover image fails to load, swap it for the letter box.
function fixBrokenCovers(container) {
  container.querySelectorAll('img.cover').forEach((img) => {
    img.onerror = () => {
      img.outerHTML = `<div class="cover no-cover">${img.dataset.letter}</div>`;
    };
  });
}

function metaLine(book) {
  return escapeHtml(book.author) + (book.year ? ` &middot; ${book.year}` : '');
}


// Search (dynamic part 1)

async function searchBooks(event) {
  event.preventDefault();
  const query = searchInput.value.trim();
  if (!query) return;

  showMessage(searchMessage, 'Searching...');
  resultsBox.innerHTML = '';

  try {
    searchResults = await api('/api/search?q=' + encodeURIComponent(query));
    showMessage(searchMessage, searchResults.length ? `${searchResults.length} results` : 'No books found, try another search.');
    renderResults();
  } catch (err) {
    showMessage(searchMessage, err.message, true);
  }
}

function renderResults() {
  resultsBox.innerHTML = searchResults.map((book, index) => {
    const alreadySaved = myBooks.some((b) => b.olKey === book.olKey);
    return `
      <article class="card">
        ${coverHtml(book)}
        <div class="info">
          <h3>${escapeHtml(book.title)}</h3>
          <p class="meta">${metaLine(book)}</p>
          <button class="add" data-index="${index}" ${alreadySaved ? 'disabled' : ''}>
            ${alreadySaved ? 'On your list' : 'Add to my list'}
          </button>
        </div>
      </article>`;
  }).join('');
  fixBrokenCovers(resultsBox);
}

async function addBook(index) {
  try {
    await api('/api/books', { method: 'POST', body: JSON.stringify(searchResults[index]) });
    await loadMyBooks();
    renderResults(); // so the button changes to "On your list"
  } catch (err) {
    showMessage(searchMessage, err.message, true);
  }
}


// My list (dynamic part 2)

async function loadMyBooks() {
  try {
    // always load everything, filtering happens in renderMyBooks
    // (that way the counter and the "On your list" check stay correct)
    myBooks = await api('/api/books');
    renderMyBooks();
  } catch (err) {
    showMessage(listMessage, err.message, true);
  }
}

function renderMyBooks() {
  const finished = myBooks.filter((b) => b.status === 'Finished').length;
  counter.textContent = `${myBooks.length} books, ${finished} finished`;

  const visible = currentFilter ? myBooks.filter((b) => b.status === currentFilter) : myBooks;

  if (myBooks.length === 0) {
    showMessage(listMessage, 'Your list is empty. Search for a book above to get started.');
  } else if (visible.length === 0) {
    showMessage(listMessage, `No books with status "${currentFilter}".`);
  } else {
    showMessage(listMessage, '');
  }

  myBooksBox.innerHTML = visible.map((book) => {
    const statusOptions = STATUSES.map((s) =>
      `<option ${s === book.status ? 'selected' : ''}>${s}</option>`).join('');

    let ratingOptions = '<option value="">No rating</option>';
    for (let i = 1; i <= 5; i++) {
      ratingOptions += `<option value="${i}" ${book.rating === i ? 'selected' : ''}>${'★'.repeat(i)}</option>`;
    }

    // rating only makes sense once the book is finished
    const ratingSelect = book.status === 'Finished'
      ? `<select class="rating" aria-label="Rating">${ratingOptions}</select>`
      : '';

    return `
      <article class="card" data-id="${book.id}">
        ${coverHtml(book)}
        <div class="info">
          <h3>${escapeHtml(book.title)}</h3>
          <p class="meta">${metaLine(book)}</p>
          <div class="row">
            <select class="status" aria-label="Status">${statusOptions}</select>
            ${ratingSelect}
          </div>
          <input class="note" type="text" maxlength="500" placeholder="Add a note..." value="${escapeHtml(book.note)}">
          <button class="remove">Remove</button>
        </div>
      </article>`;
  }).join('');
  fixBrokenCovers(myBooksBox);
}

async function updateBook(id, changes) {
  try {
    await api('/api/books/' + id, { method: 'PUT', body: JSON.stringify(changes) });
    await loadMyBooks();
  } catch (err) {
    showMessage(listMessage, err.message, true);
  }
}

async function removeBook(id) {
  if (!confirm('Remove this book from your list?')) return;
  try {
    await api('/api/books/' + id, { method: 'DELETE' });
    await loadMyBooks();
    renderResults();
  } catch (err) {
    showMessage(listMessage, err.message, true);
  }
}


// Event listeners
// The cards are re-rendered all the time, so I listen on the containers
// instead of on every single button (event delegation).

searchForm.addEventListener('submit', searchBooks);

resultsBox.addEventListener('click', (e) => {
  if (e.target.classList.contains('add')) addBook(Number(e.target.dataset.index));
});

myBooksBox.addEventListener('change', (e) => {
  const card = e.target.closest('.card');
  if (!card) return;
  const id = card.dataset.id;

  if (e.target.classList.contains('status')) updateBook(id, { status: e.target.value });
  if (e.target.classList.contains('rating')) updateBook(id, { rating: e.target.value ? Number(e.target.value) : null });
  // "change" on a text input fires when you press Enter or click somewhere else
  if (e.target.classList.contains('note')) updateBook(id, { note: e.target.value });
});

myBooksBox.addEventListener('click', (e) => {
  if (e.target.classList.contains('remove')) removeBook(e.target.closest('.card').dataset.id);
});

filters.addEventListener('click', (e) => {
  if (!e.target.classList.contains('filter')) return;
  filters.querySelectorAll('.filter').forEach((btn) => btn.classList.remove('active'));
  e.target.classList.add('active');
  currentFilter = e.target.dataset.status;
  renderMyBooks();
});

// load the saved list when the page opens
loadMyBooks();
