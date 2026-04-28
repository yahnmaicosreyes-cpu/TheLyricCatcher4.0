"""CRUD API routes for songs."""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from database import get_connection

router = APIRouter(prefix="/api")


class SongCreate(BaseModel):
    title: str
    artist: str
    album: str | None = None
    genre: str | None = None
    lyrics: str


class SongUpdate(BaseModel):
    title: str | None = None
    artist: str | None = None
    album: str | None = None
    genre: str | None = None
    lyrics: str | None = None


def row_to_dict(row) -> dict:
    return dict(row) if row else None


@router.get("/songs")
def list_songs():
    """Return all songs."""
    conn = get_connection()
    rows = conn.execute("SELECT * FROM songs ORDER BY title").fetchall()
    conn.close()
    return [dict(r) for r in rows]


@router.get("/songs/{song_id}")
def get_song(song_id: int):
    """Return a single song by ID."""
    conn = get_connection()
    row = conn.execute("SELECT * FROM songs WHERE id = ?", (song_id,)).fetchone()
    conn.close()
    if not row:
        raise HTTPException(status_code=404, detail="Song not found")
    return dict(row)


@router.post("/songs", status_code=201)
def create_song(song: SongCreate):
    """Add a new song."""
    conn = get_connection()
    cursor = conn.execute(
        "INSERT INTO songs (title, artist, album, genre, lyrics) VALUES (?, ?, ?, ?, ?)",
        (song.title, song.artist, song.album, song.genre, song.lyrics),
    )
    conn.commit()
    new_id = cursor.lastrowid
    row = conn.execute("SELECT * FROM songs WHERE id = ?", (new_id,)).fetchone()
    conn.close()
    return dict(row)


@router.put("/songs/{song_id}")
def update_song(song_id: int, updates: SongUpdate):
    """Update an existing song. Only provided fields are changed."""
    conn = get_connection()
    existing = conn.execute("SELECT * FROM songs WHERE id = ?", (song_id,)).fetchone()
    if not existing:
        conn.close()
        raise HTTPException(status_code=404, detail="Song not found")

    fields = {}
    for field in ("title", "artist", "album", "genre", "lyrics"):
        val = getattr(updates, field)
        if val is not None:
            fields[field] = val

    if not fields:
        conn.close()
        return dict(existing)

    set_clause = ", ".join(f"{k} = ?" for k in fields)
    values = list(fields.values()) + [song_id]
    conn.execute(f"UPDATE songs SET {set_clause} WHERE id = ?", values)
    conn.commit()
    row = conn.execute("SELECT * FROM songs WHERE id = ?", (song_id,)).fetchone()
    conn.close()
    return dict(row)


@router.delete("/songs/{song_id}", status_code=204)
def delete_song(song_id: int):
    """Delete a song by ID."""
    conn = get_connection()
    existing = conn.execute("SELECT * FROM songs WHERE id = ?", (song_id,)).fetchone()
    if not existing:
        conn.close()
        raise HTTPException(status_code=404, detail="Song not found")
    conn.execute("DELETE FROM songs WHERE id = ?", (song_id,))
    conn.commit()
    conn.close()
    return None
