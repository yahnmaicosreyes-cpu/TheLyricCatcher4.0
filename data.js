/**
 * @fileoverview API client for the Lyric Catcher backend.
 *
 * Replaces the old localStorage approach — all songs live in the SQLite
 * database and are accessed through the /api/songs endpoints.
 *
 * On page load, loadAllSongs() fetches every song into an in-memory cache
 * so that search and rendering remain synchronous and fast.  Mutations
 * (create / update / delete) call the API first, then refresh the cache.
 */

const API_BASE = '/api/songs';

/** @type {Array<Object>} In-memory song cache, populated from the API. */
let _songs = [];

/**
 * Fetch all songs from the API into the cache.
 * Call once on page load; also called after mutations to stay in sync.
 */
async function loadAllSongs() {
  const res = await fetch(API_BASE);
  if (!res.ok) throw new Error(`Failed to load songs: ${res.status}`);
  _songs = await res.json();
}

/**
 * Return the cached song list (synchronous — used by search and render).
 * @returns {Array<Object>}
 */
function getAllSongs() {
  return _songs;
}

/**
 * Create a new song via the API.
 * @param {{title: string, artist: string, album?: string|null, genre?: string|null, lyrics: string}} data
 * @returns {Promise<Object>} The created song (with id from the database).
 */
async function apiCreateSong(data) {
  const res = await fetch(API_BASE, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || `Create failed: ${res.status}`);
  }
  return res.json();
}

/**
 * Update an existing song via the API. Only provided fields are changed.
 * @param {number} id
 * @param {Object} updates
 * @returns {Promise<Object>} The updated song.
 */
async function apiUpdateSong(id, updates) {
  const res = await fetch(`${API_BASE}/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(updates),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || `Update failed: ${res.status}`);
  }
  return res.json();
}

/**
 * Delete a song via the API.
 * @param {number} id
 */
async function apiDeleteSong(id) {
  const res = await fetch(`${API_BASE}/${id}`, { method: 'DELETE' });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || `Delete failed: ${res.status}`);
  }
}
