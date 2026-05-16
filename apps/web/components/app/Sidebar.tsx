"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Archive, FileSearch, Home, ListChecks, Radar, Rocket, ScrollText, UserRound } from "lucide-react";
import { useAccount } from "wagmi";
import { WalletPanel } from "./WalletPanel";

const nav = [
  { href: "/app/overview", label: "Overview", icon: Home },
  { href: "/app/instant-scan", label: "Instant Scan", icon: FileSearch },
  { href: "/app/agent-hunt", label: "Agent Hunt", icon: Radar },
  { href: "/app/hunts", label: "Open Hunts", icon: ListChecks },
  { href: "/app/my-hunts", label: "My Hunts", icon: UserRound, walletOnly: true },
  { href: "/app/scans", label: "Scan History", icon: Archive },
  { href: "/app/skill", label: "Skill Docs", icon: ScrollText }
];

export function Sidebar() {
  const pathname = usePathname();
  const { isConnected } = useAccount();

  return (
    <div className="sidebar flex h-full w-full shrink-0 flex-col p-4">
      <Link href="/" className="mb-8 flex items-center gap-2 text-xl font-semibold">
        <span className="flex h-8 w-8 items-center justify-center rounded-[var(--radius-md)] border border-[var(--border-orange)] bg-[var(--orange-dim)] text-[var(--orange)]">
          <Rocket className="h-4 w-4" aria-hidden="true" />
        </span>
        <span>KiteBond</span>
      </Link>
      <nav className="space-y-1">
        {nav.filter((item) => !item.walletOnly || isConnected).map((item) => {
          const active =
            pathname === item.href ||
            (item.href === "/app/hunts" && pathname.startsWith("/app/hunts/")) ||
            (item.href === "/app/my-hunts" && pathname.startsWith("/app/my-hunts/"));
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`focus-ring flex w-full items-center gap-3 px-3 py-2.5 text-sm transition ${
                active
                  ? "nav-item-active"
                  : "nav-item"
              }`}
              aria-label={item.label}
            >
              <item.icon className="h-4 w-4" aria-hidden="true" />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>
      <div className="mt-auto">
        <WalletPanel />
      </div>
    </div>
  );
}
