# Testing Lyric Catcher 4.0

## Overview
Lyric Catcher is a worship song management app with a FastAPI backend (SQLite) and static frontend (HTML/CSS/JS, no framework). The backend serves both the API and frontend files.

## Serving the App

### Backend (Phase 2+)
```bash
cd /home/ubuntu/TheLyricCatcher4.0/backend
pip install -r requirements.txt
python main.py
```
Server runs at `http://localhost:8080`. Frontend at `/`, API at `/api/songs`, Swagger docs at `/docs`.

On first startup, if `songs.db` doesn't exist, the server auto-seeds 168 songs from `seed_data/LyricCatcher_CLEAN.txt`.

### Legacy (frontend-only, pre-Phase 2)
```bash
cd /home/ubuntu/TheLyricCatcher4.0
python3 -m http.server 8080 &
```

## API Testing via Shell

### Verify song count
```bash
curl -s http://localhost:8080/api/songs | python3 -c "import sys,json; print(len(json.load(sys.stdin)))"
# Expected: 168
```

### Verify section label expansion
```bash
# Check a specific song
curl -s http://localhost:8080/api/songs/1 | python3 -c "import sys,json; print(json.load(sys.stdin)['lyrics'][:200])"
# Should show [Verse 1], [Chorus], etc. — NOT [V1], [CH]

# Scan all songs for abbreviated labels
curl -s http://localhost:8080/api/songs | python3 -c "
import sys, json, re
songs = json.load(sys.stdin)
pattern = re.compile(r'\[(?:V|CH|BR|RF|PRE|TAG)\d*\]')
for s in songs:
    matches = pattern.findall(s['lyrics'])
    if matches:
        print(f\"Song {s['id']}: {matches}\")
print('Done — no output above means all labels expanded correctly')
"
```

### CRUD operations
```bash
# Create
curl -s -X POST http://localhost:8080/api/songs \
  -H 'Content-Type: application/json' \
  -d '{"title":"Test Song","artist":"Test Artist","album":"Test Album","genre":"Test","lyrics":"[Verse 1]\nTest lyrics"}'
# Expected: 201, id=169

# Update (partial)
curl -s -X PUT http://localhost:8080/api/songs/169 \
  -H 'Content-Type: application/json' \
  -d '{"title":"Updated Title"}'
# Expected: 200, title changed, other fields unchanged

# Delete
curl -s -o /dev/null -w '%{http_code}' -X DELETE http://localhost:8080/api/songs/169
# Expected: 204

# Verify deletion
curl -s -o /dev/null -w '%{http_code}' http://localhost:8080/api/songs/169
# Expected: 404
```

### Test auto-seed from scratch
```bash
# Stop server, delete DB, restart
fuser 8080/tcp -k 2>/dev/null
rm -f /home/ubuntu/TheLyricCatcher4.0/backend/songs.db
cd /home/ubuntu/TheLyricCatcher4.0/backend && python main.py &
# Server log should show: [seed] Imported 168 songs from seed file.
```

## Clearing State for Clean Tests
Use Playwright CDP to clear localStorage before testing:
```python
from playwright.sync_api import sync_playwright
with sync_playwright() as p:
    browser = p.chromium.connect_over_cdp('http://localhost:29229')
    page = browser.contexts[0].pages[0]
    page.goto('http://localhost:8080')
    page.evaluate('localStorage.clear()')
    page.reload()
    browser.close()
```
Alternatively, use browser DevTools console: `localStorage.clear(); location.reload();`

Note: The `computer` tool's `console` action may fail if Chrome isn't detected as foreground. Playwright CDP is more reliable for programmatic state clearing.

## Key UI Elements
- **Search input**: Center of page, placeholder "Type what you hear..."
- **View Library button**: Below the drop zone area
- **+ Add Song Manually**: Link inside Library modal, expands a form
- **Edit / Delete buttons**: On each song row in the Library modal
- **Song count**: Footer text, format: `N song(s) in library (X built-in, Y loaded)`

## CRUD Test Flow (Frontend)
1. **Empty state**: After clearing localStorage, verify "0 songs in library (0 built-in, 0 loaded)"
2. **Search empty**: Type any query -> expect "No match found. Try a different phrase."
3. **Add song**: View Library -> + Add Song Manually -> fill Title*, Artist*, Album (optional), Lyrics* -> click Add
   - Use Playwright to fill the lyrics textarea (multiline text)
   - Expect toast: "Song added to library."
   - Expect count update to "1 song in library (0 built-in, 1 loaded)"
4. **Search**: Clear input, type lyrics phrase -> expect result card with "Best match" badge
5. **View modal**: Click result card -> expect styled section labels (VERSE, CHORUS in gold uppercase)
6. **Edit**: Library -> Edit button -> modify fields -> Save -> verify changes persist in library row
7. **Delete**: Library -> Delete button -> confirm dialog -> verify library shows "No songs in library."

## Lyrics Format for Testing
Use bracket section markers for proper rendering:
```
[Verse 1]
First verse lyrics here

[Chorus]
Chorus lyrics here

[Verse 2]
Second verse lyrics here
```

## Seed Data Format
The seed file (`seed_data/LyricCatcher_CLEAN.txt`) uses `SONG_START`/`SONG_END` blocks:
```
SONG_START
TITLE: Song Name
PRIMARY_ARTIST: Artist Name
ALBUM: Album Name
GENRE: Christian Worship Music
LYRICS:
[V1]
First verse...

[CH]
Chorus...
SONG_END
```
Abbreviated labels are expanded during import: `[V1]` -> `[Verse 1]`, `[CH]` -> `[Chorus]`, `[BR]` -> `[Bridge]`, `[RF]` -> `[Refrain]`, `[PRE]` -> `[Pre-Chorus]`, `[TAG]` -> `[Tag]`, `[POST]` -> `[Post-Chorus]`, `[V11]` (doubled digit) -> `[Verse 1]`.

## Browser Testing Tips
- Swagger docs at `/docs` — use "Try it out" button on any endpoint to test interactively
- Frontend still uses localStorage (Phase 3 will wire it to the API)
- When restarting the server, kill existing processes on port 8080 first: `fuser 8080/tcp -k`
- Maximize browser window before recording: `wmctrl -r :ACTIVE: -b add,maximized_vert,maximized_horz`

## Known Behaviors
- Search results are not auto-refreshed when songs are modified via the Library modal. The user must modify the search input to re-trigger search.
- The search algorithm uses Levenshtein distance + Soundex + phrase matching. It needs at least a few words to find a match.
- Song count footer updates immediately on add/delete, even if search results are stale.
- The static file mount serves from the repo root, which might expose backend source files. This should be addressed in Phase 3.

## No CI
This repo has no CI pipeline. Testing is manual/browser-based only.

## Devin Secrets Needed
None — no authentication or API keys required.
