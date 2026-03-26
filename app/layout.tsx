import type { Metadata } from "next";
import Script from "next/script";
import "./globals.css";

const accessibilityBootstrapScript = `
(() => {
  const STORAGE_KEY = "asl-accessibility-settings";
  const root = document.documentElement;
  let fontScale = 1;
  let theme = "dark";
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
  title: "Aldrich Sports",
  description: "Next.js App Router starter with shared components.",
  formatDetection: {
    telephone: false,
    address: false,
    email: false,
    date: false,
  },
  icons: {
    icon: "/ASLLogo.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" data-scroll-behavior="smooth" data-theme="dark" suppressHydrationWarning>
      <body>
        <Script
          id="accessibility-bootstrap"
          strategy="beforeInteractive"
          dangerouslySetInnerHTML={{ __html: accessibilityBootstrapScript }}
        />
        {children}
      </body>
    </html>
  );
}
