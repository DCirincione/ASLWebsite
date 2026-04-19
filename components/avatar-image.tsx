import type { CSSProperties } from "react";

type AvatarImageProps = {
  src?: string | null;
  alt: string;
  loading?: "eager" | "lazy";
  objectPosition?: CSSProperties["objectPosition"];
};

export function AvatarImage({
  src,
  alt,
  loading = "lazy",
  objectPosition = "center",
}: AvatarImageProps) {
  const resolvedSrc = src?.trim() || "/avatar-placeholder.svg";

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={resolvedSrc}
      alt={alt}
      loading={loading}
      decoding="async"
      style={{
        width: "100%",
        height: "100%",
        display: "block",
        objectFit: "cover",
        objectPosition,
      }}
    />
  );
}
