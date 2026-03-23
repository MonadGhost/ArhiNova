import { definePluginEntry } from "openclaw/plugin-sdk/core";
import { createSearxngWebSearchProvider } from "./src/searxng-search-provider.js";

export default definePluginEntry({
  id: "searxng",
  name: "SearXNG Plugin",
  description: "Self-hosted SearXNG meta-search engine plugin (no API key required)",
  register(api) {
    api.registerWebSearchProvider(createSearxngWebSearchProvider());
  },
});
