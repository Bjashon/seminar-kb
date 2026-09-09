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
        # for s07_ep35, whose "Part I" and "Part II" rows are both titled
        # with that prefix. A plain dict comprehension would pick whichever
        # row the query happens to return last, flipping which duplicate new
        # entities land on between runs. Resolve known ambiguous codes
        # explicitly instead.
        AMBIGUOUS_CODE_TITLE_HINT = {"s07_ep35": "Part II"}
        talks_by_code: dict[str, Talk] = {}
        for t in db.query(Talk).all():
            if not t.episode_code:
                continue
            hint = AMBIGUOUS_CODE_TITLE_HINT.get(t.episode_code)
            if t.episode_code not in talks_by_code or (hint and hint in t.title):
                talks_by_code[t.episode_code] = t

        all_payloads = []
        for path in files:
            with open(path, encoding="utf-8") as f:
                all_payloads.append((path, json.load(f)))

        created, updated = 0, 0
        depends_on_map: dict[str, list[str]] = {}  # slug -> [depended-on names]

        for path, payload in all_payloads:
            episode_code = payload.get("episode_code")
            talk = talks_by_code.get(episode_code) if episode_code else None
            if episode_code and not talk:
                # parse_export.py (run against the full Notion export, which
                # isn't in the repo) normally seeds seasons/talks with real
                # metadata. Deploys that skip it still need a row to hang
                # entities off of, so create a bare-bones placeholder here --
                # rerunning parse_export.py later just fills it in properly.
                talk = Talk(episode_code=episode_code, title=episode_code)
                db.add(talk)
                db.flush()
                talks_by_code[episode_code] = talk

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
                # is null) share the same JSON file but aren't from it.
                entity.source_citation = payload.get("bibliography") if source.get("document") else None
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
