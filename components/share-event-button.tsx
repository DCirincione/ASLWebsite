"use client";

import { useState } from "react";

type ShareEventButtonProps = {
  title: string;
  url: string;
};

const getAbsoluteShareUrl = (url: string) => {
  if (/^https?:\/\//i.test(url)) return url;
  if (typeof window === "undefined") return url;
  return new URL(url, window.location.origin).toString();
};

export function ShareEventButton({ title, url }: ShareEventButtonProps) {
  const [copied, setCopied] = useState(false);

  const shareEvent = async () => {
    const shareUrl = getAbsoluteShareUrl(url);
    const shareTitle = title.trim() || "Aldrich Sports event";

    try {
      if (navigator.share) {
        await navigator.share({
          title: shareTitle,
          text: `Check out ${shareTitle} from Aldrich Sports.`,
          url: shareUrl,
        });
        return;
      }

      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      setCopied(false);
    }
  };

  return (
    <button className="button ghost event-card__share" type="button" onClick={shareEvent}>
      {copied ? "Link Copied" : "Share"}
    </button>
  );
}
