# Testing Lyric Catcher 4.0

## Overview
Lyric Catcher is a static frontend app (HTML/CSS/JS, no framework). It uses localStorage for song persistence. No build step required.

## Serving the App
```bash
cd /home/ubuntu/TheLyricCatcher4.0
python3 -m http.server 8080 &
```
Verify: `curl -s -o /dev/null -w '%{http_code}' http://localhost:8080` should return `200`.

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

## CRUD Test Flow
1. **Empty state**: After clearing localStorage, verify "0 songs in library (0 built-in, 0 loaded)"
2. **Search empty**: Type any query → expect "No match found. Try a different phrase."
3. **Add song**: View Library → + Add Song Manually → fill Title*, Artist*, Album (optional), Lyrics* → click Add
   - Use Playwright to fill the lyrics textarea (multiline text)
   - Expect toast: "Song added to library."
   - Expect count update to "1 song in library (0 built-in, 1 loaded)"
4. **Search**: Clear input, type lyrics phrase → expect result card with "Best match" badge
5. **View modal**: Click result card → expect styled section labels (VERSE, CHORUS in gold uppercase)
6. **Edit**: Library → Edit button → modify fields → Save → verify changes persist in library row
7. **Delete**: Library → Delete button → confirm dialog → verify library shows "No songs in library."

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

## File Import Testing
Create a .txt file with format:
```
TITLE: Song Name
ARTIST: Artist Name
ALBUM: Album Name
LYRICS:
[Verse 1]
Lyrics here...
---
```
Drag onto the drop zone or use "Choose File" button.

## Known Behaviors
- Search results are not auto-refreshed when songs are modified via the Library modal. The user must modify the search input to re-trigger search.
- The search algorithm uses Levenshtein distance + Soundex + phrase matching. It needs at least a few words to find a match.
- Song count footer updates immediately on add/delete, even if search results are stale.

## No CI
This repo has no CI pipeline. Testing is manual/browser-based only.

## Devin Secrets Needed
None — this is a static frontend app with no authentication or API keys.
