const INSTAGRAM_HOSTS = new Set(["instagram.com", "www.instagram.com"]);
const INSTAGRAM_USERNAME_PATTERN = /^(?!.*\.\.)(?!.*\.$)[a-zA-Z0-9._]{1,30}$/;
const RESERVED_INSTAGRAM_PATHS = new Set([
  "about",
  "accounts",
  "developer",
  "directory",
  "explore",
  "p",
  "reel",
  "reels",
  "stories",
  "tv",
]);

export const normalizeInstagramProfileUrl = (value: string) => {
  const trimmed = value.trim().replace(/^@/, "");
  if (!trimmed) return "";

  const candidate =
    INSTAGRAM_USERNAME_PATTERN.test(trimmed) && !RESERVED_INSTAGRAM_PATHS.has(trimmed.toLowerCase())
      ? `https://www.instagram.com/${trimmed}/`
      : /^https?:\/\//i.test(trimmed)
        ? trimmed
        : `https://${trimmed}`;

  let parsed: URL;
  try {
    parsed = new URL(candidate);
  } catch {
    return null;
  }

  const host = parsed.hostname.toLowerCase();
  if (!INSTAGRAM_HOSTS.has(host)) return null;

  const pathParts = parsed.pathname.split("/").map((part) => part.trim()).filter(Boolean);
  if (pathParts.length !== 1) return null;

  const username = pathParts[0];
  if (RESERVED_INSTAGRAM_PATHS.has(username.toLowerCase()) || !INSTAGRAM_USERNAME_PATTERN.test(username)) {
    return null;
  }

  return `https://www.instagram.com/${username}/`;
};
