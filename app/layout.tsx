import type { Metadata } from "next";
import Script from "next/script";

import { SITE_ALTERNATE_NAMES, SITE_DESCRIPTION, SITE_NAME, SITE_SOCIALS, SITE_TITLE, SITE_URL } from "@/lib/site-metadata";

import "./globals.css";

const accessibilityBootstrapScript = `
(() => {
  const STORAGE_KEY = "asl-accessibility-settings";
  const root = document.documentElement;
  let fontScale = 1;
  let theme = "light";
  let highlightLinks = "off";

  try {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      if (typeof parsed?.fontScale === "number") {
        fontScale = parsed.fontScale;
      }
      if (parsed?.theme === "light" || parsed?.theme === "dark") {
        theme = parsed.theme;
      }
      if (parsed?.highlightLinks === "on" || parsed?.highlightLinks === "off") {
        highlightLinks = parsed.highlightLinks;
      }
    }
  } catch {}

  root.dataset.fontScale = String(fontScale);
  root.dataset.theme = theme;
  root.style.setProperty("--font-scale", String(fontScale));
  if (highlightLinks === "on") {
    root.classList.add("highlight-links");
  } else {
    root.classList.remove("highlight-links");
  }
})();
`;

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  alternates: {
    canonical: SITE_URL,
  },
  title: {
    default: SITE_TITLE,
    template: `%s | ${SITE_NAME}`,
  },
  description: SITE_DESCRIPTION,
  applicationName: SITE_NAME,
  formatDetection: {
    telephone: false,
    address: false,
    email: false,
    date: false,
  },
  openGraph: {
    type: "website",
    locale: "en_US",
    siteName: SITE_NAME,
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
    url: SITE_URL,
    images: [
      {
        url: "/ASLLogo.png",
        alt: `${SITE_NAME} logo`,
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
    images: ["/ASLLogo.png"],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
      "max-snippet": -1,
      "max-video-preview": -1,
    },
  },
  icons: {
    icon: [
      {
        url: "/favicon.ico",
        sizes: "any",
      },
      {
        url: "/icon.png",
        type: "image/png",
        sizes: "512x512",
      },
    ],
    shortcut: "/favicon.ico",
    apple: "/icon.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const structuredData = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Organization",
        "@id": `${SITE_URL}/#organization`,
        name: SITE_NAME,
        url: SITE_URL,
        alternateName: SITE_ALTERNATE_NAMES,
        logo: {
          "@type": "ImageObject",
          url: `${SITE_URL}/ASLLogo.png`,
          width: 2270,
          height: 2587,
        },
        sameAs: SITE_SOCIALS,
      },
      {
        "@type": "WebSite",
        "@id": `${SITE_URL}/#website`,
        url: SITE_URL,
        name: SITE_NAME,
        alternateName: SITE_ALTERNATE_NAMES,
        description: SITE_DESCRIPTION,
        publisher: {
          "@id": `${SITE_URL}/#organization`,
        },
      },
    ],
  };

  return (
    <html lang="en" data-scroll-behavior="smooth" data-theme="light" suppressHydrationWarning>
      <body>
        <Script
          id="accessibility-bootstrap"
          strategy="beforeInteractive"
          dangerouslySetInnerHTML={{ __html: accessibilityBootstrapScript }}
        />
        <Script
          id="site-structured-data"
          type="application/ld+json"
          strategy="beforeInteractive"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
        />
        {children}
      </body>
    </html>
  );
}
