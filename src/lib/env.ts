type EnvRecord = Record<string, string | undefined>;

function getImportMetaEnv(): EnvRecord | undefined {
  if (typeof import.meta === "undefined") return undefined;
  const env = (import.meta as ImportMeta & { env?: EnvRecord }).env;
  return env;
}

export function readEnvValue(...names: string[]): string | undefined {
  for (const name of names) {
    const processValue = typeof process !== "undefined" ? process.env?.[name] : undefined;
    if (typeof processValue === "string" && processValue.trim()) return processValue;

    const importMetaValue = getImportMetaEnv()?.[name];
    if (typeof importMetaValue === "string" && importMetaValue.trim()) return importMetaValue;
  }

  return undefined;
}
