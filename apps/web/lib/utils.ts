import { clsx, type ClassValue } from "clsx";

export function cn(...inputs: ClassValue[]) {
  return clsx(inputs);
}

export function truncateHash(value?: string | null, head = 6, tail = 4) {
  if (!value) return "Pending";
  if (value.length <= head + tail + 3) return value;
  return `${value.slice(0, head)}...${value.slice(-tail)}`;
}

export function formatUsdt(value: string | number) {
  const numeric = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numeric)) return String(value);
  return `${numeric.toLocaleString(undefined, { maximumFractionDigits: 4 })} USDT`;
}

export function explorerTx(hash?: string | null) {
  return hash ? `https://testnet.kitescan.ai/tx/${hash}` : "";
}

export function nowLogTime(ms: number) {
  const seconds = Math.floor(ms / 1000);
  const millis = String(ms % 1000).padStart(3, "0");
  return `00:${String(seconds).padStart(2, "0")}.${millis}`;
}
