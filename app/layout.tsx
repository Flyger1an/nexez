import type { Metadata } from "next";
import { Schibsted_Grotesk, Instrument_Sans, JetBrains_Mono } from "next/font/google";
import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";
import { PlatformFrame } from "../components/PlatformFrame";
import { DesignSystemFx } from "../components/DesignSystemFx";
import { marketingUrl } from "../lib/site";
import { THEME_NO_FLASH_SCRIPT } from "../lib/theme";
import "./globals.css";

// Liquid Glass typography: Schibsted Grotesk (display) · Instrument Sans (body/UI)
// · JetBrains Mono (all data). All three are variable fonts.
const fontDisplay = Schibsted_Grotesk({ variable: "--font-schibsted", subsets: ["latin"] });
const fontBody = Instrument_Sans({ variable: "--font-instrument", subsets: ["latin"] });
const fontMono = JetBrains_Mono({ variable: "--font-jetbrains", subsets: ["latin"] });

export const metadata: Metadata = {
  // Marketing host: relative metadata URLs (og:url, file-convention OG images)
  // must resolve to nexez.ai. Agent-runtime pages ([slug]) set absolute URLs
  // themselves, which ignore metadataBase.
  metadataBase: new URL(marketingUrl("/")),
  title: {
    default: "Nexez - Listings built for AI agents",
    template: "%s · Nexez",
  },
  // ≤160 chars - this is the homepage's (and any metadata-less page's) SERP snippet.
  description:
    "Create a clear business listing AI assistants can understand, recommend, and buy from. Keep offers, pricing, and next steps in one place.",
  applicationName: "Nexez",
  keywords: [
    "AI agents",
    "agent-optimized listings",
    "llms.txt",
    "agent.json",
    "MCP",
    "JSON-LD",
    "schema.org",
    "AI SEO",
    "agentic web",
    "structured data",
  ],
  openGraph: {
    type: "website",
    siteName: "Nexez",
    title: "Nexez - Listings built for AI agents",
    description:
      "A structured storefront AI agents can read, trust, and buy from. Host it on your domain or Nexez.",
    url: marketingUrl("/"),
  },
  twitter: {
    // Card type only - no title/description here. The layout's twitter object
    // shallow-merges over every page, so hardcoding text would override each
    // page's own copy on share cards. Next's postProcessMetadata auto-fills
    // twitter title/description/images from the resolved openGraph (the
    // homepage falls back to the openGraph block above).
    card: "summary_large_image",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Deliberately NO request-scoped APIs here (cookies()/headers()): a dynamic API
  // in the root layout forces every route in the tree dynamic. Session detection
  // for the dual-surface chrome moved client-side into PlatformFrame.
  return (
    <html
      lang="en"
      className={`${fontDisplay.variable} ${fontBody.variable} ${fontMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_NO_FLASH_SCRIPT }} />
      </head>
      <body className="min-h-full flex flex-col">
        <PlatformFrame>{children}</PlatformFrame>
        <DesignSystemFx />
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
}
