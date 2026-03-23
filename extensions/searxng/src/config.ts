import type { OpenClawConfig } from "openclaw/plugin-sdk/config-runtime";
import { normalizeSecretInput } from "openclaw/plugin-sdk/provider-auth";

export const DEFAULT_SEARXNG_BASE_URL = "http://searxng:8080";
export const DEFAULT_SEARXNG_TIMEOUT_SECONDS = 15;

type PluginEntryConfig = {
  webSearch?: {
    baseUrl?: string;
  };
};

export function resolveSearxngSearchConfig(
  cfg?: OpenClawConfig,
): PluginEntryConfig["webSearch"] | undefined {
  const pluginConfig = cfg?.plugins?.entries?.searxng?.config as PluginEntryConfig;
  const pluginWebSearch = pluginConfig?.webSearch;
  if (pluginWebSearch && typeof pluginWebSearch === "object" && !Array.isArray(pluginWebSearch)) {
    return pluginWebSearch;
  }
  return undefined;
}

export function resolveSearxngBaseUrl(cfg?: OpenClawConfig): string {
  const search = resolveSearxngSearchConfig(cfg);
  const configured =
    (typeof search?.baseUrl === "string" ? search.baseUrl.trim() : "") ||
    normalizeSecretInput(process.env.SEARXNG_URL) ||
    "";
  return configured || DEFAULT_SEARXNG_BASE_URL;
}

export function resolveSearxngTimeoutSeconds(override?: number): number {
  if (typeof override === "number" && Number.isFinite(override) && override > 0) {
    return Math.floor(override);
  }
  return DEFAULT_SEARXNG_TIMEOUT_SECONDS;
}
