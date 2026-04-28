"""Parse the seed .txt file and import songs into SQLite."""

import re
from pathlib import Path
from database import get_connection, init_db, song_count

SEED_FILE = Path(__file__).parent.parent / "seed_data" / "LyricCatcher_CLEAN.txt"

# Map abbreviated section labels → full words
SECTION_MAP = {
    "V": "Verse",
    "CH": "Chorus",
    "BR": "Bridge",
    "PRE": "Pre-Chorus",
    "RF": "Refrain",
    "TAG": "Tag",
    "INTRO": "Intro",
    "OUTRO": "Outro",
    "POST": "Post-Chorus",
    "INTERLUDE": "Interlude",
    "SPONTANEOUS": "Spontaneous",
    "LYRICS NEEDED": "Lyrics Needed",
}

# Regex to match section labels like [V1], [CH], [BR2], [OUTRO], [LYRICS NEEDED]
LABEL_RE = re.compile(r"\[([A-Z][A-Z \-]*?)(\d*)\]")


def expand_label(match: re.Match) -> str:
    """Expand an abbreviated section label to its full form.

    [V1]  → [Verse 1]
    [CH]  → [Chorus]
    [BR2] → [Bridge 2]
    [V11] → [Verse 1]   (doubled digit = repeat marker)
    """
    base = match.group(1).strip()
    num = match.group(2)

    full_name = SECTION_MAP.get(base, base.title())

    # Doubled digits (V11, V22, …) → single digit
    if len(num) == 2 and num[0] == num[1]:
        num = num[0]

    if num:
        return f"[{full_name} {num}]"
    return f"[{full_name}]"


def expand_section_labels(lyrics: str) -> str:
    """Replace all abbreviated section labels in lyrics with full-word versions."""
    return LABEL_RE.sub(expand_label, lyrics)


def parse_seed_file(path: Path | None = None) -> list[dict]:
    """Parse the SONG_START / SONG_END seed file into a list of song dicts."""
    path = path or SEED_FILE
    text = path.read_text(encoding="utf-8")
    songs = []

    blocks = text.split("SONG_START")
    for block in blocks:
        block = block.strip()
        if not block or "SONG_END" not in block:
            continue

        content = block.split("SONG_END")[0].strip()

        title_m = re.search(r"^TITLE:\s*(.+)$", content, re.MULTILINE)
        artist_m = re.search(r"^PRIMARY_ARTIST:\s*(.+)$", content, re.MULTILINE)
        album_m = re.search(r"^ALBUM:\s*(.+)$", content, re.MULTILINE)
        genre_m = re.search(r"^GENRE:\s*(.+)$", content, re.MULTILINE)
        lyrics_m = re.search(r"^LYRICS:\s*\n(.*)", content, re.MULTILINE | re.DOTALL)

        if not title_m or not artist_m:
            continue

        title = title_m.group(1).strip()
        artist = artist_m.group(1).strip()
        album = album_m.group(1).strip() if album_m else None
        genre = genre_m.group(1).strip() if genre_m else None
        lyrics = lyrics_m.group(1).strip() if lyrics_m else ""

        lyrics = expand_section_labels(lyrics)

        songs.append({
            "title": title,
            "artist": artist,
            "album": album,
            "genre": genre,
            "lyrics": lyrics,
        })

    return songs


def import_songs(songs: list[dict]) -> int:
    """Insert parsed songs into the database. Returns number inserted."""
    conn = get_connection()
    cursor = conn.cursor()
    for song in songs:
        cursor.execute(
            "INSERT INTO songs (title, artist, album, genre, lyrics) VALUES (?, ?, ?, ?, ?)",
            (song["title"], song["artist"], song["album"], song["genre"], song["lyrics"]),
        )
    conn.commit()
    inserted = cursor.rowcount if len(songs) == 1 else len(songs)
    conn.close()
    return inserted


def seed_if_empty() -> int:
    """If the database is empty, parse the seed file and import. Returns count."""
    init_db()
    if song_count() > 0:
        return 0
    if not SEED_FILE.exists():
        return 0
    songs = parse_seed_file()
    import_songs(songs)
    return len(songs)


if __name__ == "__main__":
    init_db()
    if song_count() > 0:
        print(f"Database already has {song_count()} songs. Skipping import.")
    else:
        songs = parse_seed_file()
        import_songs(songs)
        print(f"Imported {len(songs)} songs into the database.")
