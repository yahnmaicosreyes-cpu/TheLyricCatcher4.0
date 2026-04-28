"""Lyric Catcher 4.0 — FastAPI backend with SQLite."""

import sys
from contextlib import asynccontextmanager
from pathlib import Path

# Ensure backend/ is on the import path when run directly
sys.path.insert(0, str(Path(__file__).parent))

from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from routes import router
from seed import seed_if_empty


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Seed the database on first run if empty."""
    count = seed_if_empty()
    if count:
        print(f"[seed] Imported {count} songs from seed file.")
    else:
        from database import song_count
        print(f"[seed] Database already has {song_count()} songs.")
    yield


app = FastAPI(title="Lyric Catcher 4.0 API", version="2.0.0", lifespan=lifespan)

# Register API routes first (so /api/* takes priority over static files)
app.include_router(router)

# Serve the frontend static files (index.html, app.js, style.css, data.js)
FRONTEND_DIR = Path(__file__).parent.parent
app.mount("/", StaticFiles(directory=str(FRONTEND_DIR), html=True), name="frontend")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8080, reload=True)
