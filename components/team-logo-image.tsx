"use client";

import Image from "next/image";
import { useEffect, useState } from "react";

import { supabase } from "@/lib/supabase/client";

const TEAM_PLACEHOLDER = "/team-placeholder.svg";
const SIGNUPS_BUCKET = "signups";

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
  const [resolvedSrc, setResolvedSrc] = useState<string>(TEAM_PLACEHOLDER);

  useEffect(() => {
    let cancelled = false;

    const resolve = async () => {
      const normalized = src?.trim() || "";
      if (!normalized) {
        setResolvedSrc(TEAM_PLACEHOLDER);
        return;
      }

      const path = extractStoragePath(normalized);
      if (!path) {
        setResolvedSrc(isDirectUrl(normalized) ? normalized : TEAM_PLACEHOLDER);
        return;
      }

      if (!supabase) {
        setResolvedSrc(TEAM_PLACEHOLDER);
        return;
      }

      const { data, error } = await supabase.storage.from(SIGNUPS_BUCKET).createSignedUrl(path, 60 * 60);
      if (cancelled) return;

      if (error || !data?.signedUrl) {
        setResolvedSrc(TEAM_PLACEHOLDER);
        return;
      }

      setResolvedSrc(data.signedUrl);
    };

    void resolve();

    return () => {
      cancelled = true;
    };
  }, [src]);

  if (fill) {
    return <Image src={resolvedSrc} alt={alt} fill sizes={sizes} />;
  }

  return <Image src={resolvedSrc} alt={alt} width={width ?? 80} height={height ?? 80} sizes={sizes} />;
}
