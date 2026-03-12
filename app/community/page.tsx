"use client";

import Image from "next/image";

import { PageShell } from "@/components/page-shell";
import { Section } from "@/components/section";
import featuredArticles from "@/data/community-articles.json";
import communityContent from "@/data/community-content.json";

export default function CommunityPage() {
  return (
    <PageShell>
      <Section
        id="community-page"
        eyebrow="Community"
        title="Community hub"
        description="A note from ownership."
        headingLevel="h1"
      >
        <div className="community-stack">
          <div className="community-board static-copy">
            <p className="community-board__title">{communityContent.boardTitle}</p>
            {communityContent.paragraphs.map((paragraph, idx) => (
              <p key={`community-paragraph-${idx}`} style={{ whiteSpace: "pre-line" }}>
                {paragraph}
              </p>
            ))}
          </div>

          <div className="community-photos">
            <Image
              src="/community/IMG_3743.jpeg"
              alt="Community photo one"
              width={900}
              height={600}
              className="community-photo"
              priority
            />
            <Image
              src="/community/IMG_8537.jpeg"
              alt="Community photo two"
              width={900}
              height={600}
              className="community-photo"
            />
          </div>

          <div className="article-carousel" aria-label="Featured LinkedIn articles">
            {featuredArticles.map((article, idx) => (
              <a
                key={article.id ?? article.title + idx}
                className="article-card"
                href={article.href}
                target="_blank"
                rel="noreferrer"
              >
                {article.image ? (
                  <Image
                    src={article.image}
                    alt={article.title}
                    width={500}
                    height={320}
                    className="article-card__image"
                  />
                ) : null}
                <p className="article-card__eyebrow">{article.date ?? "Latest"}</p>
                <p className="article-card__title">{article.title}</p>
                <p className="article-card__blurb">{article.blurb}</p>
                <span className="article-card__cta">Read the Full Article Here →</span>
              </a>
            ))}
          </div>
        </div>
      </Section>
    </PageShell>
  );
}
