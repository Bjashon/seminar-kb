from sqlalchemy.orm import Session

from app.db.models import Entity, EntityLink


def topo_order(db: Session, entities: list[Entity]) -> list[Entity]:
    """Order entities so a "uses" dependency always comes before whatever
    uses it -- randomly shuffling a curated drill set (a single article's
    definitions/properties, or the foundational set) undercuts the point of
    curating it: the learner needs to meet a concept before the thing built
    on top of it. `entities` is also the tie-break order for anything with
    no dependency link between them, so a caller should pass it pre-sorted
    by something sensible (e.g. source page)."""
    ids = {e.id for e in entities}
    links = (
        db.query(EntityLink)
        .filter(EntityLink.from_entity_id.in_(ids), EntityLink.to_entity_id.in_(ids))
        .all()
    )
    depends_on: dict[int, set[int]] = {e.id: set() for e in entities}
    for link in links:
        depends_on[link.from_entity_id].add(link.to_entity_id)

    remaining = list(entities)
    placed: set[int] = set()
    ordered: list[Entity] = []
    while remaining:
        ready = [e for e in remaining if depends_on[e.id] <= placed]
        if not ready:
            # A dependency cycle shouldn't happen, but don't hang if it does.
            ordered.extend(remaining)
            break
        picked = ready[0]
        ordered.append(picked)
        placed.add(picked.id)
        remaining.remove(picked)
    return ordered
