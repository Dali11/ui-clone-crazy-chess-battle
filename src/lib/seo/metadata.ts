import type { Metadata } from "next";

const BASE_URL = "https://crazychessbattles.live";
const DEFAULT_OG_IMAGE = "/og-image.png";

/**
 * Generate consistent Open Graph + Twitter Card metadata for any page.
 * The root layout already sets siteName, locale, and the default image —
 * but per-page OG/Twitter ensures each link preview shows the right title
 * and description when shared on social media or messaging apps.
 */
export function pageMetadata(opts: {
  title: string;
  description: string;
  path?: string;          // e.g. "/about" — used for OG url + canonical
  image?: string;         // override the default OG image
  noIndex?: boolean;
  type?: "website" | "article" | "profile";
}): Metadata {
  const url = opts.path ? `${BASE_URL}${opts.path}` : BASE_URL;
  const image = opts.image || DEFAULT_OG_IMAGE;

  return {
    title: opts.title,
    description: opts.description,
    openGraph: {
      title: opts.title,
      description: opts.description,
      type: opts.type || "website",
      url,
      siteName: "Crazy Chess Battles",
      locale: "en_US",
      images: [{ url: image, width: 1200, height: 630, alt: opts.title }],
    },
    twitter: {
      card: "summary_large_image",
      title: opts.title,
      description: opts.description,
      images: [image],
    },
    alternates: opts.path ? { canonical: url } : undefined,
    robots: opts.noIndex
      ? { index: false, follow: false }
      : { index: true, follow: true },
  };
}
