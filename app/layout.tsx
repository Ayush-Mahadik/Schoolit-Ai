import type { Metadata } from "next";
import { Providers } from "@/app/providers";
import "./globals.css";

export const metadata: Metadata = {
  title: "SchoolIT AI",
  description:
    "AI-powered learning assistant with multi-model support, deep reasoning, and advanced tools.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <head>
        {/* KaTeX CSS for math rendering */}
        <link
          rel="stylesheet"
          href="https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/katex.min.css"
          integrity="sha384-nB0miv6/jRmo5UIDR2TJCFnQhSi0aBJyMKk8naVOBGFRTo+2bkMwSGOD3iMQHVA"
          crossOrigin="anonymous"
        />
        {/* Inter + JetBrains Mono fonts */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin="anonymous"
        />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="min-h-screen bg-surface-0">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
