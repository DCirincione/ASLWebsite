import type { KeyboardEvent, ReactNode } from "react";

type SportEventCardProps = {
  actions: ReactNode;
  dateLabel: string;
  description?: string | null;
  image?: string;
  location?: string | null;
  onOpen?: (() => void) | undefined;
  title: string;
};

export function SportEventCard({
  actions,
  dateLabel,
  description,
  image,
  location,
  onOpen,
  title,
}: SportEventCardProps) {
  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!onOpen) return;
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    onOpen();
  };

  return (
    <article className="event-card event-card--full">
      <div
        className={`event-card__image${onOpen ? " event-card__image--interactive" : ""}`}
        style={{
          backgroundImage: image ? `url(${image})` : undefined,
        }}
        role={onOpen ? "button" : undefined}
        tabIndex={onOpen ? 0 : undefined}
        aria-label={onOpen ? `Open details for ${title}` : undefined}
        aria-hidden={!onOpen}
        onClick={onOpen}
        onKeyDown={handleKeyDown}
      />
      <div className="event-card__body">
        <div className="event-card__header">
          <h3 className="event-card__title">{title}</h3>
        </div>
        <div className="event-card__meta">
          <div className="event-card__meta-row">
            <span aria-hidden>📅</span>
            <span>{dateLabel}</span>
          </div>
          <div className="event-card__meta-row">
            <span aria-hidden>📍</span>
            <span>{location || "Location TBD"}</span>
          </div>
        </div>
        {description?.trim() ? <p className="muted">{description.trim()}</p> : null}
        <div className="event-card__actions">{actions}</div>
      </div>
    </article>
  );
}
