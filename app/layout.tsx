import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "ASL Website",
  description: "Next.js App Router starter with shared components.",
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
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
