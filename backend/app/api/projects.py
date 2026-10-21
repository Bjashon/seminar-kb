import json
from fnmatch import fnmatchcase
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from app.db.models import Entity, Talk
from app.db.session import get_db
from app.schemas import ProjectFileGroupOut, ProjectFileOut, ProjectOut, ProjectSummaryOut

router = APIRouter(prefix="/projects", tags=["projects"])

# Research projects (papers being worked on) live in the repo as markdown --
# projects/<slug>/project.md -- so the working notes are versioned next to
# the knowledge base and edited like code, and the app just renders them.
PROJECTS_DIR = Path(__file__).resolve().parents[3] / "projects"

# What the project page offers for download: the paper's sources and
# outputs, notes, scripts and their data. Anything else in the folder (logs,
# third-party PDFs kept locally in papers/, half-finished work in scratch/)
# stays private.
DOWNLOADABLE_SUFFIXES = {".tex", ".pdf", ".md", ".txt", ".py", ".bib", ".json"}
PRIVATE_DIRS = {"papers", "scratch"}
# The page itself, the course's data and the description of the file blocks.
NOT_FOR_DOWNLOAD = {"project.md", "lecture.json", "files.json"}


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
        if rel.as_posix() in NOT_FOR_DOWNLOAD:
            continue
        out.append(ProjectFileOut(path=rel.as_posix(), size=p.stat().st_size))
    return out


def _by_folder(files: list[ProjectFileOut]) -> list[ProjectFileGroupOut]:
    """Without a files.json: the project's own files first, then one block per folder."""
    groups: dict[str, list[ProjectFileOut]] = {}
    for f in files:
        folder = f.path.rsplit("/", 1)[0] if "/" in f.path else ""
        groups.setdefault(folder, []).append(f)
    return [
        ProjectFileGroupOut(title=f"{folder}/" if folder else "Основные файлы", files=groups[folder])
        for folder in sorted(groups)
    ]


def _file_groups(d: Path, files: list[ProjectFileOut]) -> list[ProjectFileGroupOut]:
    """The downloadable files in blocks, each with a title and a word on what
    every file is for. The blocks are described in projects/<slug>/files.json:

        {"groups": [{"title": "...", "note": "...",
                     "files": [{"path": "paper.pdf", "note": "..."}, {"path": "checks/*.txt"}]}]}

    "path" is a file or a pattern with "*" (which also matches "/"); a file
    goes into the first entry that matches it. A file the description does not mention is not lost: it
    is shown in a last block "Остальное", which is also how a mistyped path
    in files.json shows up."""
    manifest = d / "files.json"
    if not manifest.is_file():
        return _by_folder(files)
    try:
        described = json.loads(manifest.read_text(encoding="utf-8"))["groups"]
        entries = [(g["title"], g.get("note"), [(e["path"], e.get("note")) for e in g["files"]]) for g in described]
    except (ValueError, KeyError, TypeError):
        return _by_folder(files)

    left = {f.path: f for f in files}
    out = []
    for title, note, patterns in entries:
        chosen = []
        for pattern, file_note in patterns:
            for path in sorted(p for p in left if fnmatchcase(p, pattern)):
                chosen.append(ProjectFileOut(path=path, size=left.pop(path).size, note=file_note))
        if chosen:
            out.append(ProjectFileGroupOut(title=title, note=note, files=chosen))
    if left:
        out.append(ProjectFileGroupOut(title="Остальное", files=[left[p] for p in sorted(left)]))
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
    # see docs/adding-talks.md ("Проекты"). Once she has deleted all of
    # them, there is no trainer or board to offer.
    talk = db.query(Talk).filter(Talk.episode_code == f"proj_{slug}").first()
    if talk is not None and not db.query(Entity.id).filter(Entity.talk_id == talk.id, Entity.deleted_at.is_(None)).first():
        talk = None
    # The project's course is not shown on the site: it lives on claude.ai,
    # with the lecturer, and the page only links to it. lecture.json gives
    # the link ("claude_url") and what it says ("label").
    lecture = _lecture_data(d)
    claude_url, label = lecture.get("claude_url"), lecture.get("label")
    files = _downloadable(d)
    return ProjectOut(
        slug=slug, title=title, body_md=body, files=files, file_groups=_file_groups(d, files),
        talk_id=talk.id if talk else None,
        lecture_claude_url=claude_url if isinstance(claude_url, str) and claude_url.startswith("https://") else None,
        lecture_label=label if isinstance(label, str) and label.strip() else None,
    )


def _lecture_data(d: Path) -> dict:
    data_path = d / "lecture.json"
    return json.loads(data_path.read_text(encoding="utf-8")) if data_path.is_file() else {}


@router.get("/{slug}/files/{path:path}")
def download_file(slug: str, path: str) -> FileResponse:
    d = _project_dir(slug)
    # Only what the listing offers: that rules out "..", private folders and
    # non-downloadable types in one place.
    if path not in {f.path for f in _downloadable(d)}:
        raise HTTPException(status_code=404, detail="File not found")
    target = d / path
    return FileResponse(str(target), filename=target.name, content_disposition_type="attachment")
