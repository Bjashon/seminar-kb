from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.api import entities, projects, review, search, talks

app = FastAPI(title="Seminar KB")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_methods=["*"],
    allow_headers=["*"],
)

REPO_ROOT = Path(__file__).resolve().parents[2]

SOURCES_DIR = REPO_ROOT / "data" / "sources"
if SOURCES_DIR.is_dir():
    app.mount("/sources", StaticFiles(directory=str(SOURCES_DIR)), name="sources")

app.include_router(entities.router)
app.include_router(search.router)
app.include_router(review.router)
app.include_router(talks.router)
app.include_router(projects.router)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


# Built frontend (npm run build -> frontend/dist), served last so it only
# catches requests the API routes above didn't claim. Not present in local
# dev, where the Vite dev server handles the frontend on its own port.
FRONTEND_DIST = REPO_ROOT / "frontend" / "dist"
if FRONTEND_DIST.is_dir():
    app.mount("/", StaticFiles(directory=str(FRONTEND_DIST), html=True), name="frontend")
