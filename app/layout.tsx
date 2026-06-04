import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { PlatformFrame } from "../components/PlatformFrame";
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
  title: "Nexez",
  description: "Human-first management. Agent-first consumption. Premium AI-optimized pages for products and services.",
  icons: {
    icon: "/favicon.ico",
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
    >
      <body className="min-h-full flex flex-col">
        <PlatformFrame>{children}</PlatformFrame>
      </body>
    </html>
  );
}
