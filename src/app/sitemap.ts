import type { MetadataRoute } from "next";
import { configuredSiteUrl } from "@/lib/site-url";

export default function sitemap(): MetadataRoute.Sitemap {
  const siteUrl = configuredSiteUrl();

  if (!siteUrl) {
    return [];
  }

  return [
    {
      url: new URL("/", siteUrl).toString(),
      changeFrequency: "monthly",
      priority: 1,
    },
  ];
}