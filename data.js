/**
 * @fileoverview localStorage key constant and empty built-in song array.
 *
 * The BUILT_IN array is intentionally empty — all songs are now loaded via
 * file import or manual entry, and will eventually come from a SQLite backend.
 */

// ── localStorage keys ─────────────────────────────────────

/** Key for the array of user-added songs. */
const STORAGE_KEY = 'lyric_catcher_songs';

// ── Built-in song library ─────────────────────────────────

/**
 * The built-in song library shipped with the app.
 * Currently empty — songs are managed via import or manual entry.
 * @type {Array<{id: string, title: string, artist: string, album: string|null, lyrics: string}>}
 */
const BUILT_IN = [];
