/**
 * @fileoverview The Lyric Catcher — application logic.
 *
 * Module map
 * ──────────
 *  File Import parseTxtFile / addSongs / updateSongCount / showToast /
 *              handleFile / drop-zone event listeners
 *
 *  Search      normalize / tokenize / STOP_WORDS / meaningTokens /
 *              levenshtein / soundex / scoreToken / phraseScore /
 *              ngramOverlap / getBestSnippet / parseSections /
 *              capitalize / getThreshold / searchSong / search
 *
 *  Render      debounce + input listener / render
 *
 *  Song Modal  openSongModal / close listeners
 *
 *  Library     escHtml / deleteSong / saveSongEdit / addManualSong /
 *              openEditForm / renderLibrary / library event listeners
 *
 *  Init        loadAllSongs() → updateSongCount()
 *
 * Dependencies (must load before this file)
 * ──────────────────────────────────────────
 *  data.js — API client (loadAllSongs, getAllSongs, apiCreateSong, etc.)
 */

// ── File Import ────────────────────────────────────────────

/**
 * Parse a multi-song .txt file into song objects.
 *
 * Expected format — one song per block, blocks separated by "---" on its own line:
 *
 *   TITLE:  Song Title
 *   ARTIST: Artist Name
 *   ALBUM:  Album Name    ← optional
 *   LYRICS:
 *   Lyrics go here...
 *
 * @param {string} text - Raw file content.
 * @returns {Array<Object>} Parsed song objects (only blocks with title, artist,
 *   and lyrics are included; malformed blocks are silently skipped).
 */
function parseTxtFile(text) {
  const songs = [];
  const blocks = text.split(/^---$/m).map(b => b.trim()).filter(Boolean);
  for (const block of blocks) {
    const titleMatch = block.match(/^TITLE:\s*(.+)$/m);
    const artistMatch = block.match(/^ARTIST:\s*(.+)$/m);
    const albumMatch = block.match(/^ALBUM:\s*(.+)$/m);
    const lyricsMatch = block.match(/^LYRICS:\s*\n([\s\S]+)$/m);
    if (titleMatch && artistMatch && lyricsMatch) {
      songs.push({
        id: 'user_' + Date.now() + '_' + Math.random().toString(36).slice(2),
        title: titleMatch[1].trim(),
        artist: artistMatch[1].trim(),
        album: albumMatch ? albumMatch[1].trim() : null,
        lyrics: lyricsMatch[1].trim()
      });
    }
  }
  return songs;
}

/**
 * Add songs to the library via the API, skipping duplicates.
 * Duplicate check: case-insensitive title + artist match against all current songs.
 * @param {Array<Object>} newSongs
 * @returns {Promise<number>} Count of songs actually added.
 */
async function addSongs(newSongs) {
  const existing = getAllSongs();
  const deduplicated = newSongs.filter(ns =>
    !existing.some(s =>
      s.title.toLowerCase() === ns.title.toLowerCase() &&
      s.artist.toLowerCase() === ns.artist.toLowerCase()
    )
  );
  try {
    for (const song of deduplicated) {
      await apiCreateSong({
        title: song.title,
        artist: song.artist,
        album: song.album || null,
        genre: 'Christian Worship Music',
        lyrics: song.lyrics,
      });
    }
  } finally {
    await loadAllSongs();
  }
  return deduplicated.length;
}

/**
 * Update the song count display below the drop zone.
 */
function updateSongCount() {
  const count = getAllSongs().length;
  document.getElementById('song-count').textContent =
    `${count} song${count !== 1 ? 's' : ''} in library`;
}

/**
 * Show a temporary status message in the toast element.
 * Clears automatically after 4 seconds.
 * @param {string} msg
 */
function showToast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  setTimeout(() => { t.textContent = ''; }, 4000);
}

/** Maximum allowed size for an uploaded song file (5 MB). */
const MAX_FILE_SIZE = 5 * 1024 * 1024;

/**
 * Read a dropped or chosen .txt file and import its songs.
 * Validates the file type, size, and MIME type before parsing.
 * @param {File} file
 */
function handleFile(file) {
  if (!file || !file.name.endsWith('.txt')) { showToast('Please use a .txt file.'); return; }
  if (file.size > MAX_FILE_SIZE) { showToast('File too large. Maximum size is 5 MB.'); return; }
  if (file.type && file.type !== 'text/plain') { showToast('Please use a .txt file.'); return; }
  const reader = new FileReader();
  reader.onload = async e => {
    const parsed = parseTxtFile(e.target.result);
    if (parsed.length === 0) { showToast('No valid songs found. Check the file format.'); return; }
    try {
      const added = await addSongs(parsed);
      updateSongCount();
      showToast(added > 0
        ? `${added} song${added !== 1 ? 's' : ''} added to library.`
        : 'Songs already in library — nothing new added.'
      );
    } catch (err) {
      showToast('Error importing songs. Please try again.');
    }
  };
  reader.readAsText(file);
}

// ── Drop Zone ──────────────────────────────────────────────

const dropZone = document.getElementById('drop-zone');
const fileInput = document.getElementById('file-input');
const chooseBtn = document.getElementById('choose-btn');

dropZone.addEventListener('dragover', e => { e.preventDefault(); dropZone.classList.add('drag-over'); });
dropZone.addEventListener('dragleave', () => dropZone.classList.remove('drag-over'));
dropZone.addEventListener('drop', e => {
  e.preventDefault();
  dropZone.classList.remove('drag-over');
  Array.from(e.dataTransfer.files).forEach(handleFile);
});
chooseBtn.addEventListener('click', () => fileInput.click());
fileInput.addEventListener('change', () => { Array.from(fileInput.files).forEach(handleFile); });

// ── Search / Scoring ───────────────────────────────────────

/**
 * Lowercase, normalize smart quotes, strip punctuation, collapse whitespace.
 * @param {string} str
 * @returns {string}
 */
function normalize(str) {
  return str.toLowerCase()
    .replace(/['']/g, "'")
    .replace(/[^a-z0-9\s']/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Split a normalized string into word tokens, dropping empty strings.
 * @param {string} str
 * @returns {string[]}
 */
function tokenize(str) { return normalize(str).split(' ').filter(w => w.length > 0); }

/**
 * Common English words excluded from search scoring.
 * When the query consists entirely of stop words, the full token list is used
 * as a fallback so short common-word queries still return results.
 * @type {Set<string>}
 */
const STOP_WORDS = new Set([
  'i','a','the','and','or','in','on','at','to','is','it','of',
  'my','me','we','your','his','her','our','are','was','be',
  'by','an','so','no','do','up','oh','for','but','not'
]);

/**
 * Return only the non-stop-word tokens from a string.
 * @param {string} str
 * @returns {string[]}
 */
function meaningTokens(str) { return tokenize(str).filter(w => !STOP_WORDS.has(w)); }

/**
 * Compute the Levenshtein edit distance between two strings.
 * Used by scoreToken for fuzzy matching.
 * @param {string} a
 * @param {string} b
 * @returns {number}
 */
function levenshtein(a, b) {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  const dp = Array.from({length: a.length + 1}, (_, i) => [i]);
  for (let j = 1; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++)
      dp[i][j] = a[i-1] === b[j-1] ? dp[i-1][j-1] : 1 + Math.min(dp[i-1][j], dp[i][j-1], dp[i-1][j-1]);
  return dp[a.length][b.length];
}

/**
 * Map a word to a 4-character Soundex code for phonetic matching.
 * Words that sound alike (e.g. "surrender" / "surrendr") produce the same code.
 * Guards against false positives on short words — returns '' for inputs under 2 chars.
 *
 * Soundex rules:
 *   1. Keep first letter.
 *   2. Encode remaining consonants: B/F/P/V=1  C/G/J/K/Q/S/X/Z=2  D/T=3  L=4  M/N=5  R=6
 *   3. Drop adjacent duplicates, drop vowels and H/W/Y.
 *   4. Pad with zeros to length 4, or truncate at 4.
 *
 * @param {string} str
 * @returns {string} 4-character Soundex code, or '' for invalid input.
 */
function soundex(str) {
  const map = {B:1,F:1,P:1,V:1,C:2,G:2,J:2,K:2,Q:2,S:2,X:2,Z:2,D:3,T:3,L:4,M:5,N:5,R:6};
  const s = str.toUpperCase().replace(/[^A-Z]/g, '');
  if (s.length < 2) return '';
  let code = s[0];
  let prev = map[s[0]] || 0;
  for (let i = 1; i < s.length; i++) {
    const curr = map[s[i]] || 0;
    if (curr && curr !== prev) { code += curr; if (code.length === 4) break; }
    prev = curr;
  }
  return (code + '000').slice(0, 4);
}

/**
 * Score one query token against the best-matching token in a target list.
 *
 * Score tiers (checked in order, returns on first hit):
 *   1.0 — exact match
 *   0.9 — target starts with the full query token (prefix match)
 *   0.75 — target shares first 5+ characters (long prefix match)       ← new
 *   0.6 — target shares first 3 characters (loose prefix match)
 *   0.5 — Levenshtein edit distance within tolerance:
 *            words > 5 chars: ≤ 40% of length  (was 35%)              ← loosened
 *            words ≤ 5 chars: ≤ 35% of length  (unchanged)
 *   0.4 — Soundex phonetic match (sounds alike, both words > 3 chars)  ← new
 *   0.0 — no match
 *
 * @param {string} qt - Single query token.
 * @param {string[]} targetTokens
 * @returns {number} Score in [0, 1].
 */
function scoreToken(qt, targetTokens) {
  for (const tt of targetTokens) {
    if (tt === qt) return 1;
    if (tt.startsWith(qt)) return 0.9;
    if (qt.length > 5 && tt.startsWith(qt.slice(0, 5))) return 0.75;
    if (qt.length > 3 && tt.startsWith(qt.slice(0, 3))) return 0.6;
    const tolerance = qt.length > 5 ? 0.40 : 0.35;
    if (qt.length > 2 && levenshtein(qt, tt) <= Math.floor(qt.length * tolerance)) return 0.5;
    if (qt.length > 3 && tt.length > 3 && soundex(qt) === soundex(tt)) return 0.4;
  }
  return 0;
}

/**
 * Average scoreToken result for all query tokens against a target string.
 * A score of 1.0 means every query token matched perfectly.
 * @param {string[]} queryTokens
 * @param {string} targetStr
 * @returns {number} Score in [0, 1].
 */
function ngramOverlap(queryTokens, targetStr) {
  const targetTokens = tokenize(targetStr);
  if (queryTokens.length === 0) return 0;
  let total = 0;
  for (const qt of queryTokens) total += scoreToken(qt, targetTokens);
  return total / queryTokens.length;
}

/**
 * Find the 14-word sliding window in `text` that best matches the query tokens.
 * Used to generate the preview snippet shown on each result card.
 * @param {string[]} queryTokens
 * @param {string} text
 * @returns {string} Best-matching excerpt (up to 14 words).
 */
function getBestSnippet(queryTokens, text) {
  const words = text.split(' ');
  const windowSize = Math.min(14, words.length);
  let best = { score: -1, start: 0 };
  for (let i = 0; i <= words.length - windowSize; i++) {
    const score = ngramOverlap(queryTokens, words.slice(i, i + windowSize).join(' '));
    if (score > best.score) best = { score, start: i };
  }
  return words.slice(best.start, best.start + windowSize).join(' ');
}

/**
 * Score how well query tokens appear as a consecutive phrase in a target string.
 * Finds the longest unbroken run of consecutive query tokens that appears
 * verbatim (space-joined) inside the normalized target, and returns that
 * run length as a proportion of the total query length.
 *
 * Example: query ["i","love","you","lord"], target contains "love you lord"
 *   → best run = 3, score = 3/4 = 0.75
 *
 * Uses all query tokens (including stop words) so that common words like
 * "you" contribute to phrase identity when they appear in sequence.
 *
 * @param {string[]} queryTokens - All query tokens, including stop words.
 * @param {string} normalizedTarget - Pre-normalized lyrics string.
 * @returns {number} Score in [0, 1] — 1.0 means the full phrase matched verbatim.
 */
function phraseScore(queryTokens, normalizedTarget) {
  if (queryTokens.length === 0) return 0;
  let best = 0;
  for (let start = 0; start < queryTokens.length; start++) {
    for (let end = start + 1; end <= queryTokens.length; end++) {
      if (normalizedTarget.includes(queryTokens.slice(start, end).join(' '))) {
        best = Math.max(best, end - start);
      } else {
        break; // extending the window further won't match
      }
    }
  }
  return best / queryTokens.length;
}

/**
 * Split lyrics into labeled sections using [bracket] markers.
 * Recognized labels: verse, chorus, bridge, pre-chorus, hook, intro, outro, refrain.
 *
 * Example input:  "[Verse 1]\nLyric line\n\n[Chorus]\nMore lyrics"
 * Example output: [{ label: 'verse', text: 'Lyric line' }, { label: 'chorus', text: 'More lyrics' }]
 *
 * Lyrics without bracket markers are returned as a single section with label: null.
 * In that case the song modal renders the lyrics as plain text with no section headers.
 *
 * @param {string} lyrics
 * @returns {Array<{label: string|null, text: string}>}
 */
function parseSections(lyrics) {
  const sectionPattern = /\[(verse|chorus|bridge|pre-chorus|post-chorus|hook|intro|outro|refrain|tag|interlude|spontaneous|lyrics needed)[^\]]*\]/gi;
  if (!sectionPattern.test(lyrics)) return [{ label: null, text: lyrics }];
  sectionPattern.lastIndex = 0;
  const sections = [];
  let lastIndex = 0;
  let lastLabel = null;
  let match;
  while ((match = sectionPattern.exec(lyrics)) !== null) {
    if (lastLabel !== null) {
      const text = lyrics.slice(lastIndex, match.index).trim();
      if (text) sections.push({ label: lastLabel, text });
    }
    lastLabel = match[1].toLowerCase();
    lastIndex = match.index + match[0].length;
  }
  if (lastLabel !== null) {
    const text = lyrics.slice(lastIndex).trim();
    if (text) sections.push({ label: lastLabel, text });
  }
  return sections.length > 0 ? sections : [{ label: null, text: lyrics }];
}

/**
 * Capitalize the first character of a string.
 * @param {string} str
 * @returns {string}
 */
function capitalize(str) { return str.charAt(0).toUpperCase() + str.slice(1); }

/**
 * Return the minimum score a song must reach to appear in results.
 * Shorter queries get lower thresholds to reduce over-filtering when the
 * user is still typing.
 * @param {string} query - Raw user input.
 * @returns {number}
 */
function getThreshold(query) {
  const len = query.trim().length;
  if (len <= 1) return 0.0;
  if (len <= 3) return 0.01;
  return 0.08;
}

/**
 * Score a single song against the effective query tokens.
 *
 * Scoring priorities — higher multiplier = ranked above lower multiplier:
 *   ×6   Consecutive phrase match in full lyrics (verbatim sequence of query tokens)
 *   ×4   First 40 words of lyrics (opening hook)
 *   ×2   Remaining lyrics
 *   ×1.5 Parsed lyric sections (also resolves section labels for UI display)
 *   ×1   Title, artist, album
 *
 * `matchedField` is set to 'opening' for lyric matches — this sentinel value
 * tells the render function to hide the field label (we don't surface "Opening"
 * as a UI label). For title/artist/album matches the actual field name is used
 * and shown on the result card.
 *
 * @param {Object} song
 * @param {string[]} effective - Meaningful (non-stop-word) query tokens, or all
 *   tokens if the query was entirely stop words.
 * @param {string[]} qTokens - All query tokens including stop words, used for
 *   phrase matching where word order and common words carry identity.
 * @returns {{score: number, snippet: string, matchedField: string|null}}
 */
function searchSong(song, effective, qTokens) {
  let bestScore = -1;
  let bestSnippet = '';
  let matchedField = null;

  // Priority 0 — consecutive phrase match (highest boost).
  // Checks whether the query tokens appear verbatim and in sequence anywhere
  // in the lyrics. Uses all tokens (including stop words like "you") because
  // word order is the signal here, not semantic weight.
  // A full phrase match scores 6.0, outranking all other priorities.
  if (qTokens.length >= 2) {
    const normLyrics = normalize(song.lyrics);
    const ps = phraseScore(qTokens, normLyrics) * 6;
    if (ps > bestScore) { bestScore = ps; bestSnippet = getBestSnippet(qTokens, song.lyrics); matchedField = 'opening'; }
  }

  // Priority 1 — opening hook (first 40 words), highest boost.
  // Strip any leading section label (case-insensitive) before windowing so the
  // 40-word window captures actual lyric content, not a header like "Verse 1".
  // Matches at position 0 only: verse, verse N, chorus, bridge, pre chorus, pre-chorus.
  const lyricsBody = song.lyrics.replace(/^\[?(verse(\s+\d+)?|chorus|bridge|pre[-\s]chorus)\]?\s*/i, '');
  const openingWords = lyricsBody.split(' ').slice(0, 40).join(' ');
  const openingScore = ngramOverlap(effective, openingWords) * 4;
  if (openingScore > bestScore) { bestScore = openingScore; bestSnippet = openingWords; matchedField = 'opening'; }

  // Priority 2 — rest of lyrics after the opening
  const restWords = song.lyrics.split(' ').slice(20).join(' ');
  if (restWords) {
    const restScore = ngramOverlap(effective, restWords) * 2;
    if (restScore > bestScore) { bestScore = restScore; bestSnippet = getBestSnippet(effective, restWords); matchedField = 'opening'; }
  }

  // Priority 3 — parsed sections (enables section label display; also helps
  // when query tokens are spread across opening + rest and the full-text score
  // exceeds the windowed opening or rest score)
  const sections = parseSections(song.lyrics);
  for (const section of sections) {
    const score = ngramOverlap(effective, section.text) * 1.5;
    if (score > bestScore) { bestScore = score; bestSnippet = getBestSnippet(effective, section.text); matchedField = section.label; }
  }

  // Priority 4 — title, artist, album (lowest boost)
  const titleScore = ngramOverlap(effective, song.title) * 1;
  if (titleScore > bestScore) { bestScore = titleScore; bestSnippet = song.title; matchedField = 'title'; }

  const artistScore = ngramOverlap(effective, song.artist) * 1;
  if (artistScore > bestScore) { bestScore = artistScore; bestSnippet = song.artist; matchedField = 'artist'; }

  if (song.album) {
    const albumScore = ngramOverlap(effective, song.album) * 1;
    if (albumScore > bestScore) { bestScore = albumScore; bestSnippet = song.album; matchedField = 'album'; }
  }

  return { score: bestScore, snippet: bestSnippet, matchedField };
}

/**
 * Run the full search pipeline against all songs.
 * @param {string} query - Raw user input.
 * @returns {Array<{song: Object, score: number, snippet: string, matchedField: string|null}>}
 *   Sorted descending by score, filtered to results above the query threshold.
 */
function search(query) {
  if (!query.trim()) return [];
  const qTokens = tokenize(query);
  const qMeaning = meaningTokens(query);
  // Fall back to all tokens when the query is entirely stop words (e.g. "i am")
  const effective = qMeaning.length > 0 ? qMeaning : qTokens;
  const threshold = getThreshold(query);
  return getAllSongs()
    .map(song => {
      const { score, snippet, matchedField } = searchSong(song, effective, qTokens);
      return { song, score, snippet, matchedField };
    })
    .filter(r => r.score > threshold)
    .sort((a, b) => b.score - a.score);
}

// ── Render ─────────────────────────────────────────────────

let debounceTimer;
const input = document.getElementById('search-input');
const resultsEl = document.getElementById('results');
const statusEl = document.getElementById('status');
const noResultsEl = document.getElementById('no-results');

// Debounce input at 80ms so search doesn't fire on every keystroke
input.addEventListener('input', () => {
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => render(input.value), 80);
});

/**
 * Run a search and render result cards into the results list.
 * Shows up to 6 results; the top result gets a "Best match" badge,
 * others show a percentage score.
 * @param {string} query - Raw user input.
 */
function render(query) {
  resultsEl.innerHTML = '';
  noResultsEl.style.display = 'none';
  if (!query.trim()) {
    statusEl.textContent = 'Type a lyric snippet — verse or chorus — to find the song.';
    return;
  }
  const results = search(query);
  statusEl.textContent = results.length > 0 ? `${results.length} match${results.length > 1 ? 'es' : ''} found` : '';
  if (results.length === 0) { noResultsEl.style.display = 'block'; return; }
  results.slice(0, 6).forEach((r, i) => {
    const card = document.createElement('div');
    card.className = 'result-card' + (i === 0 ? ' top-match' : '');
    const pct = Math.min(99, Math.round(r.score * 100));
    const badge = i === 0
      ? `<span class="top-badge">Best match</span>`
      : `<span class="score-badge">${pct}%</span>`;
    // Field label is shown for title/artist/album matches; hidden for lyric matches
    // ('opening' is the internal sentinel meaning "matched in lyrics, no label needed")
    const fieldLabel = (r.matchedField && r.matchedField !== 'opening')
      ? `<div class="match-field">${capitalize(r.matchedField)}</div>`
      : '';
    const albumMeta = r.song.album ? ` · ${escHtml(r.song.album)}` : '';
    card.innerHTML = `${badge}<div class="song-title">${escHtml(r.song.title)}</div><div class="song-meta">${escHtml(r.song.artist)}${albumMeta}</div>${fieldLabel}<div class="match-snippet">${escHtml(r.snippet)}...</div>`;
    card.addEventListener('click', () => openSongModal(r.song));
    resultsEl.appendChild(card);
  });
}

// ── Song Detail Modal ──────────────────────────────────────

/**
 * Open the song detail modal for the given song.
 * Renders styled section headers if the lyrics use [bracket] markers;
 * otherwise renders the full lyrics as a single plain-text block.
 * @param {Object} song
 */
function openSongModal(song) {
  document.getElementById('song-modal-title').textContent = song.title;
  document.getElementById('song-modal-meta').textContent =
    song.album ? `${song.artist} · ${song.album}` : song.artist;
  const lyricsEl = document.getElementById('song-modal-lyrics');
  lyricsEl.innerHTML = '';
  const sections = parseSections(song.lyrics);
  if (sections.length === 1 && sections[0].label === null) {
    // No bracket markers — render as a single plain block
    const p = document.createElement('div');
    p.className = 'lyrics-section-text';
    p.textContent = sections[0].text;
    lyricsEl.appendChild(p);
  } else {
    // Bracket markers found — render each section with a styled label
    sections.forEach(section => {
      if (section.label) {
        const label = document.createElement('div');
        label.className = 'lyrics-section-label';
        label.textContent = capitalize(section.label);
        lyricsEl.appendChild(label);
      }
      const text = document.createElement('div');
      text.className = 'lyrics-section-text';
      text.textContent = section.text;
      lyricsEl.appendChild(text);
    });
  }
  document.getElementById('song-modal').style.display = 'block';
}

document.getElementById('song-modal-close').addEventListener('click', () => {
  document.getElementById('song-modal').style.display = 'none';
});
document.getElementById('song-overlay').addEventListener('click', () => {
  document.getElementById('song-modal').style.display = 'none';
});

// ── Library Modal ──────────────────────────────────────────

/**
 * Escape a string for safe insertion into innerHTML.
 * Prevents XSS when rendering user-supplied song titles, artists, and lyrics.
 * @param {string} str
 * @returns {string}
 */
function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Delete a song by ID via the API.
 * @param {number} id
 */
async function deleteSong(id) {
  await apiDeleteSong(id);
  await loadAllSongs();
}

/**
 * Save edits to a song via the API.
 * @param {number} id
 * @param {{title?: string, artist?: string, album?: string|null, lyrics?: string}} updates
 */
async function saveSongEdit(id, updates) {
  await apiUpdateSong(id, updates);
  await loadAllSongs();
}

/**
 * Add a song entered manually via the library form.
 * @param {string} title
 * @param {string} artist
 * @param {string} album - Pass empty string for no album.
 * @param {string} lyrics
 * @returns {Promise<'added'|'duplicate'|'missing'>} Result status.
 */
async function addManualSong(title, artist, album, lyrics) {
  if (!title.trim() || !artist.trim() || !lyrics.trim()) return 'missing';
  const existing = getAllSongs();
  const isDupe = existing.some(s =>
    s.title.toLowerCase() === title.trim().toLowerCase() &&
    s.artist.toLowerCase() === artist.trim().toLowerCase()
  );
  if (isDupe) return 'duplicate';
  await apiCreateSong({
    title: title.trim(),
    artist: artist.trim(),
    album: album.trim() || null,
    genre: 'Christian Worship Music',
    lyrics: lyrics.trim(),
  });
  await loadAllSongs();
  return 'added';
}

/**
 * Replace a library row with an inline edit form for the given song.
 * Saves via saveSongEdit and re-renders the library on confirm.
 * @param {HTMLElement} row - The .lib-song-row element to replace.
 * @param {Object} song
 */
function openEditForm(row, song) {
  row.innerHTML = `
    <div class="lib-edit-form">
      <input class="edit-title" value="${escHtml(song.title)}" placeholder="Title" />
      <input class="edit-artist" value="${escHtml(song.artist)}" placeholder="Artist" />
      <input class="edit-album" value="${escHtml(song.album || '')}" placeholder="Album (optional)" />
      <textarea class="edit-lyrics" placeholder="Lyrics">${escHtml(song.lyrics)}</textarea>
      <div class="lib-edit-actions">
        <button class="lib-btn-save edit-save">Save</button>
        <button class="lib-btn-cancel edit-cancel">Cancel</button>
      </div>
    </div>
  `;
  row.querySelector('.edit-save').addEventListener('click', async () => {
    const title = row.querySelector('.edit-title').value.trim();
    const artist = row.querySelector('.edit-artist').value.trim();
    const album = row.querySelector('.edit-album').value.trim();
    const lyrics = row.querySelector('.edit-lyrics').value.trim();
    if (!title || !artist || !lyrics) { alert('Title, artist, and lyrics are required.'); return; }
    try {
      await saveSongEdit(song.id, { title, artist, album: album || null, lyrics });
      renderLibrary();
      updateSongCount();
    } catch (err) {
      showToast('Error saving changes. Please try again.');
    }
  });
  row.querySelector('.edit-cancel').addEventListener('click', renderLibrary);
}

/**
 * Render the full song list into the library modal body.
 * Each row has Edit and Delete actions.
 */
function renderLibrary() {
  const songs = getAllSongs();
  const body = document.getElementById('library-body');
  body.innerHTML = '';
  if (songs.length === 0) {
    body.innerHTML = '<div class="lib-empty">No songs in library.</div>';
    return;
  }
  songs.forEach(song => {
    const row = document.createElement('div');
    row.className = 'lib-song-row';
    row.innerHTML = `
      <div class="lib-song-info">
        <div class="lib-song-title">${escHtml(song.title)}</div>
        <div class="lib-song-meta">${escHtml(song.artist)}${song.album ? ' · ' + escHtml(song.album) : ''}</div>
      </div>
      <div class="lib-song-actions">
        <button class="lib-btn edit-btn">Edit</button>
        <button class="lib-btn lib-delete-btn">Delete</button>
      </div>
    `;
    row.querySelector('.edit-btn').addEventListener('click', () => openEditForm(row, song));
    row.querySelector('.lib-delete-btn').addEventListener('click', async () => {
      if (confirm(`Delete "${song.title}"?`)) {
        try {
          await deleteSong(song.id);
          renderLibrary();
          updateSongCount();
        } catch (err) {
          showToast('Error deleting song. Please try again.');
        }
      }
    });
    body.appendChild(row);
  });
}

document.getElementById('library-btn').addEventListener('click', () => {
  document.getElementById('library-modal').style.display = 'block';
  document.getElementById('add-song-form').style.display = 'none';
  renderLibrary();
});
document.getElementById('library-close').addEventListener('click', () => {
  document.getElementById('library-modal').style.display = 'none';
});
document.getElementById('library-overlay').addEventListener('click', () => {
  document.getElementById('library-modal').style.display = 'none';
});
document.getElementById('library-add-toggle').addEventListener('click', () => {
  const form = document.getElementById('add-song-form');
  form.style.display = form.style.display === 'none' ? 'block' : 'none';
});
document.getElementById('add-song-submit').addEventListener('click', async () => {
  const title = document.getElementById('add-title').value;
  const artist = document.getElementById('add-artist').value;
  const album = document.getElementById('add-album').value;
  const lyrics = document.getElementById('add-lyrics').value;
  try {
    const result = await addManualSong(title, artist, album, lyrics);
    if (result === 'missing') { alert('Title, artist, and lyrics are required.'); return; }
    if (result === 'duplicate') { alert('This song is already in the library.'); return; }
    document.getElementById('add-title').value = '';
    document.getElementById('add-artist').value = '';
    document.getElementById('add-album').value = '';
    document.getElementById('add-lyrics').value = '';
    document.getElementById('add-song-form').style.display = 'none';
    renderLibrary();
    updateSongCount();
    showToast('Song added to library.');
  } catch (err) {
    showToast('Error adding song. Please try again.');
  }
});
document.getElementById('add-song-cancel').addEventListener('click', () => {
  document.getElementById('add-song-form').style.display = 'none';
});

// ── Init ───────────────────────────────────────────────────

loadAllSongs()
  .then(() => updateSongCount())
  .catch(() => showToast('Could not load songs from server.'));
