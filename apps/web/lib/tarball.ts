import { Readable } from "stream";
import { pipeline } from "stream/promises";
import { createGunzip } from "zlib";
import { Parser } from "tar";

const MAX_TARBALL_BYTES = 5 * 1024 * 1024;
const OBFUSCATED_SIZE_THRESHOLD = 100 * 1024;
const BINARY_EXTENSIONS = new Set([".exe", ".dll", ".so", ".dylib"]);
const ROOT_SCRIPT_EXTENSIONS = new Set([".sh", ".bat", ".cmd", ".ps1"]);

export interface TarballInspection {
  fileCount: number;
  fileList: string[];
  hasBinaryFiles: boolean;
  hasObfuscatedJs: boolean;
  hasHiddenFiles: boolean;
  suspiciousExtensions: string[];
  totalSizeKb: number;
  inspectionNote?: string;
}

export async function inspectTarball(packageName: string, version: string): Promise<TarballInspection | null> {
  const tarballUrl = await resolveTarballUrl(packageName, version);
  if (!tarballUrl) return null;

  const response = await fetch(tarballUrl, {
    cache: "no-store",
    signal: AbortSignal.timeout(20_000)
  });

  if (!response.ok || !response.body) {
    return null;
  }

  const contentLength = Number(response.headers.get("content-length") || "0");
  if (contentLength > MAX_TARBALL_BYTES) {
    return {
      fileCount: 0,
      fileList: [],
      hasBinaryFiles: false,
      hasObfuscatedJs: false,
      hasHiddenFiles: false,
      suspiciousExtensions: [],
      totalSizeKb: Math.round(contentLength / 1024),
      inspectionNote: "Tarball exceeds 5MB limit for serverless-safe inspection."
    };
  }

  const bytes = await readWithLimit(response, MAX_TARBALL_BYTES);
  return parseTarball(bytes);
}

async function resolveTarballUrl(packageName: string, version: string): Promise<string | null> {
  const encoded = encodeURIComponent(packageName.trim().toLowerCase());
  const regRes = await fetch(`https://registry.npmjs.org/${encoded}`, {
    headers: { Accept: "application/json" },
    cache: "no-store",
    signal: AbortSignal.timeout(10_000)
  });

  if (!regRes.ok) return null;
  const reg = (await regRes.json()) as {
    "dist-tags"?: Record<string, string>;
    versions?: Record<string, { dist?: { tarball?: string } }>;
  };
  const resolvedVersion = version === "latest" ? reg["dist-tags"]?.latest : version;
  if (!resolvedVersion) return null;
  return reg.versions?.[resolvedVersion]?.dist?.tarball ?? null;
}

async function readWithLimit(response: Response, limit: number): Promise<Buffer> {
  const reader = response.body?.getReader();
  if (!reader) throw new Error("Tarball stream unavailable");
  const chunks: Uint8Array[] = [];
  let total = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;
    total += value.byteLength;
    if (total > limit) {
      throw new Error("Tarball exceeds size limit");
    }
    chunks.push(value);
  }

  return Buffer.concat(chunks.map((chunk) => Buffer.from(chunk)));
}

async function parseTarball(bytes: Buffer): Promise<TarballInspection> {
  const fileList: string[] = [];
  const suspiciousExtensions = new Set<string>();
  let hasBinaryFiles = false;
  let hasHiddenFiles = false;
  let hasObfuscatedJs = false;
  let totalSizeBytes = 0;

  const parser = new Parser({
    onentry: (entry: { path: string; size?: number; type: string; resume: () => void }) => {
      const path = sanitizePath(entry.path);
      const size = Number(entry.size || 0);
      totalSizeBytes += size;
      if (entry.type === "File") {
        fileList.push(path);
        const ext = extension(path);
        if (BINARY_EXTENSIONS.has(ext)) hasBinaryFiles = true;
        if (isHidden(path)) hasHiddenFiles = true;
        if ((path.endsWith("min.js") || path.endsWith("bundle.js")) && size > OBFUSCATED_SIZE_THRESHOLD) {
          hasObfuscatedJs = true;
        }
        if (isRootScript(path, ext)) suspiciousExtensions.add(ext);
      }
      entry.resume();
    }
  });

  await pipeline(Readable.from(bytes), createGunzip(), parser);

  return {
    fileCount: fileList.length,
    fileList,
    hasBinaryFiles,
    hasObfuscatedJs,
    hasHiddenFiles,
    suspiciousExtensions: Array.from(suspiciousExtensions),
    totalSizeKb: Math.round(totalSizeBytes / 1024)
  };
}

function sanitizePath(path: string): string {
  return path.replace(/^package\//, "").replace(/\\/g, "/");
}

function extension(path: string): string {
  const idx = path.lastIndexOf(".");
  return idx >= 0 ? path.slice(idx).toLowerCase() : "";
}

function isHidden(path: string): boolean {
  return path.split("/").some((part) => part.startsWith("."));
}

function isRootScript(path: string, ext: string): boolean {
  if (!ROOT_SCRIPT_EXTENSIONS.has(ext)) return false;
  const parts = path.split("/");
  return parts.length <= 2;
}
