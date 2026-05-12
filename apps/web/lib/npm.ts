export interface NpmPackageMeta {
  name: string;
  version: string;
  description: string;
  license: string | null;
  repository: string | null;
  homepage: string | null;
  author: string | null;
  maintainers: { name: string; email?: string }[];
  publishedAt: string | null;
  latestVersion: string;
  versionCount: number;
  dependencyCount: number;
  devDependencyCount: number;
  hasInstallScript: boolean;
  installScriptContent: string | null;
  keywords: string[];
  bugs: string | null;
  engines: Record<string, string> | null;
  deprecated: boolean;
  deprecationMessage: string | null;
  unpublished: boolean;
}

type NpmDocument = {
  name?: string;
  description?: string;
  "dist-tags"?: Record<string, string>;
  versions?: Record<string, NpmVersionDocument>;
  time?: Record<string, string> & { unpublished?: unknown };
  maintainers?: { name: string; email?: string }[];
};

type NpmVersionDocument = {
  description?: string;
  license?: string;
  repository?: string | { url?: string };
  homepage?: string;
  author?: string | { name?: string };
  scripts?: Record<string, string>;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  keywords?: string[];
  bugs?: string | { url?: string };
  engines?: Record<string, string>;
  deprecated?: string;
};

export async function fetchNpmMeta(name: string, version = "latest"): Promise<NpmPackageMeta> {
  const normalized = name.trim();
  if (!normalized || normalized.length > 214) {
    throw new Error("Package name is invalid.");
  }

  const encoded = encodeURIComponent(normalized);
  const res = await fetch(`https://registry.npmjs.org/${encoded}`, {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(10_000)
  });

  if (res.status === 404) throw new Error(`Package "${normalized}" not found on npm registry.`);
  if (!res.ok) throw new Error(`npm registry error: ${res.status}`);

  const doc = (await res.json()) as NpmDocument;
  const versions = doc.versions ?? {};
  const resolvedVersion =
    version === "latest"
      ? doc["dist-tags"]?.latest ?? Object.keys(versions).pop() ?? "unknown"
      : version;

  const versionDoc = versions[resolvedVersion];
  if (!versionDoc) {
    throw new Error(`Version "${resolvedVersion}" not found for package "${normalized}".`);
  }

  const scripts = versionDoc.scripts ?? {};
  const installScripts = [scripts.preinstall, scripts.install, scripts.postinstall].filter(Boolean);
  const deps = versionDoc.dependencies ?? {};
  const devDeps = versionDoc.devDependencies ?? {};
  const repo = versionDoc.repository;
  const bugs = versionDoc.bugs;

  const repository =
    typeof repo === "string"
      ? repo
      : repo?.url
        ? repo.url.replace(/^git\+/, "").replace(/\.git$/, "")
        : null;

  return {
    name: doc.name ?? normalized,
    version: resolvedVersion,
    description: versionDoc.description ?? doc.description ?? "",
    license: versionDoc.license ?? null,
    repository,
    homepage: versionDoc.homepage ?? null,
    author: typeof versionDoc.author === "string" ? versionDoc.author : versionDoc.author?.name ?? null,
    maintainers: doc.maintainers ?? [],
    publishedAt: doc.time?.[resolvedVersion] ?? null,
    latestVersion: doc["dist-tags"]?.latest ?? resolvedVersion,
    versionCount: Object.keys(versions).length,
    dependencyCount: Object.keys(deps).length,
    devDependencyCount: Object.keys(devDeps).length,
    hasInstallScript: installScripts.length > 0,
    installScriptContent: installScripts.length > 0 ? installScripts.join(" ; ") : null,
    keywords: versionDoc.keywords ?? [],
    bugs: typeof bugs === "string" ? bugs : bugs?.url ?? null,
    engines: versionDoc.engines ?? null,
    deprecated: Boolean(versionDoc.deprecated),
    deprecationMessage: versionDoc.deprecated ?? null,
    unpublished: Boolean(doc.time?.unpublished)
  };
}
