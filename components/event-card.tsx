import Link from "next/link";

type EventCardProps = {
  title: string;
  date: string;
  location: string;
  href?: string;
  image?: string;
};

export function EventCard({ title, date, location, href = "#", image }: EventCardProps) {
  return (
    <article className="event-card">
      <div
        className="event-card__image"
        style={{
          backgroundImage: image ? `url(${image})` : undefined,
        }}
        aria-hidden
      />
      <div className="event-card__body">
        <h3 className="event-card__title">{title}</h3>
        <div className="event-card__footer">
          <div className="event-card__meta">
            <div className="event-card__meta-row">
              <span aria-hidden>📅</span>
              <span>{date}</span>
            </div>
            <div className="event-card__meta-row">
              <span aria-hidden>📍</span>
              <span>{location}</span>
            </div>
          </div>
          <Link href={href} className="button ghost event-card__cta">
            Learn More
          </Link>
        </div>
      </div>
    </article>
  );
}
