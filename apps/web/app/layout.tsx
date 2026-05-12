import type { Metadata } from "next";
import type { ReactNode } from "react";
import { IBM_Plex_Mono, Syne } from "next/font/google";
import "./globals.css";
import { Providers } from "./providers";
import { PageShell } from "@/components/shared/PageShell";

const syne = Syne({ subsets: ["latin"], weight: ["400", "700", "800"], variable: "--font-display" });
const mono = IBM_Plex_Mono({ subsets: ["latin"], weight: ["400", "500"], variable: "--font-mono" });

export const metadata: Metadata = {
  title: "KiteBond - NPM Package Security on Kite",
  description:
    "KiteBond scans npm packages and escalates risky packages to bonded AI security agents on KiteAI Testnet."
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className={`${syne.variable} ${mono.variable}`}>
        <div className="scan-line" aria-hidden="true" />
        <div
          aria-hidden="true"
          style={{
            position: "fixed",
            inset: 0,
            backgroundImage: `
              linear-gradient(rgba(255,255,255,0.016) 1px, transparent 1px),
              linear-gradient(90deg, rgba(255,255,255,0.016) 1px, transparent 1px)
            `,
            backgroundSize: "52px 52px",
            pointerEvents: "none",
            zIndex: 0
          }}
        />
        <Providers>
          <PageShell>{children}</PageShell>
        </Providers>
      </body>
    </html>
  );
}
