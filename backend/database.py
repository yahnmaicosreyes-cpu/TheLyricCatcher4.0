"""SQLite database setup and connection helpers."""

import sqlite3
from pathlib import Path

DB_PATH = Path(__file__).parent / "songs.db"

SCHEMA = """
CREATE TABLE IF NOT EXISTS songs (
    id      INTEGER PRIMARY KEY AUTOINCREMENT,
    title   TEXT    NOT NULL,
    artist  TEXT    NOT NULL,
    album   TEXT,
    genre   TEXT,
    lyrics  TEXT    NOT NULL
);
"""


def get_connection() -> sqlite3.Connection:
    """Return a connection with row-factory set to sqlite3.Row."""
    conn = sqlite3.connect(str(DB_PATH))
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA foreign_keys=ON")
    return conn


def init_db() -> None:
    """Create the songs table if it doesn't exist."""
    conn = get_connection()
    conn.executescript(SCHEMA)
    conn.close()


def song_count() -> int:
    """Return the number of songs in the database."""
    conn = get_connection()
    count = conn.execute("SELECT COUNT(*) FROM songs").fetchone()[0]
    conn.close()
    return count
