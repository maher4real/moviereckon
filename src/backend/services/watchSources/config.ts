import "server-only";
import { publicLink } from "./parser";

export interface ImporterConfig {
  baseUrl: string;
  provider?: "hdhub" | "4khdhub";
  batchSize: number;
  concurrency: number;
  discoveryPages: number;
  refreshHours: number;
  budgetMs: number;
}

function integer(name: string, fallback: number, min: number, max: number): number {
  const value = Number(process.env[name] || fallback);
  if (!Number.isInteger(value) || value < min || value > max) throw new Error(`Invalid ${name}`);
  return value;
}

export function getImporterConfig(): ImporterConfig {
  const value = process.env.HDHUB_BASE_URL || "https://new8.hdhub4u.cl";
  const base = publicLink(value, value);
  if (!base || base.protocol !== "https:" || base.search || base.hash || base.pathname !== "/") {
    throw new Error("HDHUB_BASE_URL must be a public HTTPS origin");
  }
  return {
    baseUrl: base.origin,
    batchSize: integer("WATCH_IMPORT_BATCH_SIZE", 20, 1, 100),
    concurrency: integer("WATCH_IMPORT_CONCURRENCY", 3, 1, 5),
    discoveryPages: integer("WATCH_IMPORT_DISCOVERY_PAGES", 2, 1, 10),
    refreshHours: integer("WATCH_IMPORT_REFRESH_HOURS", 24, 1, 168),
    budgetMs: 210_000,
  };
}

export function sourcePageUrl(value: string, config: ImporterConfig): string {
  const url = publicLink(value, config.baseUrl);
  if (!url || url.origin !== config.baseUrl || url.search || url.hash ||
      !/^\/[^/]+\/$/.test(url.pathname)) throw new Error("Source page must be on HDHUB_BASE_URL with a single post path");
  return url.href;
}

/** Independent catalogs use separate queue identities and leases. */
export function getCatalogConfigs(config = getImporterConfig()): ImporterConfig[] {
  return process.env.WATCH_4KHDHUB_ENABLED === "false" ? [config] :
    [config, { ...config, provider: "4khdhub", baseUrl: "https://4khdhub.one" }];
}
