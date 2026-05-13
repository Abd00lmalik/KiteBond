import type { ReactNode } from "react";
import { Sidebar } from "./Sidebar";
import { TopBar } from "./TopBar";

export function AppShell({ children, right }: { children: ReactNode; right?: ReactNode }) {
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
            {children}
          </section>
          {right && <aside className="space-y-5">{right}</aside>}
        </main>
      </div>
    </div>
  );
}
