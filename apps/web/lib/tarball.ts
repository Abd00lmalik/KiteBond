const MAX_TARBALL_BYTES = 5 * 1024 * 1024;

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

/**
 * Vercel-safe tarball inspection:
 * - Does not import tar/zlib.
 * - Does not extract files.
 * - Reads only registry tarball URL + content-length metadata.
 * - Returns null when metadata is unavailable (caller should fail-soft).
 */
export async function inspectTarball(packageName: string, version: string): Promise<TarballInspection | null> {
  const tarballUrl = await resolveTarballUrl(packageName, version);
  if (!tarballUrl) return null;

  try {
    const headRes = await fetch(tarballUrl, {
      method: "HEAD",
      cache: "no-store",
      signal: AbortSignal.timeout(10_000)
    });
    if (!headRes.ok) return null;

    const contentLength = Number(headRes.headers.get("content-length") || "0");
    if (contentLength <= 0) {
      return {
        fileCount: 0,
        fileList: [],
        hasBinaryFiles: false,
        hasObfuscatedJs: false,
        hasHiddenFiles: false,
        suspiciousExtensions: [],
        totalSizeKb: 0,
        inspectionNote: "Tarball metadata available, but content length was not provided by registry host."
      };
    }

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

    return {
      fileCount: 0,
      fileList: [],
      hasBinaryFiles: false,
      hasObfuscatedJs: false,
      hasHiddenFiles: false,
      suspiciousExtensions: [],
      totalSizeKb: Math.round(contentLength / 1024),
      inspectionNote: "Tarball extraction is disabled in serverless packaging-safe mode."
    };
  } catch {
    return null;
  }
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
