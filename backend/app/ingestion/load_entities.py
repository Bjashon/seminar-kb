"""Load extracted entity JSON files (backend/app/ingestion/extracted/*.json)
into the entities/entity_links tables.

Run from backend/: python -m app.ingestion.load_entities

Two passes, across ALL files together, so cross-talk dependencies resolve
regardless of file order:
  1. Upsert every entity by slug.
  2. Resolve each entity's depends_on names (plain text, authored in English)
     against every other entity's title_en/aliases, and create EntityLink
     rows for the resolvable ones. Unresolved names are reported, not
     silently dropped -- a dangling dependency usually just means that
     concept hasn't been extracted from any talk yet.
"""

import json
from pathlib import Path

from app.db.base import Base
from app.db.models import Entity, EntityLink, EntityKind, Talk
from app.db.session import SessionLocal, engine

EXTRACTED_DIR = Path(__file__).resolve().parent / "extracted"


def find_by_name(name: str, entities_by_key: dict[str, Entity]) -> Entity | None:
    return entities_by_key.get(name.strip().lower())


def main() -> None:
    Base.metadata.create_all(bind=engine)
    files = sorted(EXTRACTED_DIR.glob("*.json"))
    if not files:
        print(f"No JSON files found in {EXTRACTED_DIR}")
        return

    db = SessionLocal()
    try:
        # Two Notion talks can share the same season/episode code -- verified
        # for s07_ep35, whose "Part I" and "Part II" rows (two different
        # papers) are both titled with that prefix. A payload whose code is
        # ambiguous must say which one it means via "talk_title_hint" (a
        # substring of the intended Talk.title); plain dict-building would
        # otherwise pick whichever row the query happens to return last,
        # flipping which duplicate new entities land on between runs.
        talks_by_code: dict[str, list[Talk]] = {}
        for t in db.query(Talk).all():
            if t.episode_code:
                talks_by_code.setdefault(t.episode_code, []).append(t)

        all_payloads = []
        for path in files:
            with open(path, encoding="utf-8") as f:
                all_payloads.append((path, json.load(f)))

        created, updated = 0, 0
        depends_on_map: dict[str, list[str]] = {}  # slug -> [depended-on names]

        for path, payload in all_payloads:
            episode_code = payload.get("episode_code")
            candidates = talks_by_code.get(episode_code, []) if episode_code else []
            talk: Talk | None = None
            if len(candidates) == 1:
                talk = candidates[0]
            elif len(candidates) > 1:
                # endswith, not a plain substring check: "Part I" is itself a
                # substring of "Part II", so "in" would match both.
                hint = payload.get("talk_title_hint")
                matches = [t for t in candidates if hint and t.title.rstrip().endswith(hint)]
                if len(matches) != 1:
                    raise ValueError(
                        f"{path.name}: episode_code {episode_code!r} matches {len(candidates)} talks "
                        f"({[t.title for t in candidates]}) -- add a distinguishing 'talk_title_hint' to the JSON"
                    )
                talk = matches[0]
            if episode_code and not talk:
                # parse_export.py (run against the full Notion export, which
                # isn't in the repo) normally seeds seasons/talks with real
                # metadata. Deploys that skip it still need a row to hang
                # entities off of, so create a bare-bones placeholder here --
                # rerunning parse_export.py later just fills it in properly.
                talk = Talk(episode_code=episode_code, title=episode_code)
                db.add(talk)
                db.flush()
                talks_by_code.setdefault(episode_code, []).append(talk)
            # A source that isn't a seminar talk at all (a research project's
            # own cards, code proj_<slug>) has no Notion row to take a title
            # from, so the JSON carries it -- and keeps it current on reload.
            if talk is not None and payload.get("talk_title"):
                talk.title = payload["talk_title"]
            if talk is not None and ("brief_ru" in payload or "brief_en" in payload):
                talk.brief_ru = payload.get("brief_ru")
                talk.brief_en = payload.get("brief_en")

            for item in payload["entities"]:
                slug = item["slug"]
                entity = db.query(Entity).filter(Entity.slug == slug).one_or_none()
                is_new = entity is None
                if is_new:
                    entity = Entity(slug=slug)
                    db.add(entity)

                entity.kind = EntityKind(item["kind"])
                entity.talk_id = talk.id if talk else None
                entity.title_ru = item.get("title_ru")
                entity.title_en = item.get("title_en")
                entity.statement_ru = item.get("statement_ru")
                entity.statement_en = item.get("statement_en")
                entity.proof_ru = item.get("proof_ru")
                entity.proof_en = item.get("proof_en")
                entity.aliases = item.get("aliases", [])
                entity.topic = item.get("topic")
                entity.topic_order = item.get("topic_order", 0)
                source = item.get("source") or {}
                entity.source_label = source.get("label")
                entity.source_document = source.get("document")
                entity.source_page = source.get("page")
                # Only entities actually drawn from this talk's paper get its
                # citation -- hand-authored glossary bricks (source.document
                # is null) share the same JSON file but aren't from it. A
                # card taken from some other paper in the same folder (a
                # project citing its references) names that paper itself.
                entity.source_citation = source.get("citation") or (payload.get("bibliography") if source.get("document") else None)
                # Preserve whatever's already in the DB when the JSON doesn't
                # mention it, so a routine reload can't silently wipe out a
                # foundational flag set by a separate curation pass.
                if "is_foundational" in item:
                    entity.is_foundational = item["is_foundational"]
                elif is_new:
                    entity.is_foundational = False

                depends_on_map[slug] = item.get("depends_on", [])
                created += is_new
                updated += not is_new

        db.flush()

        # Build a name -> Entity lookup covering every title_en and alias,
        # now that all entities from this run (and prior runs) exist.
        entities_by_key: dict[str, Entity] = {}
        for entity in db.query(Entity).all():
            if entity.title_en:
                entities_by_key[entity.title_en.strip().lower()] = entity
            for alias in entity.aliases or []:
                entities_by_key[alias.strip().lower()] = entity

        db.query(EntityLink).delete()
        links_created = 0
        unresolved: list[tuple[str, str]] = []
        for slug, names in depends_on_map.items():
            from_entity = db.query(Entity).filter(Entity.slug == slug).one()
            seen_targets: set[int] = set()
            for name in names:
                target = find_by_name(name, entities_by_key)
                if target is None:
                    unresolved.append((slug, name))
                    continue
                if target.id == from_entity.id or target.id in seen_targets:
                    continue
                seen_targets.add(target.id)
                db.add(EntityLink(from_entity_id=from_entity.id, to_entity_id=target.id))
                links_created += 1

        db.commit()
        print(f"Entities: {created} created, {updated} updated. Links created: {links_created}.")
        if unresolved:
            print(f"Unresolved dependencies ({len(unresolved)}):")
            for slug, name in unresolved:
                print(f"  {slug} -> {name!r}")
    finally:
        db.close()


if __name__ == "__main__":
    main()
