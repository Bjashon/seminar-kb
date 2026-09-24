from sqlalchemy.orm import Session

from app.db.models import Entity, EntityLink


def topo_order(db: Session, entities: list[Entity]) -> list[Entity]:
    """Order entities so a "uses" dependency always comes before whatever
    uses it -- randomly shuffling a curated drill set (a single article's
    definitions/properties, or the foundational set) undercuts the point of
    curating it: the learner needs to meet a concept before the thing built
    on top of it. `entities` is otherwise kept as given, so a caller should
    pass it pre-sorted by something sensible (e.g. source page).

    A dependency that comes later in `entities` is pulled up to just before
    its first use, rather than holding back whatever uses it: a
    paper's central definition on p.1 that cites a textbook notion recalled
    on p.5 should stay near the top, not sink below everything up to p.5."""
    ids = {e.id for e in entities}
    links = (
        db.query(EntityLink)
        .filter(EntityLink.from_entity_id.in_(ids), EntityLink.to_entity_id.in_(ids))
        .all()
    )
    position = {e.id: i for i, e in enumerate(entities)}
    by_id = {e.id: e for e in entities}
    depends_on: dict[int, set[int]] = {e.id: set() for e in entities}
    for link in links:
        depends_on[link.from_entity_id].add(link.to_entity_id)

    ordered: list[Entity] = []
    placed: set[int] = set()
    visiting: set[int] = set()  # a dependency cycle shouldn't happen, but don't loop if it does

    def place(entity_id: int) -> None:
        if entity_id in placed or entity_id in visiting:
            return
        visiting.add(entity_id)
        for dep in sorted(depends_on[entity_id], key=position.__getitem__):
            place(dep)
        visiting.discard(entity_id)
        placed.add(entity_id)
        ordered.append(by_id[entity_id])

    for e in entities:
        place(e.id)
    return ordered
