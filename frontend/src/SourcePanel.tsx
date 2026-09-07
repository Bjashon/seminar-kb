import type { EntityDetail } from "./types";
import { api } from "./api";

interface Props {
  detail: EntityDetail;
  onClose: () => void;
}

export function SourcePanel({ detail, onClose }: Props) {
  const { source } = detail;
  const src =
    source.episode_code && source.document
      ? `${api.sourceUrl(source.episode_code, source.document)}#page=${source.page}`
      : undefined;

  return (
    <aside className="source-panel">
      <div className="panel-header">
        <div>{source.label}{source.citation ? ` · ${source.citation}` : ""}</div>
        <button aria-label="Закрыть" onClick={onClose}>×</button>
      </div>
      {src && <iframe className="panel-frame" src={src} title="Источник" />}
    </aside>
  );
}
