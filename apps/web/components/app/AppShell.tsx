import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import { isAddress, zeroAddress } from "viem";
import { Sidebar } from "./Sidebar";
import { TopBar } from "./TopBar";
import { getMissingContractConfig } from "@/lib/contractConfig";
import { safeFetch } from "@/lib/safeFetch";

type AgentConfigResponse = {
  contracts?: {
    huntRegistry?: string | null;
    scanPayments?: string | null;
    paymentToken?: string | null;
  };
};

function isConfiguredAddress(value: string | null | undefined): boolean {
  if (!value) return false;
  const normalized = value.trim().replace(/^['"]|['"]$/g, "");
  return isAddress(normalized) && normalized !== zeroAddress;
}

export function AppShell({ children, right }: { children: ReactNode; right?: ReactNode }) {
  const [runtimeMissing, setRuntimeMissing] = useState<string[] | null>(null);
  const fallbackMissing = useMemo(getMissingContractConfig, []);

  useEffect(() => {
    let active = true;

    void safeFetch<AgentConfigResponse>("/api/agent/config", { cache: "no-store" })
      .then((json) => {
        if (!active) return;
        const missing: string[] = [];
        if (!isConfiguredAddress(json.contracts?.scanPayments)) missing.push("NEXT_PUBLIC_SCAN_PAYMENTS_CONTRACT");
        if (!isConfiguredAddress(json.contracts?.huntRegistry)) missing.push("NEXT_PUBLIC_KITEBOND_CONTRACT");
        if (!isConfiguredAddress(json.contracts?.paymentToken)) missing.push("NEXT_PUBLIC_PAYMENT_TOKEN");
        setRuntimeMissing(missing);
      })
      .catch(() => {
        if (!active) return;
        setRuntimeMissing(fallbackMissing);
      });

    return () => {
      active = false;
    };
  }, [fallbackMissing]);

  const missing = runtimeMissing ?? fallbackMissing;
  const contractsReady = runtimeMissing ? runtimeMissing.length === 0 : null;

  return (
    <div className="relative flex h-[100dvh] overflow-hidden bg-transparent">
      <aside className="h-full w-[240px] min-w-[240px] shrink-0 overflow-y-auto overflow-x-hidden">
        <Sidebar />
      </aside>
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <TopBar />
        <div
          aria-hidden
          className="pointer-events-none absolute left-[46%] top-[-120px] h-[420px] w-[620px] -translate-x-1/2 rounded-full bg-orange-glow blur-3xl"
        />
        <main
          className={`relative z-10 grid min-w-0 flex-1 gap-5 overflow-y-auto overflow-x-hidden p-4 lg:p-6 ${
            right ? "lg:grid-cols-[minmax(0,1fr)_360px]" : "lg:grid-cols-1"
          }`}
        >
          <section className="min-w-0 space-y-5">
            {contractsReady === false && (
              <div className="rounded-[var(--radius-lg)] border border-[var(--border-amber)] bg-[var(--amber-dim)] p-4 text-sm text-[var(--amber)]">
                Contract addresses are not fully configured. Deploy the Kite contracts, update `.env.local`, and restart the web server before signing on-chain transactions.
                {missing.length > 0 && (
                  <p className="mt-2 font-mono text-xs text-[var(--text-muted)]">Missing: {missing.join(", ")}</p>
                )}
              </div>
            )}
            {children}
          </section>
          {right && <aside className="space-y-5">{right}</aside>}
        </main>
      </div>
    </div>
  );
}
