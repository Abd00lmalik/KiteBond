export interface DependencyRisk {
  totalDeps: number;
  directDeps: string[];
  suspiciousDeps: string[];
  deepCount: number | null;
}

const SUSPICIOUS_DEP_PATTERNS = [
  /^[a-z]{1,3}$/,
  /postinstall-/,
  /node-pre-gyp-fix/,
  /install-pkg$/
];

export async function analyzeDependencies(dependencies: Record<string, string>): Promise<DependencyRisk> {
  const directDeps = Object.keys(dependencies);
  const suspiciousDeps = directDeps.filter((dep) => SUSPICIOUS_DEP_PATTERNS.some((pattern) => pattern.test(dep)));

  return {
    totalDeps: directDeps.length,
    directDeps,
    suspiciousDeps,
    deepCount: null
  };
}
