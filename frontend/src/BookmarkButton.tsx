interface Props {
  on: boolean;
  onToggle: () => void;
}

/** The small violet bookmark on a card: puts it into the owner's own study
 *  set ("Мой набор" in the trainer), or takes it out. */
export function BookmarkButton({ on, onToggle }: Props) {
  const label = on ? "Убрать из моего набора" : "Добавить в мой набор для изучения";
  return (
    <button
      className={"bookmark-btn" + (on ? " on" : "")}
      aria-pressed={on}
      aria-label={label}
      title={label}
      onClick={onToggle}
    >
      <BookmarkIcon />
    </button>
  );
}

export function BookmarkIcon() {
  return (
    <svg className="bookmark-icon" viewBox="0 0 12 16" width="11" height="15" aria-hidden="true">
      <path d="M1.5 1.5h9v13L6 11l-4.5 3.5z" />
    </svg>
  );
}
