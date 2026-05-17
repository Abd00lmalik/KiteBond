import { gunzipSync } from "node:zlib";

const MAX_TARBALL_BYTES = 5 * 1024 * 1024;
const MAX_TEXT_FILE_BYTES = 50 * 1024;
const MAX_FILES_TRACKED = 1200;
const MAX_TEXT_FINDINGS = 8;

const BINARY_EXTENSIONS = new Set([".exe", ".dll", ".so", ".dylib", ".bin", ".node"]);
const ROOT_SCRIPT_EXTENSIONS = [".sh", ".bat", ".cmd", ".ps1"];
const TEXT_EXTENSIONS = [
  ".js",
  ".mjs",
  ".cjs",
  ".ts",
  ".tsx",
  ".json",
  ".md",
  ".txt",
  ".yml",
  ".yaml",
  ".sh"
];
const SUSPICIOUS_FILENAME_PATTERNS = [
  /(^|\/)\.env/i,
  /(^|\/)payload/i,
  /(^|\/)dropper/i,
  /(^|\/)backdoor/i,
  /(^|\/)obfus/i
];
const SUSPICIOUS_TEXT_PATTERNS = [
  /\bcurl\b[^\n]{0,120}\|\s*(?:bash|sh)\b/i,
  /\bwget\b[^\n]{0,120}\|\s*(?:bash|sh)\b/i,
  /\beval\s*\(\s*atob\s*\(/i,
  /\bchild_process\b[^\n]{0,120}\bexec\b/i,
  /\bnew\s+Function\s*\(/i,
  /\bfromCharCode\s*\(/i
];

type TarEntry = {
  name: string;
  size: number;
  typeFlag: string;
  contentOffset: number;
};

export interface TarballInspection {
  fileCount: number;
  fileList: string[];
  hasBinaryFiles: boolean;
  hasObfuscatedJs: boolean;
  hasHiddenFiles: boolean;
  suspiciousExtensions: string[];
  suspiciousFileNames: string[];
  suspiciousTextFindings: string[];
  inspectedTextFiles: number;
  totalSizeKb: number;
  inspectionNote?: string;
}

export async function inspectTarball(packageName: string, version: string): Promise<TarballInspection | null> {
  const tarballUrl = await resolveTarballUrl(packageName, version);
  if (!tarballUrl) return null;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8_000);
  try {
    const response = await fetch(tarballUrl, {
      method: "GET",
      cache: "no-store",
      signal: controller.signal
    });
    if (!response.ok) return null;

    const contentLength = Number(response.headers.get("content-length") ?? "0");
    if (contentLength > MAX_TARBALL_BYTES) {
      return {
        fileCount: 0,
        fileList: [],
        hasBinaryFiles: false,
        hasObfuscatedJs: false,
        hasHiddenFiles: false,
        suspiciousExtensions: [],
        suspiciousFileNames: [],
        suspiciousTextFindings: [],
        inspectedTextFiles: 0,
        totalSizeKb: Math.round(contentLength / 1024),
        inspectionNote: "Tarball exceeds 5MB serverless safety limit. Inventory skipped."
      };
    }

    const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.byteLength > MAX_TARBALL_BYTES) {
      return {
        fileCount: 0,
        fileList: [],
        hasBinaryFiles: false,
        hasObfuscatedJs: false,
        hasHiddenFiles: false,
        suspiciousExtensions: [],
        suspiciousFileNames: [],
        suspiciousTextFindings: [],
        inspectedTextFiles: 0,
        totalSizeKb: Math.round(bytes.byteLength / 1024),
        inspectionNote: "Tarball download exceeded 5MB safety limit. Inventory skipped."
      };
    }

    const tarBuffer = gunzipSync(bytes);
    const entries = parseTarEntries(tarBuffer).slice(0, MAX_FILES_TRACKED);

    const fileList: string[] = [];
    const suspiciousExtensions = new Set<string>();
    const suspiciousFileNames = new Set<string>();
    const suspiciousTextFindings = new Set<string>();
    let hasBinaryFiles = false;
    let hasHiddenFiles = false;
    let hasObfuscatedJs = false;
    let inspectedTextFiles = 0;

    for (const entry of entries) {
      if (entry.typeFlag && entry.typeFlag !== "0" && entry.typeFlag !== "\0") continue;
      const normalized = normalizeTarPath(entry.name);
      if (!normalized) continue;

      fileList.push(normalized);
      const ext = getExtension(normalized);
      const base = normalized.split("/").at(-1)?.toLowerCase() ?? "";
      const isRoot = !normalized.includes("/");

      if (BINARY_EXTENSIONS.has(ext)) hasBinaryFiles = true;
      if ((base === "bundle.js" || base === "min.js") && entry.size > 100 * 1024) hasObfuscatedJs = true;
      if (normalized.split("/").some((segment) => segment.startsWith("."))) hasHiddenFiles = true;
      if (isRoot && ROOT_SCRIPT_EXTENSIONS.includes(ext)) suspiciousExtensions.add(ext);
      if (SUSPICIOUS_FILENAME_PATTERNS.some((pattern) => pattern.test(normalized))) suspiciousFileNames.add(normalized);

      if (TEXT_EXTENSIONS.includes(ext) && entry.size > 0 && entry.size <= MAX_TEXT_FILE_BYTES) {
        inspectedTextFiles += 1;
        const text = tarBuffer.subarray(entry.contentOffset, entry.contentOffset + entry.size).toString("utf8");
        for (const pattern of SUSPICIOUS_TEXT_PATTERNS) {
          if (pattern.test(text)) {
            suspiciousTextFindings.add(`${base}: ${pattern.source}`);
            if (suspiciousTextFindings.size >= MAX_TEXT_FINDINGS) break;
          }
        }
      }
    }

    return {
      fileCount: fileList.length,
      fileList: fileList.slice(0, 200),
      hasBinaryFiles,
      hasObfuscatedJs,
      hasHiddenFiles,
      suspiciousExtensions: Array.from(suspiciousExtensions),
      suspiciousFileNames: Array.from(suspiciousFileNames).slice(0, 8),
      suspiciousTextFindings: Array.from(suspiciousTextFindings).slice(0, MAX_TEXT_FINDINGS),
      inspectedTextFiles,
      totalSizeKb: Math.round(bytes.byteLength / 1024),
      inspectionNote:
        fileList.length >= MAX_FILES_TRACKED
          ? `Inventory truncated at ${MAX_FILES_TRACKED} files for serverless safety.`
          : undefined
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

function parseTarEntries(buffer: Buffer): TarEntry[] {
  const entries: TarEntry[] = [];
  let offset = 0;

  while (offset + 512 <= buffer.length) {
    const header = buffer.subarray(offset, offset + 512);
    if (isAllZero(header)) break;

    const rawName = header.subarray(0, 100).toString("utf8").replace(/\0.*$/, "");
    const rawPrefix = header.subarray(345, 500).toString("utf8").replace(/\0.*$/, "");
    const fullName = rawPrefix ? `${rawPrefix}/${rawName}` : rawName;
    const sizeOctal = header.subarray(124, 136).toString("utf8").replace(/\0.*$/, "").trim();
    const parsedSize = parseInt(sizeOctal || "0", 8);
    const size = Number.isFinite(parsedSize) && parsedSize > 0 ? parsedSize : 0;
    const typeFlag = header.subarray(156, 157).toString("utf8") || "0";
    const contentOffset = offset + 512;

    entries.push({ name: fullName, size, typeFlag, contentOffset });
    offset = contentOffset + Math.ceil(size / 512) * 512;
  }

  return entries;
}

function normalizeTarPath(path: string): string {
  const clean = path.replace(/^package\//, "").replace(/^\/+/, "").trim();
  if (!clean || clean === "." || clean === "..") return "";
  return clean.replace(/\\/g, "/");
}

function getExtension(path: string): string {
  const idx = path.lastIndexOf(".");
  if (idx < 0) return "";
  return path.slice(idx).toLowerCase();
}

function isAllZero(buffer: Buffer): boolean {
  for (let i = 0; i < buffer.length; i += 1) {
    if (buffer[i] !== 0) return false;
  }
  return true;
}

async function resolveTarballUrl(packageName: string, version: string): Promise<string | null> {
  const encoded = encodeURIComponent(packageName.trim().toLowerCase());
  const regRes = await fetch(`https://registry.npmjs.org/${encoded}`, {
    headers: { Accept: "application/json" },
    cache: "no-store",
    signal: AbortSignal.timeout(5_000)
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
