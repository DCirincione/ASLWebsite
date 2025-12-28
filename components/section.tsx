import { ReactNode } from "react";

type SectionProps = {
  id?: string;
  eyebrow?: string;
  title: string;
  description?: string;
  headingLevel?: "h1" | "h2" | "h3";
  className?: string;
  children?: ReactNode;
};

export function Section({
  id,
  eyebrow,
  title,
  description,
  headingLevel = "h2",
  className,
  children,
}: SectionProps) {
  const Heading = headingLevel;
  const classes = ["section", className].filter(Boolean).join(" ");

  return (
    <section id={id} className={classes}>
      <div className="section__header">
        {eyebrow ? <p className="eyebrow">{eyebrow}</p> : null}
        <Heading>{title}</Heading>
        {description ? <p className="muted">{description}</p> : null}
      </div>
      {children}
    </section>
  );
}
