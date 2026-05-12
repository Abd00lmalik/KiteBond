"use client";

import { ConnectButton } from "@rainbow-me/rainbowkit";
import { Check, Copy, WalletCards } from "lucide-react";
import { useState } from "react";
import { formatUnits } from "viem";
import { useAccount, useBalance } from "wagmi";
import { TEST_USDT_ADDRESS } from "@/lib/contract";
import { truncateHash } from "@/lib/utils";

export function WalletPanel() {
  const { address, isConnected } = useAccount();
  const [copied, setCopied] = useState(false);
  const { data: kite } = useBalance({ address });
  const { data: usdt } = useBalance({ address, token: TEST_USDT_ADDRESS });

  async function copyAddress() {
    if (!address) return;
    await navigator.clipboard.writeText(address);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1200);
  }

  return (
    <div className="card p-4">
      <div className="mb-3 flex items-center gap-2 text-sm font-semibold">
        <span className="h-2 w-2 rounded-full bg-[var(--green)]" />
        <WalletCards className="h-4 w-4 text-[var(--orange)]" aria-hidden="true" />
        KiteAI Testnet
      </div>
      {isConnected && address ? (
        <div className="space-y-3 text-xs text-[var(--text-secondary)]">
          <div className="flex items-center justify-between gap-2">
            <p className="address text-[var(--text-primary)]">{truncateHash(address, 8, 6)}</p>
            <button
              type="button"
              onClick={copyAddress}
              className="focus-ring inline-flex h-7 w-7 items-center justify-center rounded-[var(--radius-md)] border border-[var(--border-default)] transition hover:border-[var(--border-orange)]"
              aria-label="Copy wallet address"
              title="Copy wallet address"
            >
              {copied ? <Check className="h-3.5 w-3.5 text-[var(--green)]" /> : <Copy className="h-3.5 w-3.5" />}
            </button>
          </div>
          <p>KITE: {kite ? Number(formatUnits(kite.value, kite.decimals)).toFixed(4) : "0.0000"}</p>
          <p>USDT: {usdt ? Number(formatUnits(usdt.value, usdt.decimals)).toFixed(2) : "0.00"}</p>
          <ConnectButton.Custom>
            {({ openAccountModal }) => (
              <button
                type="button"
                onClick={openAccountModal}
                className="focus-ring w-full rounded-[var(--radius-md)] border border-[var(--border-default)] px-3 py-2 text-left text-xs text-[var(--text-secondary)] transition hover:border-[var(--border-orange)] hover:text-[var(--text-primary)]"
              >
                Disconnect / wallet options
              </button>
            )}
          </ConnectButton.Custom>
        </div>
      ) : (
        <ConnectButton />
      )}
    </div>
  );
}
