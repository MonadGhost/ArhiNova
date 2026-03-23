import { Type } from "@sinclair/typebox";
import {
  enablePluginInConfig,
  resolveProviderWebSearchPluginConfig,
  setProviderWebSearchPluginConfigValue,
  type WebSearchProviderPlugin,
} from "openclaw/plugin-sdk/provider-web-search";
import { runSearxngSearch } from "./searxng-client.js";

const SearxngSearchSchema = Type.Object(
  {
    query: Type.String({ description: "Search query string." }),
    count: Type.Optional(
      Type.Number({
        description: "Number of results to return (1-50).",
        minimum: 1,
        maximum: 50,
      }),
    ),
  },
  { additionalProperties: false },
);

export function createSearxngWebSearchProvider(): WebSearchProviderPlugin {
  return {
    id: "searxng",
    label: "SearXNG (self-hosted)",
    hint: "Privacy-preserving meta-search · Google/Bing/DuckDuckGo/Brave · no API key",
    envVars: ["SEARXNG_URL"],
    placeholder: "http://searxng:8080",
    signupUrl: "https://docs.searxng.org/",
    docsUrl: "https://docs.searxng.org/",
    autoDetectOrder: 5,
    credentialPath: "plugins.entries.searxng.config.webSearch.baseUrl",
    inactiveSecretPaths: ["plugins.entries.searxng.config.webSearch.baseUrl"],
    getCredentialValue: (searchConfig) => {
      if (!searchConfig || typeof searchConfig !== "object") return undefined;
      const rec = searchConfig as Record<string, unknown>;
      return rec.baseUrl ?? rec.searxngUrl ?? undefined;
    },
    setCredentialValue: (searchConfigTarget, value) => {
      (searchConfigTarget as Record<string, unknown>).baseUrl = value;
    },
    getConfiguredCredentialValue: (config) =>
      resolveProviderWebSearchPluginConfig(config, "searxng")?.baseUrl ??
      process.env.SEARXNG_URL ??
      undefined,
    setConfiguredCredentialValue: (configTarget, value) => {
      setProviderWebSearchPluginConfigValue(configTarget, "searxng", "baseUrl", value);
    },
    applySelectionConfig: (config) => enablePluginInConfig(config, "searxng").config,
    createTool: (ctx) => ({
      description:
        "Search the web using a self-hosted SearXNG meta-search engine. Aggregates results from Google, Bing, DuckDuckGo, Brave, Startpage, Wikipedia, and more. No API key required.",
      parameters: SearxngSearchSchema,
      execute: async (args) =>
        await runSearxngSearch({
          cfg: ctx.config,
          query: typeof args.query === "string" ? args.query : "",
          maxResults: typeof args.count === "number" ? args.count : undefined,
        }),
    }),
  };
}
