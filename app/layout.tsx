import type { Metadata } from "next";
import { cookies } from "next/headers";
import { Schibsted_Grotesk, Instrument_Sans, JetBrains_Mono } from "next/font/google";
import { PlatformFrame } from "../components/PlatformFrame";
import { DesignSystemFx } from "../components/DesignSystemFx";
import { hasSupabaseAuthCookie } from "../lib/auth-cookie";
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
  description:
    "Create a clean, structured listing that AI agents can understand and act on - host it on your own domain or a Nexez link. JSON-LD, llms.txt, agent.json, and an MCP endpoint from one source of truth.",
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
      "A clean, structured listing that AI agents can understand and act on. Host it on your domain or Nexez.",
    url: marketingUrl("/"),
  },
  twitter: {
    card: "summary_large_image",
    title: "Nexez - Listings built for AI agents",
    description: "A clean, structured listing that AI agents can understand and act on.",
  },
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Resolve the session server-side so PlatformFrame can pick the right chrome on
  // the dual discovery surfaces (signed-in → dashboard nav) without a client flash.
  const hasSession = hasSupabaseAuthCookie((await cookies()).getAll());

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
        <PlatformFrame hasSession={hasSession}>{children}</PlatformFrame>
        <DesignSystemFx />
      </body>
    </html>
  );
}
