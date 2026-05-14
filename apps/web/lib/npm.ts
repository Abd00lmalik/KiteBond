export interface NpmPackageMeta {
  name: string;
  version: string;
  description: string;
  author: string;
  license: string;
  repository: string | null;
  homepage: string | null;
  weeklyDownloads: number;
  totalVersions: number;
  publishedAt: string;
  firstPublishedAt: string;
  maintainerCount: number;
  hasTypes: boolean;
  hasInstallScript: boolean;
  dependencyCount: number;
  dependencies: Record<string, string>;
  devDependencyCount: number;
  bundleSize: string | null;
  latestVersion: string;
  versionCount: number;
  installScriptContent: string | null;
  lifecycleScriptValues: string[];
  maintainers: { name: string; email?: string }[];
  keywords: string[];
  bugs: string | null;
  engines: Record<string, string> | null;
  deprecated: boolean;
  deprecationMessage: string | null;
  unpublished: boolean;
  scriptValues: string[];
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
  types?: string;
  typings?: string;
};

export async function fetchNpmMeta(packageName: string, version = "latest"): Promise<NpmPackageMeta> {
  const clean = packageName.trim().toLowerCase();
  if (!clean || clean.length > 214) throw new Error("Invalid package name.");

  const encoded = encodeURIComponent(clean);
  const regRes = await fetch(`https://registry.npmjs.org/${encoded}`, {
    headers: { Accept: "application/json" },
    cache: "no-store",
    signal: AbortSignal.timeout(10_000)
  });

  if (regRes.status === 404) throw new Error(`Package "${clean}" not found on npm.`);
  if (!regRes.ok) throw new Error(`npm registry error: ${regRes.status}`);

  const reg = (await regRes.json()) as NpmDocument;

  let weeklyDownloads = 0;
  try {
    const dlRes = await fetch(`https://api.npmjs.org/downloads/point/last-week/${encoded}`, {
      cache: "no-store",
      signal: AbortSignal.timeout(8_000)
    });
    if (dlRes.ok) {
      const downloads = (await dlRes.json()) as { downloads?: number };
      weeklyDownloads = downloads.downloads ?? 0;
    }
  } catch {
    weeklyDownloads = 0;
  }

  const versions = reg.versions ?? {};
  const allVersions = Object.keys(versions);
  const latest = reg["dist-tags"]?.latest ?? allVersions.at(-1) ?? "unknown";
  const resolvedVersion = version === "latest" ? latest : version;
  const latestMeta = versions[resolvedVersion];
  if (!latestMeta) {
    throw new Error(`Version "${resolvedVersion}" not found for package "${clean}".`);
  }

  const scripts = latestMeta.scripts ?? {};
  const scriptValues = Object.values(scripts).filter((value): value is string => typeof value === "string");
  const installScripts = [scripts.preinstall, scripts.install, scripts.postinstall].filter(Boolean);
  const lifecycleScriptValues = installScripts.filter((value): value is string => typeof value === "string");
  const maintainers = reg.maintainers ?? [];
  const author =
    (typeof latestMeta.author === "string" ? latestMeta.author : latestMeta.author?.name) ||
    maintainers.map((maintainer) => maintainer.name).filter(Boolean).join(", ") ||
    "unknown";

  const repoUrl =
    typeof latestMeta.repository === "string"
      ? latestMeta.repository
      : latestMeta.repository?.url ?? null;
  const repository = repoUrl ? repoUrl.replace(/^git\+/, "").replace(/\.git$/, "") : null;
  const bugs = latestMeta.bugs;
  const deps = latestMeta.dependencies ?? {};
  const devDeps = latestMeta.devDependencies ?? {};
  const timeMap = reg.time ?? {};

  return {
    name: reg.name ?? clean,
    version: resolvedVersion,
    description: latestMeta.description ?? reg.description ?? "",
    author,
    license: latestMeta.license ?? "none",
    repository,
    homepage: latestMeta.homepage ?? null,
    weeklyDownloads,
    totalVersions: allVersions.length,
    publishedAt: timeMap[resolvedVersion] ?? "",
    firstPublishedAt: timeMap.created ?? "",
    maintainerCount: maintainers.length,
    hasTypes: Boolean(latestMeta.types || latestMeta.typings || latestMeta.devDependencies?.typescript),
    hasInstallScript: installScripts.length > 0,
    dependencyCount: Object.keys(deps).length,
    dependencies: deps,
    devDependencyCount: Object.keys(devDeps).length,
    bundleSize: null,
    latestVersion: latest,
    versionCount: allVersions.length,
    installScriptContent: installScripts.length > 0 ? installScripts.join(" ; ") : null,
    lifecycleScriptValues,
    maintainers,
    keywords: latestMeta.keywords ?? [],
    bugs: typeof bugs === "string" ? bugs : bugs?.url ?? null,
    engines: latestMeta.engines ?? null,
    deprecated: Boolean(latestMeta.deprecated),
    deprecationMessage: latestMeta.deprecated ?? null,
    unpublished: Boolean(timeMap.unpublished),
    scriptValues
  };
}
