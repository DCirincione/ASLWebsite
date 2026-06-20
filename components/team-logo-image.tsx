"use client";

import Image from "next/image";

const TEAM_PLACEHOLDER = "/team-placeholder.svg";

const extractStoragePath = (value?: string | null) => {
  const normalized = value?.trim() || "";
  if (!normalized) return null;
  if (normalized.startsWith("/")) return null;
  if (!normalized.startsWith("http://") && !normalized.startsWith("https://")) return normalized;

  try {
    const url = new URL(normalized);
    const match = url.pathname.match(/\/signups\/(.+)$/);
    return match?.[1] ?? null;
  } catch {
    return null;
  }
};

const isDirectUrl = (value?: string | null) => {
  const normalized = value?.trim() || "";
  if (!normalized) return false;
  return normalized.startsWith("/") || normalized.startsWith("http://") || normalized.startsWith("https://");
};

type TeamLogoImageProps = {
  src?: string | null;
  alt?: string;
  fill?: boolean;
  sizes?: string;
  width?: number;
  height?: number;
};

export function TeamLogoImage({
  src,
  alt = "",
  fill = false,
  sizes,
  width,
  height,
}: TeamLogoImageProps) {
  const normalized = src?.trim() || "";
  const storagePath = extractStoragePath(normalized);
  const resolvedSrc = storagePath
    ? `/api/sunday-league/team-logo?path=${encodeURIComponent(storagePath)}`
    : isDirectUrl(normalized)
      ? normalized
      : TEAM_PLACEHOLDER;
  const unoptimized = Boolean(storagePath);

  if (fill) {
    return <Image src={resolvedSrc} alt={alt} fill sizes={sizes} unoptimized={unoptimized} />;
  }

  return (
    <Image
      src={resolvedSrc}
      alt={alt}
      width={width ?? 80}
      height={height ?? 80}
      sizes={sizes}
      unoptimized={unoptimized}
    />
  );
}
