"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type SportSponsorSettings = {
  enabled?: boolean;
  sponsorName?: string;
  imageUrl?: string;
  linkUrl?: string;
  buttonText?: string;
  altText?: string;
};

type SiteSettingsResponse = {
  settings?: {
    sportSponsors?: Record<string, SportSponsorSettings>;
  };
};

type SportSponsorBannerProps = {
  sportSlug: string;
};

const isExternalUrl = (value: string) => /^https?:\/\//i.test(value);

export function SportSponsorBanner({ sportSlug }: SportSponsorBannerProps) {
  const [sponsor, setSponsor] = useState<SportSponsorSettings | null>(null);

  useEffect(() => {
    const loadSponsor = async () => {
      try {
        const response = await fetch("/api/admin/site-settings");
        const json = (await response.json().catch(() => null)) as SiteSettingsResponse | null;
        const nextSponsor = json?.settings?.sportSponsors?.[sportSlug] ?? null;
        setSponsor(nextSponsor);
      } catch {
        setSponsor(null);
      }
    };

    void loadSponsor();
  }, [sportSlug]);

  if (!sponsor?.enabled || !sponsor.imageUrl?.trim()) {
    return null;
  }

  const imageUrl = sponsor.imageUrl.trim();
  const linkUrl = sponsor.linkUrl?.trim() ?? "";
  const alt = sponsor.altText?.trim() || sponsor.sponsorName?.trim() || "Sport sponsor";
  const sponsorName = sponsor.sponsorName?.trim() || alt;
  const buttonText = sponsor.buttonText?.trim() || "Take Me There";
  const sponsorMark = (
    <span
      className="sport-sponsor-banner__mark"
      role="img"
      aria-label={alt}
      style={{ backgroundImage: `url(${imageUrl})` }}
    />
  );
  const button = <span className="button ghost sport-sponsor-banner__button">{buttonText}</span>;

  return (
    <section className="sport-sponsor-banner" aria-label={`${alt} sponsor banner`}>
      <div className="sport-sponsor-banner__inner">
        {sponsorMark}
        <p className="sport-sponsor-banner__message">{sponsorName}</p>
        {linkUrl ? (
          isExternalUrl(linkUrl) ? (
            <a className="sport-sponsor-banner__link" href={linkUrl} target="_blank" rel="noreferrer">
              {button}
            </a>
          ) : (
            <Link className="sport-sponsor-banner__link" href={linkUrl}>
              {button}
            </Link>
          )
        ) : null}
      </div>
    </section>
  );
}
