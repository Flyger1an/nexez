import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { PlatformFrame } from "../components/PlatformFrame";
import { THEME_NO_FLASH_SCRIPT } from "../lib/theme";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
  weight: ["400", "500", "700"],
});

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || "https://nexez.vercel.app"),
  title: {
    default: "Nexez — Pages built for AI agents",
    template: "%s · Nexez",
  },
  description:
    "Create a clean, structured page that AI agents can understand and act on — host it on your own domain or a Nexez link. JSON-LD, llms.txt, agent.json, and an MCP endpoint from one source of truth.",
  applicationName: "Nexez",
  keywords: [
    "AI agents",
    "agent-optimized pages",
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
    title: "Nexez — Pages built for AI agents",
    description:
      "A clean, structured page that AI agents can understand and act on. Host it on your domain or Nexez.",
    url: "/",
  },
  twitter: {
    card: "summary_large_image",
    title: "Nexez — Pages built for AI agents",
    description: "A clean, structured page that AI agents can understand and act on.",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_NO_FLASH_SCRIPT }} />
      </head>
      <body className="min-h-full flex flex-col">
        <PlatformFrame>{children}</PlatformFrame>
      </body>
    </html>
  );
}
