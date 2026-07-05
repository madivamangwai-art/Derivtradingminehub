type EnvRecord = Record<string, string | undefined>;

function getImportMetaEnv(): EnvRecord | undefined {
  if (typeof import.meta === "undefined") return undefined;
  const env = (import.meta as ImportMeta & { env?: EnvRecord }).env;
  return env;
}

export function readEnvValue(...names: string[]): string | undefined {
  for (const name of names) {
    const processValue = typeof process !== "undefined" ? process.env?.[name] : undefined;
    const normalizedProcessValue = normalizeEnvValue(processValue);
    if (normalizedProcessValue) return normalizedProcessValue;

    const importMetaValue = getImportMetaEnv()?.[name];
    const normalizedImportMetaValue = normalizeEnvValue(importMetaValue);
    if (normalizedImportMetaValue) return normalizedImportMetaValue;
  }

  return undefined;
}

function normalizeEnvValue(value: string | undefined): string | undefined {
  if (typeof value !== "string") return undefined;

  const trimmed = value.trim();
  if (!trimmed) return undefined;

  const quote = trimmed[0];
  if ((quote === '"' || quote === "'") && trimmed.endsWith(quote)) {
    return trimmed.slice(1, -1).trim() || undefined;
  }

  return trimmed;
}
