import Link from "next/link";

type FeatureCardProps = {
  title: string;
  description: string;
  badge?: string;
  href?: string;
  actionLabel?: string;
};

export function FeatureCard({
  title,
  description,
  badge,
  href,
  actionLabel,
}: FeatureCardProps) {
  const body = (
    <div className="feature-card">
      {badge ? <span className="feature-card__tag">{badge}</span> : null}
      <h3>{title}</h3>
      <p className="muted">{description}</p>
      {href && actionLabel ? (
        <span className="feature-card__link">
          {actionLabel} <span aria-hidden>→</span>
        </span>
      ) : null}
    </div>
  );

  if (!href || !actionLabel) {
    return body;
  }

  return (
    <Link href={href} className="feature-card__link-wrapper">
      {body}
    </Link>
  );
}
