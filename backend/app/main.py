from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.api import cards, entities, projects, review, search, talks

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
app.include_router(cards.router)


@app.middleware("http")
async def cache_headers(request, call_next):
    """The page itself is asked for afresh on every visit (cheap: its ETag
    answers "not modified"), so a phone shows the new version right after a
    Redeploy instead of one it remembered -- without a Cache-Control header a
    browser guesses for itself and may keep the old page for hours. The built
    scripts and styles carry a hash in their names and can be kept for good."""
    response = await call_next(request)
    if request.url.path.startswith("/assets/"):
        response.headers.setdefault("Cache-Control", "public, max-age=31536000, immutable")
    elif response.headers.get("content-type", "").startswith("text/html"):
        response.headers["Cache-Control"] = "no-cache"
    return response


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


# Built frontend (npm run build -> frontend/dist), served last so it only
# catches requests the API routes above didn't claim. Not present in local
# dev, where the Vite dev server handles the frontend on its own port.
FRONTEND_DIST = REPO_ROOT / "frontend" / "dist"
if FRONTEND_DIST.is_dir():
    app.mount("/", StaticFiles(directory=str(FRONTEND_DIST), html=True), name="frontend")
