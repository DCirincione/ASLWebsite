import "./community.css";
import { CommunitySponsorCarousel } from "@/components/community-sponsor-carousel";

import Image from "next/image";
import { unstable_noStore as noStore } from "next/cache";

import { PageShell } from "@/components/page-shell";
import { CommunityDonationButton } from "@/components/community-donation-button";
import { Section } from "@/components/section";
import communityContent from "@/data/community-content.json";
import { readCommunityArticles } from "@/lib/community-articles";
import { readCommunitySponsors } from "@/lib/community-sponsors";

function SponsorMediaLinks({
  websiteUrl,
  instagramUrl,
}: {
  websiteUrl?: string;
  instagramUrl?: string;
}) {
  return (
    <div className="community-sponsor-card__links">
      {websiteUrl ? (
        <a className="community-sponsor-card__link" href={websiteUrl} target="_blank" rel="noreferrer">
          Website
        </a>
      ) : (
        <span className="community-sponsor-card__link community-sponsor-card__link--disabled" aria-disabled="true">
          Website
        </span>
      )}
      {instagramUrl ? (
        <a className="community-sponsor-card__link" href={instagramUrl} target="_blank" rel="noreferrer">
          Instagram
        </a>
      ) : (
        <span className="community-sponsor-card__link community-sponsor-card__link--disabled" aria-disabled="true">
          Instagram
        </span>
      )}
    </div>
  );
}

export default async function CommunityPage() {
  noStore();

  const [sponsors, featuredArticles] = await Promise.all([
    readCommunitySponsors(),
    readCommunityArticles(),
  ]);
  const featuredSponsors = sponsors.filter((sponsor) => sponsor.placement === "top").slice(0, 3);
  const featuredSponsorIds = new Set(featuredSponsors.map((sponsor) => sponsor.id));
  const standardSponsors = sponsors.filter((sponsor) => !featuredSponsorIds.has(sponsor.id));

  return (
    <PageShell>
      <Section
        id="community-page"
        eyebrow="Community"
        title="Community Hub"
        description="A note from ownership."
        headingLevel="h1"
        headerAction={<CommunityDonationButton />}
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

          <div className="community-sponsors-box">
            <div className="community-sponsors-box__header">
              <p className="community-sponsors-box__eyebrow">Community Sponsors</p>
              <h2 className="community-sponsors-box__title">Businesses backing the mission</h2>
              <p className="community-sponsors-box__description">
                Local sponsors help keep programs, events, and community outreach moving.
              </p>
            </div>

            {sponsors.length > 0 ? (
              <>
                {featuredSponsors.length > 0 ? (
                  <div className={`community-sponsors-featured community-sponsors-featured--count-${featuredSponsors.length}`}>
                    {featuredSponsors.map((sponsor) => (
                    <article key={sponsor.id} className="community-sponsor-card community-sponsor-card--featured">
                      <div className="community-sponsor-card__image-wrap community-sponsor-card__image-wrap--featured">
                        <div
                          className="community-sponsor-card__image community-sponsor-card__image--featured"
                          role="img"
                          aria-label={sponsor.name}
                          style={{ backgroundImage: `url(${sponsor.image})` }}
                        />
                      </div>
                      <div className="community-sponsor-card__copy">
                        <p className="community-sponsor-card__name">{sponsor.name}</p>
                        <p className="community-sponsor-card__text" style={{ whiteSpace: "pre-line" }}>
                          {sponsor.description}
                        </p>
                        <SponsorMediaLinks
                          websiteUrl={sponsor.websiteUrl}
                          instagramUrl={sponsor.instagramUrl}
                        />
                      </div>
                    </article>
                    ))}
                  </div>
                ) : null}

                {standardSponsors.length > 0 ? (
                  <CommunitySponsorCarousel count={standardSponsors.length}>
                        {standardSponsors.map((sponsor) => (
                          <article key={sponsor.id ?? sponsor.name} className="community-sponsor-card community-sponsor-card--carousel">
                            <div className="community-sponsor-card__image-wrap">
                              <div
                                className="community-sponsor-card__image"
                                role="img"
                                aria-label={sponsor.name}
                                style={{ backgroundImage: `url(${sponsor.image})` }}
                              />
                            </div>
                            <div className="community-sponsor-card__copy">
                              <p className="community-sponsor-card__name">{sponsor.name}</p>
                              <p className="community-sponsor-card__text" style={{ whiteSpace: "pre-line" }}>{sponsor.description}</p>
                              <SponsorMediaLinks websiteUrl={sponsor.websiteUrl} instagramUrl={sponsor.instagramUrl} />
                            </div>
                          </article>
                        ))}
                  </CommunitySponsorCarousel>
                ) : null}
              </>
            ) : (
              <p className="community-sponsors-box__empty">
                Sponsor spotlights will show up here as community partners are added.
              </p>
            )}
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
