from pathlib import PureWindowsPath

from app.db.models import Talk


def _basenames(talk: Talk) -> set[str]:
    # article_pdf_paths were resolved on Windows (see parse_export.py) and
    # are stored as backslash paths regardless of which OS later reads them
    # (the API runs in a Linux container), and each talk gets its own folder
    # even when re-uploading the identical PDF -- so only the filename, not
    # the full path, can identify "same paper".
    return {PureWindowsPath(p).name for p in (talk.article_pdf_paths or []) if not p.startswith("http")}


def paper_group(talk: Talk, all_talks: list[Talk]) -> list[Talk]:
    """The talk plus every other talk presenting the same paper (a paper
    split into "Part I/II/III" across several seminar dates), sorted by
    episode code. Entities are attached to just one of them (see
    load_entities.py), so anything "per article" has to look at the group."""
    own = _basenames(talk)
    siblings = [t for t in all_talks if t.id != talk.id and t.episode_code and own & _basenames(t)]
    return sorted([talk, *siblings], key=lambda t: t.episode_code or "")
