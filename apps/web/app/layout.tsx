import type { Metadata } from "next";
import type { ReactNode } from "react";
import { IBM_Plex_Mono, Inter, Space_Grotesk } from "next/font/google";
import "./globals.css";
import { Providers } from "./providers";
import { PageShell } from "@/components/shared/PageShell";

const inter = Inter({ subsets: ["latin"], variable: "--font-sans", display: "swap" });
const display = Space_Grotesk({ subsets: ["latin"], weight: ["600", "700"], variable: "--font-display", display: "swap" });
const mono = IBM_Plex_Mono({ subsets: ["latin"], weight: ["400", "500"], variable: "--font-mono", display: "swap" });

export const metadata: Metadata = {
  title: "KiteBond - NPM Package Security on Kite",
  description:
    "KiteBond scans npm packages and escalates risky packages to bonded AI security agents on KiteAI Testnet."
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className={`${inter.variable} ${display.variable} ${mono.variable}`}>
        <div className="scan-line" aria-hidden="true" />
        <div className="cyber-grid-large" aria-hidden="true" />
        <div className="cyber-grid" aria-hidden="true" />
        <Providers>
          <PageShell>{children}</PageShell>
        </Providers>
      </body>
    </html>
  );
}
