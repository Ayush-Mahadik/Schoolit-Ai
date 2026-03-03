import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import { Providers } from "@/app/providers";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
  variable: "--font-inter",
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-mono",
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL("https://prolai.me"),
  title: "PROLAI — Professional AI Learning Assistant",
  description:
    "AI-powered learning platform with multi-model intelligence, deep reasoning, and 20+ study tools for CBSE students.",
  keywords: ["PROLAI", "AI tutor", "CBSE", "study", "learning", "education"],
  authors: [{ name: "Ayush Mahadik" }],
  alternates: {
    canonical: "https://prolai.me",
  },
  openGraph: {
    title: "PROLAI — Professional AI Learning Assistant",
    description: "Multi-model AI learning platform with deep reasoning and 20+ study tools.",
    url: "https://prolai.me",
    siteName: "PROLAI",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`dark ${inter.variable} ${jetbrainsMono.variable}`}>
      <head>
        {/* KaTeX CSS for math rendering */}
        <link
          rel="stylesheet"
          href="https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/katex.min.css"
          integrity="sha384-nB0miv6/jRmo5UIDR2TJCFnQhSi0aBJyMKk8naVOBGFRTo+2bkMwSGOD3iMQHVA"
          crossOrigin="anonymous"
        />
      </head>
      <body className="min-h-screen bg-surface-0">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
