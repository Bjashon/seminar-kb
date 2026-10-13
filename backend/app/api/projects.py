import json
from datetime import datetime
from fnmatch import fnmatchcase
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from app.db.models import CourseState, Talk
from app.db.session import get_db
from app.schemas import (
    LectureOut, LectureStateOut, LectureStatePatch, ProjectFileGroupOut, ProjectFileOut, ProjectOut, ProjectSummaryOut,
)

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
    # see docs/adding-talks.md ("Проекты").
    talk = db.query(Talk).filter(Talk.episode_code == f"proj_{slug}").first()
    has_lecture = (d / "lecture.html").is_file()
    lecture = _lecture_data(d) if has_lecture else {}
    claude_url, label = lecture.get("claude_url"), lecture.get("label")
    files = _downloadable(d)
    return ProjectOut(
        slug=slug, title=title, body_md=body, files=files, file_groups=_file_groups(d, files),
        talk_id=talk.id if talk else None,
        has_lecture=has_lecture,
        lecture_claude_url=claude_url if isinstance(claude_url, str) and claude_url.startswith("https://") else None,
        lecture_label=label if isinstance(label, str) and label.strip() else None,
    )


def _lecture_data(d: Path) -> dict:
    data_path = d / "lecture.json"
    return json.loads(data_path.read_text(encoding="utf-8")) if data_path.is_file() else {}


@router.get("/{slug}/lecture", response_model=LectureOut)
def get_lecture(slug: str) -> LectureOut:
    """The project's course: lecture.html (text) and lecture.json (quizzes,
    flashcards, glossary, calculator presets), both kept next to project.md."""
    d = _project_dir(slug)
    html_path = d / "lecture.html"
    if not html_path.is_file():
        raise HTTPException(status_code=404, detail="Lecture not found")
    return LectureOut(html=html_path.read_text(encoding="utf-8"), data=_lecture_data(d))


def _course_state(raw: object) -> dict:
    """The stored state with all three sections present."""
    raw = raw if isinstance(raw, dict) else {}
    return {key: dict(raw.get(key) or {}) for key in ("done", "cards", "quiz")}


@router.get("/{slug}/lecture/state", response_model=LectureStateOut)
def get_lecture_state(slug: str, db: Session = Depends(get_db)) -> LectureStateOut:
    """What the owner has done in the course: modules passed, test answers,
    flashcard marks. Kept here, not in the browser, so that it is the same
    on every device."""
    _project_dir(slug)
    row = db.get(CourseState, slug)
    return LectureStateOut(**_course_state(row.state if row else None))


@router.patch("/{slug}/lecture/state", response_model=LectureStateOut)
def patch_lecture_state(slug: str, patch: LectureStatePatch, db: Session = Depends(get_db)) -> LectureStateOut:
    _project_dir(slug)
    row = db.get(CourseState, slug)
    state = _course_state(row.state if row else None)

    def key_ok(key: str) -> bool:
        return 0 < len(key) <= 64

    for module, on in (patch.done or {}).items():
        if not key_ok(module):
            continue
        if on:
            state["done"][module] = True
        else:
            state["done"].pop(module, None)
    for card, mark in (patch.cards or {}).items():
        if not key_ok(card):
            continue
        if mark is None:
            state["cards"].pop(card, None)
        elif mark in ("know", "again"):
            state["cards"][card] = mark
        else:
            raise HTTPException(status_code=400, detail="a flashcard mark is 'know' or 'again'")
    for quiz, answers in (patch.quiz or {}).items():
        if not key_ok(quiz):
            continue
        if answers is None:  # the test is taken again from scratch
            state["quiz"].pop(quiz, None)
        else:
            merged = dict(state["quiz"].get(quiz) or {})
            merged.update({q: a for q, a in answers.items() if key_ok(q)})
            state["quiz"][quiz] = merged
    if len(json.dumps(state)) > 200_000:
        raise HTTPException(status_code=413, detail="course state is too large")

    if row is None:
        row = CourseState(slug=slug)
        db.add(row)
    row.state = state  # a new dict: a change inside the old one would not be seen
    row.updated_at = datetime.utcnow()
    db.commit()
    return LectureStateOut(**state)


@router.get("/{slug}/files/{path:path}")
def download_file(slug: str, path: str) -> FileResponse:
    d = _project_dir(slug)
    # Only what the listing offers: that rules out "..", private folders and
    # non-downloadable types in one place.
    if path not in {f.path for f in _downloadable(d)}:
        raise HTTPException(status_code=404, detail="File not found")
    target = d / path
    return FileResponse(str(target), filename=target.name, content_disposition_type="attachment")
