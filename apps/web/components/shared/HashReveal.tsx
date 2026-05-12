"use client";

import { Check, Copy } from "lucide-react";
import { motion } from "framer-motion";
import { useState } from "react";
import { cn, truncateHash } from "@/lib/utils";

type HashRevealProps = {
  label: string;
  hash?: string | null;
  compact?: boolean;
};

export function HashReveal({ label, hash, compact = false }: HashRevealProps) {
  const [copied, setCopied] = useState(false);
  const text = hash || "Pending";
  const chars = compact ? truncateHash(text, 10, 8).split("") : text.split("");

  async function copyHash() {
    if (!hash) return;
    await navigator.clipboard.writeText(hash);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1200);
  }

  return (
    <div className="rounded-[var(--radius-md)] border border-[var(--border-default)] bg-[var(--bg-glass)] p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <p className="label">{label}</p>
        <button
          type="button"
          onClick={copyHash}
          disabled={!hash}
          className="focus-ring inline-flex h-8 w-8 items-center justify-center rounded-[var(--radius-md)] border border-[var(--border-default)] text-[var(--text-secondary)] transition hover:border-[var(--border-orange)] hover:text-[var(--text-primary)] disabled:opacity-40"
          aria-label={`Copy ${label}`}
          title={`Copy ${label}`}
        >
          {copied ? <Check className="h-4 w-4 text-proof-green" /> : <Copy className="h-4 w-4" />}
        </button>
      </div>
      <motion.p
        className={cn(
          "hash break-all text-xs leading-6 text-[var(--text-primary)]",
          !hash && "text-[var(--text-muted)]"
        )}
        initial="hidden"
        animate="visible"
        variants={{ visible: { transition: { staggerChildren: 0.012 } } }}
      >
        {chars.map((char, index) => (
          <motion.span
            key={`${char}-${index}`}
            variants={{ hidden: { opacity: 0 }, visible: { opacity: 1 } }}
          >
            {char}
          </motion.span>
        ))}
      </motion.p>
    </div>
  );
}
