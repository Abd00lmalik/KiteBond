"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Archive, FileSearch, Home, ListChecks, Radar, Rocket, ScrollText, Shield } from "lucide-react";
import { WalletPanel } from "./WalletPanel";

const nav = [
  { href: "/app/overview", label: "Overview", icon: Home },
  { href: "/app/instant-scan", label: "Instant Scan", icon: FileSearch },
  { href: "/app/agent-hunt", label: "Agent Hunt", icon: Radar },
  { href: "/app/hunts", label: "Open Hunts", icon: ListChecks },
  { href: "/app/scans", label: "Scan History", icon: Archive },
  { href: "/app/proofs", label: "Proof Archive", icon: Shield },
  { href: "/app/skill", label: "Skill Docs", icon: ScrollText }
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <div className="flex h-full w-16 shrink-0 flex-col border-r border-[var(--border-dim)] bg-[var(--bg-surface)] p-2 md:w-[240px] md:p-4">
      <Link href="/" className="mb-8 flex items-center justify-center gap-2 text-xl font-semibold md:justify-start">
        <span className="flex h-8 w-8 items-center justify-center rounded-[var(--radius-md)] border border-[var(--border-orange)] bg-[var(--orange-dim)] text-[var(--orange)]">
          <Rocket className="h-4 w-4" aria-hidden="true" />
        </span>
        <span className="hidden md:inline">KiteBond</span>
      </Link>
      <nav className="space-y-1">
        {nav.map((item) => {
          const active = pathname === item.href || (item.href === "/app/hunts" && pathname.startsWith("/app/hunts/"));
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`focus-ring flex w-full items-center justify-center gap-3 rounded-[var(--radius-md)] px-3 py-2.5 text-sm transition md:justify-start ${
                active
                  ? "rounded-l-none border-l-2 border-[var(--orange)] bg-[var(--orange-dim)] text-[var(--orange)]"
                  : "text-[var(--text-secondary)] hover:bg-[var(--bg-glass)] hover:text-[var(--text-primary)]"
              }`}
              aria-label={item.label}
            >
              <item.icon className="h-4 w-4" aria-hidden="true" />
              <span className="hidden md:inline">{item.label}</span>
            </Link>
          );
        })}
      </nav>
      <div className="mt-auto hidden md:block">
        <WalletPanel />
      </div>
    </div>
  );
}
