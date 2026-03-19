import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";
import SentinelNav from "@/components/sentinel-nav";
import SentinelFooter from "@/components/sentinel-footer";

const geistSans = localFont({
  src: "./fonts/GeistVF.woff",
  variable: "--font-geist-sans",
  weight: "100 900",
});
const geistMono = localFont({
  src: "./fonts/GeistMonoVF.woff",
  variable: "--font-geist-mono",
  weight: "100 900",
});

export const metadata: Metadata = {
  title: "Solar Sentinel — Interconnection Queue Intelligence",
  description:
    "Real-time interconnection queue monitoring, AI-powered diligence, and risk analysis for solar, BESS, and data center power procurement.",
  openGraph: {
    title: "Solar Sentinel — Queue Intelligence + Risk Radar",
    description: "Monitor interconnection queues across 6 ISOs. AI-powered project diligence in 24 hours.",
    url: "https://sentinel-alerts.vercel.app",
    siteName: "Solar Sentinel",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Solar Sentinel — Queue Intelligence + Risk Radar",
    description: "Monitor interconnection queues across 6 ISOs. AI-powered project diligence in 24 hours.",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body
        className={`${geistSans.variable} ${geistMono.variable} font-sans antialiased bg-[#0a0f1c] text-gray-100`}
      >
        <SentinelNav />
        <main className="min-h-screen">{children}</main>
        <SentinelFooter />
      </body>
    </html>
  );
}
