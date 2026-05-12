"use client";

import { ConnectButton } from "@rainbow-me/rainbowkit";
import { Rocket } from "lucide-react";
import { usePathname } from "next/navigation";
import { formatUnits } from "viem";
import { useAccount, useBalance } from "wagmi";
import { useNetworkGuard } from "@/hooks/useNetworkGuard";
import { TEST_USDT_ADDRESS } from "@/lib/contract";
import { truncateHash } from "@/lib/utils";

export function TopBar() {
  const pathname = usePathname();
  const { address, isConnected } = useAccount();
  const { isCorrectNetwork, isSwitching, switchToKite } = useNetworkGuard();
  const { data: kite } = useBalance({ address });
  const { data: usdt } = useBalance({ address, token: TEST_USDT_ADDRESS });

  const section =
    pathname.split("/").filter(Boolean).slice(1).join(" / ").replace(/-/g, " ") ||
    "overview";

  return (
    <header className="sticky top-0 z-40 h-[52px] border-b border-[var(--border-dim)] bg-[var(--bg-surface)] px-4 backdrop-blur-md lg:px-6">
      <div className="grid h-full grid-cols-[1fr_auto_1fr] items-center gap-4">
        <div className="flex min-w-0 items-center gap-2 font-syne font-bold capitalize">
          <Rocket className="h-4 w-4 text-[var(--orange)]" aria-hidden="true" />
          <span className="truncate">KiteBond / {section}</span>
        </div>
        <div className="hidden items-center justify-center gap-3 md:flex">
          {isConnected && !isCorrectNetwork ? (
            <button
              type="button"
              onClick={switchToKite}
              disabled={isSwitching}
              className="focus-ring inline-flex items-center gap-2 rounded-[var(--radius-md)] border border-[var(--border-red)] bg-[var(--red-dim)] px-3 py-1.5 text-xs text-[var(--red)]"
            >
              <span className="h-2 w-2 rounded-full bg-[var(--red)]" />
              Wrong Network - Switch
            </button>
          ) : (
            <div className="inline-flex items-center gap-2 rounded-[var(--radius-md)] border border-[var(--border-green)] bg-[var(--green-dim)] px-3 py-1.5 text-xs text-[var(--green)]">
              <span className="h-2 w-2 rounded-full bg-[var(--green)]" />
              KiteAI Testnet
            </div>
          )}
        </div>
        <div className="flex items-center justify-end gap-3">
          {isConnected && address && (
            <div className="hidden items-center gap-3 text-xs text-[var(--text-secondary)] xl:flex">
              <span className="address text-[var(--text-primary)]">{truncateHash(address, 8, 6)}</span>
              <span>KITE {kite ? Number(formatUnits(kite.value, kite.decimals)).toFixed(4) : "0.0000"}</span>
              <span>USDT {usdt ? Number(formatUnits(usdt.value, usdt.decimals)).toFixed(2) : "0.00"}</span>
            </div>
          )}
          <ConnectButton />
        </div>
      </div>
    </header>
  );
}
