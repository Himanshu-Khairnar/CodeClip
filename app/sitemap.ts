import type { MetadataRoute } from "next";

export default function sitemap(): MetadataRoute.Sitemap {
  // Clips are private/ephemeral (expiry + one-time view + optional password),
  // so only the static home page is listed. Never enumerate clip codes here.
  const base =
    process.env.NEXT_PUBLIC_SITE_URL ?? "https://codeclip.example.com";
  return [
    {
      url: `${base}/`,
      lastModified: new Date(),
      changeFrequency: "weekly",
      priority: 1,
    },
  ];
}
