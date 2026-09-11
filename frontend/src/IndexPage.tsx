import { useMemo, useState } from "react";
import type { EntitySummary, Lang } from "./types";
import { formatDate } from "./dates";

interface Props {
  entities: EntitySummary[];
  onOpen: (slug: string) => void;
  onOpenSource: (slug: string) => void;
}

type GroupBy = "topic" | "source";

const NO_SOURCE_GROUP = "Без источника (общие определения)";

export function IndexPage({ entities, onOpen, onOpenSource }: Props) {
  const [query, setQuery] = useState("");
  const [lang, setLang] = useState<Lang>("ru");
  const [groupBy, setGroupBy] = useState<GroupBy>("topic");

  const groups = useMemo(() => {
    const q = query.trim().toLowerCase();
    const matches = (e: EntitySummary) =>
      !q || e.title_ru?.toLowerCase().includes(q) || e.title_en?.toLowerCase().includes(q);
    const locale = lang === "ru" ? "ru" : "en";

    if (groupBy === "topic") {
      const byTopic = new Map<string, { order: number; items: EntitySummary[] }>();
      for (const e of entities) {
        if (!matches(e)) continue;
        const topic = e.topic ?? "Без темы";
        if (!byTopic.has(topic)) byTopic.set(topic, { order: e.topic_order, items: [] });
        byTopic.get(topic)!.items.push(e);
      }
      return [...byTopic.entries()]
        .sort((a, b) => a[1].order - b[1].order)
        .map(([label, { items }]) => ({
          label,
          items: items.slice().sort((a, b) =>
            (lang === "ru" ? a.title_ru! : a.title_en!).localeCompare(lang === "ru" ? b.title_ru! : b.title_en!, locale)
          ),
        }));
    }

    const bySource = new Map<string, EntitySummary[]>();
    for (const e of entities) {
      if (!matches(e)) continue;
      const key = e.source_citation ?? NO_SOURCE_GROUP;
      if (!bySource.has(key)) bySource.set(key, []);
      bySource.get(key)!.push(e);
    }
    return [...bySource.entries()]
      .sort((a, b) => {
        if (a[0] === NO_SOURCE_GROUP) return 1;
        if (b[0] === NO_SOURCE_GROUP) return -1;
        return a[0].localeCompare(b[0], locale);
      })
      .map(([label, items]) => ({
        label,
        items: items.slice().sort((a, b) => {
          const pageDiff = (a.source_page ?? Infinity) - (b.source_page ?? Infinity);
          if (pageDiff !== 0) return pageDiff;
          return (lang === "ru" ? a.title_ru! : a.title_en!).localeCompare(lang === "ru" ? b.title_ru! : b.title_en!, locale);
        }),
      }));
  }, [entities, query, lang, groupBy]);

  return (
    <div className="main-inner wide">
      <div className="index-filters">
        <input placeholder="Фильтр по RU или EN…" value={query} onChange={(e) => setQuery(e.target.value)} />
        <div className="lang-switch">
          <button aria-selected={groupBy === "topic"} onClick={() => setGroupBy("topic")}>По темам</button>
          <button aria-selected={groupBy === "source"} onClick={() => setGroupBy("source")}>По источникам</button>
        </div>
        <div className="lang-switch">
          <button aria-selected={lang === "ru"} onClick={() => setLang("ru")}>RU</button>
          <button aria-selected={lang === "en"} onClick={() => setLang("en")}>EN</button>
        </div>
      </div>
      {groups.length === 0 && <div className="index-empty">Ничего не найдено</div>}
      {groups.map(({ label, items }) => (
        <div className="index-group" key={label}>
          <div className="index-group-header">
            {label} <span className="index-group-count">{items.length}</span>
          </div>
          <div className="index-rows">
            {items.map((e) => (
              <div className="index-row" key={e.slug}>
                <button className="index-row-open" onClick={() => onOpen(e.slug)}>
                  <span className="dot" style={{ background: `var(--${e.kind})` }} />
                  {lang === "ru" ? e.title_ru : e.title_en}
                </button>
                {e.source_page != null && (
                  <button
                    className="index-row-page has-source"
                    onClick={(ev) => {
                      ev.stopPropagation();
                      onOpenSource(e.slug);
                    }}
                  >
                    {groupBy === "source" && e.episode_code
                      ? `${e.episode_code}${e.talk_date ? `, ${formatDate(e.talk_date)}` : ""}, стр. ${e.source_page}`
                      : `стр. ${e.source_page}`}
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
