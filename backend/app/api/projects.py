from pathlib import Path

from fastapi import APIRouter, HTTPException

from app.schemas import ProjectOut, ProjectSummaryOut

router = APIRouter(prefix="/projects", tags=["projects"])

# Research projects (papers being worked on) live in the repo as markdown --
# projects/<slug>/project.md -- so the working notes are versioned next to
# the knowledge base and edited like code, and the app just renders them.
PROJECTS_DIR = Path(__file__).resolve().parents[3] / "projects"


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
def get_project(slug: str) -> ProjectOut:
    d = PROJECTS_DIR / slug
    if "/" in slug or "\\" in slug or ".." in slug or not (d / "project.md").is_file():
        raise HTTPException(status_code=404, detail="Project not found")
    title, body = _read(d)
    return ProjectOut(slug=slug, title=title, body_md=body)
