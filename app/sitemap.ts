import type { MetadataRoute } from "next";

import { SITE_URL } from "@/lib/site-metadata";

const publicRoutes = [
  "",
  "/events",
  "/sports",
  "/merch",
  "/community",
  "/contact",
  "/sponsors",
  "/register",
  "/leagues",
  "/leagues/sunday-league",
];

export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date();

  return publicRoutes.map((route) => ({
    url: `${SITE_URL}${route}`,
    lastModified,
    changeFrequency: route === "" ? "weekly" : "monthly",
    priority: route === "" ? 1 : 0.7,
  }));
}
