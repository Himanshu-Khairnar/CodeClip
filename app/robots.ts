import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  // Clip URLs are unlisted secrets — keep them (and the API) out of crawlers.
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/clip/", "/api/"],
      },
    ],
  };
}
