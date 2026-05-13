import type { Metadata } from "next";
import type { ReactNode } from "react";
import { IBM_Plex_Mono, Inter, Syne } from "next/font/google";
import "./globals.css";
import { Providers } from "./providers";
import { ParticleField } from "@/components/landing/ParticleField";
import { PageShell } from "@/components/shared/PageShell";

const inter = Inter({ subsets: ["latin"], variable: "--font-sans", display: "swap" });
const display = Syne({ subsets: ["latin"], weight: ["700", "800"], variable: "--font-display", display: "swap" });
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
        <div className="bg-glow" aria-hidden="true" />
        <div className="dot-grid" aria-hidden="true" />
        <ParticleField />
        <div className="scan-line" aria-hidden="true" />
        <Providers>
          <PageShell>{children}</PageShell>
        </Providers>
      </body>
    </html>
  );
}
