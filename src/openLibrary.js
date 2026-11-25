// Talks to the Open Library Search API (https://openlibrary.org/dev/docs/api/search).
// No API key is needed. Only the backend calls it, the browser only ever
// talks to my own server.

const SEARCH_URL = 'https://openlibrary.org/search.json';

// Open Library asks apps to say who they are and how to contact them
// (a link or an email is fine), so I send the link to the GitHub repo.
const USER_AGENT = 'ListYourBooks/1.0 (+https://github.com/MarcosCosta0209/ListYourBooks)';

// Only ask for the fields I actually show, this makes the answer much smaller.
const FIELDS = 'key,title,author_name,first_publish_year,cover_i';

/**
 * Open Library returns a lot of data per book.
 * This keeps just what the frontend needs, with sensible fallbacks.
 */
function simplifyResults(data) {
  const docs = (data && data.docs) || [];
  return docs.map((doc) => ({
    olKey: doc.key,
    title: doc.title,
    // some books have many authors, two is enough for a card
    author: doc.author_name ? doc.author_name.slice(0, 2).join(', ') : 'Unknown author',
    year: doc.first_publish_year || null,
    coverId: doc.cover_i || null,
  }));
}

async function searchBooks(query) {
  const url = `${SEARCH_URL}?q=${encodeURIComponent(query)}&limit=12&fields=${FIELDS}`;

  const response = await fetch(url, { headers: { 'User-Agent': USER_AGENT } });
  if (!response.ok) {
    throw new Error('Open Library answered with status ' + response.status);
  }

  return simplifyResults(await response.json());
}

module.exports = { searchBooks, simplifyResults };
