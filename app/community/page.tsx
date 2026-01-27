"use client";

import Image from "next/image";

import { PageShell } from "@/components/page-shell";
import { Section } from "@/components/section";

type Article = {
  title: string;
  blurb: string;
  href: string;
  date?: string;
  image?: string;
};

const featuredArticles: Article[] = [
  {
    title: "Aldrich Sports League Helps Raise Over $2000 For The American Amputee Soccer Association",
    blurb: "Fundraiser highlights: $2,124 raised and huge community turnout for the national amputee team.",
    href: "https://www.usampsoccer.org/post/aldrich-sports-league-helps-raise-over-2000-for-the-american-amputee-soccer-association",
    date: "Aug 5, 2024",
    image:
      "https://static.wixstatic.com/media/1e30cd_9688facd01a14c4da31b79ff0f35ac37~mv2.jpg/v1/fill/w_980,h_653,al_c,q_85,usm_0.66_1.00_0.01,enc_avif,quality_auto/1e30cd_9688facd01a14c4da31b79ff0f35ac37~mv2.jpg",
  },
  {
    title: "Have a jolly old time at Aldrich Sports League’s inaugural Christmas Pickleball Tournament",
    blurb: "Dec. 20 tournament at Box Pickleball brings holiday spirit, raffles, and community brackets.",
    href: "https://riverheadnewsreview.timesreview.com/2025/11/130112/have-a-jolly-old-time-at-aldrich-sports-leagues-inaugural-christmas-pickleball-tournament/",
    date: "Nov 18, 2025",
    image:
      "https://timesreview-images.s3.amazonaws.com/wp-content/uploads/sites/3/2025/11/TR0123_NFpickleball2_sv-1-1024x768.jpg",
  },
  {
    title: "Aldrich Sports League hosts full day of champions",
    blurb: "Summer Sunday soccer playoffs plus amputee team exhibition raise funds for AASA in Laurel.",
    href: "https://suffolktimes.timesreview.com/2025/08/aldrich-sports-league-hosts-full-day-of-champions/",
    date: "Aug 4, 2025",
    image: "https://timesreview-images.s3.amazonaws.com/wp-content/uploads/sites/4/2025/08/IMG_1960-1024x683.jpg",
  },
  {
    title: "Aldrich Sports League hosts second full-day fundraiser for amputee team",
    blurb: "Aug. 3 fundraiser returns with soccer playoffs, exhibition match, raffles, and local sponsors.",
    href: "https://suffolktimes.timesreview.com/2025/07/aldrich-sports-league-to-host-full-day-of-sports-fundraiser/",
    date: "Jul 21, 2025",
    image:
      "https://timesreview-images.s3.amazonaws.com/wp-content/uploads/sites/4/2025/07/R0724_AldrichAmputeeTourney_Courtesy-1024x683.jpeg",
  },
  {
    title: "Local ballers bring the heat to Laurel in new charity tournament",
    blurb: "Community Kids Basketball Tournament mixes local talent and fundraises for youth sports scholarships.",
    href: "https://suffolktimes.timesreview.com/2025/06/local-ballers-bring-the-heat-to-laurel-in-new-charity-tournament/",
    date: "Jun 3, 2025",
    image: "https://timesreview-images.s3.amazonaws.com/wp-content/uploads/sites/4/2025/06/IMG_0701-1-1024x683.jpg",
  },
];

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
            <p className="community-board__title">COMMUNITY FIRST, ALWAYS.</p>
            <p>
              At Aldrich Sports, Community is not an add-on, it is the whole point. Everything we do is built
              around bringing people together through sports, giving back to causes that matter and creating
              events that feel welcoming, fun and meaningful.
            </p>
            <p>
              From charity tournaments and fundraisers to youth programs and local partnerships, our goal is to
              be a hub where athletes, families and neighbors connect. We believe sports should do more than
              keep score, they should create opportunities, support local organizations and leave the community
              better than we found it.
            </p>
            <p>
              This is bigger than leagues and events, it is about showing up, supporting one another and
              building something lasting - together.
            </p>
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
                key={article.title + idx}
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
                <span className="article-card__cta">Read on LinkedIn →</span>
              </a>
            ))}
          </div>
        </div>
      </Section>
    </PageShell>
  );
}
