import type { MetadataRoute } from "next";
import { configuredSiteUrl } from "@/lib/site-url";

export default function robots(): MetadataRoute.Robots {
  const siteUrl = configuredSiteUrl();

  return {
    rules: { userAgent: "*", allow: "/" },
    ...(siteUrl ? { sitemap: new URL("/sitemap.xml", siteUrl).toString() } : {}),
  };
}