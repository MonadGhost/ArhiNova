import type { OpenClawConfig } from "openclaw/plugin-sdk/config-runtime";
import {
  DEFAULT_CACHE_TTL_MINUTES,
  normalizeCacheKey,
  readCache,
  resolveCacheTtlMs,
  writeCache,
} from "openclaw/plugin-sdk/provider-web-search";
import { wrapWebContent } from "openclaw/plugin-sdk/security-runtime";
import { resolveSearxngBaseUrl, resolveSearxngTimeoutSeconds } from "./config.js";

const SEARCH_CACHE = new Map<
  string,
  { value: Record<string, unknown>; expiresAt: number; insertedAt: number }
>();
const DEFAULT_SEARCH_COUNT = 5;

export type SearxngSearchParams = {
  cfg?: OpenClawConfig;
  query: string;
  maxResults?: number;
  categories?: string;
  language?: string;
  timeRange?: string;
  timeoutSeconds?: number;
};

type SearxngResult = {
  title?: string;
  url?: string;
  content?: string;
  engine?: string;
  score?: number;
  publishedDate?: string;
  category?: string;
};

type SearxngResponse = {
  results?: SearxngResult[];
  suggestions?: string[];
  query?: string;
  number_of_results?: number;
};

function resolveEndpoint(baseUrl: string, pathname: string): string {
  const trimmed = baseUrl.trim().replace(/\/$/, "");
  if (!trimmed) {
    return `http://searxng:8080${pathname}`;
  }
  return `${trimmed}${pathname}`;
}

export async function runSearxngSearch(
  params: SearxngSearchParams,
): Promise<Record<string, unknown>> {
  const baseUrl = resolveSearxngBaseUrl(params.cfg);
  const count =
    typeof params.maxResults === "number" && Number.isFinite(params.maxResults)
      ? Math.max(1, Math.min(50, Math.floor(params.maxResults)))
      : DEFAULT_SEARCH_COUNT;
  const timeoutSeconds = resolveSearxngTimeoutSeconds(params.timeoutSeconds);

  const cacheKey = normalizeCacheKey(
    JSON.stringify({
      type: "searxng-search",
      q: params.query,
      count,
      baseUrl,
      categories: params.categories,
      language: params.language,
      timeRange: params.timeRange,
    }),
  );
  const cached = readCache(SEARCH_CACHE, cacheKey);
  if (cached) {
    return { ...cached.value, cached: true };
  }

  const searchUrl = new URL(resolveEndpoint(baseUrl, "/search"));
  searchUrl.searchParams.set("q", params.query);
  searchUrl.searchParams.set("format", "json");
  if (params.categories) {
    searchUrl.searchParams.set("categories", params.categories);
  } else {
    searchUrl.searchParams.set("categories", "general");
  }
  if (params.language) {
    searchUrl.searchParams.set("language", params.language);
  }
  if (params.timeRange) {
    searchUrl.searchParams.set("time_range", params.timeRange);
  }

  const start = Date.now();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutSeconds * 1000);

  let payload: SearxngResponse;
  try {
    const response = await fetch(searchUrl.toString(), {
      method: "GET",
      headers: { Accept: "application/json" },
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new Error(`SearXNG returned HTTP ${response.status}: ${response.statusText}`);
    }
    payload = (await response.json()) as SearxngResponse;
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error(`SearXNG search timed out after ${timeoutSeconds}s`);
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }

  const rawResults = Array.isArray(payload.results) ? payload.results : [];
  const results = rawResults.slice(0, count).map((r) => ({
    title: typeof r.title === "string" ? wrapWebContent(r.title, "web_search") : "",
    url: typeof r.url === "string" ? r.url : "",
    snippet: typeof r.content === "string" ? wrapWebContent(r.content, "web_search") : "",
    ...(typeof r.score === "number" ? { score: r.score } : {}),
    ...(typeof r.engine === "string" ? { engine: r.engine } : {}),
    ...(typeof r.publishedDate === "string" ? { published: r.publishedDate } : {}),
  }));

  const result: Record<string, unknown> = {
    query: params.query,
    provider: "searxng",
    count: results.length,
    tookMs: Date.now() - start,
    externalContent: {
      untrusted: true,
      source: "web_search",
      provider: "searxng",
      wrapped: true,
    },
    results,
  };

  if (Array.isArray(payload.suggestions) && payload.suggestions.length > 0) {
    result.suggestions = payload.suggestions.slice(0, 5);
  }

  writeCache(
    SEARCH_CACHE,
    cacheKey,
    result,
    resolveCacheTtlMs(undefined, DEFAULT_CACHE_TTL_MINUTES),
  );
  return result;
}
