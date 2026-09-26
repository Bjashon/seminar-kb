from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from app.db.models import Talk
from app.db.session import get_db
from app.schemas import ProjectFileOut, ProjectOut, ProjectSummaryOut

router = APIRouter(prefix="/projects", tags=["projects"])

# Research projects (papers being worked on) live in the repo as markdown --
# projects/<slug>/project.md -- so the working notes are versioned next to
# the knowledge base and edited like code, and the app just renders them.
PROJECTS_DIR = Path(__file__).resolve().parents[3] / "projects"

# What the project page offers for download: the paper's sources and
# outputs, notes, scripts. Anything else in the folder (logs, third-party
# PDFs kept locally in papers/) stays private.
DOWNLOADABLE_SUFFIXES = {".tex", ".pdf", ".md", ".txt", ".py", ".bib"}
PRIVATE_DIRS = {"papers"}


def _read(slug_dir: Path) -> tuple[str, str]:
    text = (slug_dir / "project.md").read_text(encoding="utf-8")
    lines = text.splitlines()
    title = slug_dir.name
    body_start = 0
    for i, line in enumerate(lines):
        if line.startswith("# "):
            title = line[2:].strip()
            body_start = i + 1
            break
    return title, "\n".join(lines[body_start:]).strip()


def _project_dir(slug: str) -> Path:
    d = PROJECTS_DIR / slug
    if "/" in slug or "\\" in slug or ".." in slug or not (d / "project.md").is_file():
        raise HTTPException(status_code=404, detail="Project not found")
    return d


def _downloadable(d: Path) -> list[ProjectFileOut]:
    out = []
    for p in sorted(d.rglob("*")):
        rel = p.relative_to(d)
        if not p.is_file() or p.suffix.lower() not in DOWNLOADABLE_SUFFIXES:
            continue
        if rel.parts[0] in PRIVATE_DIRS or any(part.startswith(".") for part in rel.parts):
            continue
        if rel.as_posix() == "project.md":  # the page itself
            continue
        out.append(ProjectFileOut(path=rel.as_posix(), size=p.stat().st_size))
    return out


@router.get("", response_model=list[ProjectSummaryOut])
def list_projects() -> list[ProjectSummaryOut]:
    if not PROJECTS_DIR.is_dir():
        return []
    out = []
    for d in sorted(PROJECTS_DIR.iterdir()):
        if d.is_dir() and (d / "project.md").is_file():
            title, _ = _read(d)
            out.append(ProjectSummaryOut(slug=d.name, title=title))
    return out


@router.get("/{slug}", response_model=ProjectOut)
def get_project(slug: str, db: Session = Depends(get_db)) -> ProjectOut:
    d = _project_dir(slug)
    title, body = _read(d)
    # A project's own cards (its definitions and results, drilled and laid
    # out like a paper's) hang off a pseudo-talk with the code proj_<slug>,
    # see docs/adding-talks.md ("Проекты").
    talk = db.query(Talk).filter(Talk.episode_code == f"proj_{slug}").first()
    return ProjectOut(slug=slug, title=title, body_md=body, files=_downloadable(d), talk_id=talk.id if talk else None)


@router.get("/{slug}/files/{path:path}")
def download_file(slug: str, path: str) -> FileResponse:
    d = _project_dir(slug)
    # Only what the listing offers: that rules out "..", private folders and
    # non-downloadable types in one place.
    if path not in {f.path for f in _downloadable(d)}:
        raise HTTPException(status_code=404, detail="File not found")
    target = d / path
    return FileResponse(str(target), filename=target.name, content_disposition_type="attachment")
