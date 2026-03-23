import type {
  ModelDefinitionConfig,
  ModelProviderConfig,
} from "openclaw/plugin-sdk/provider-models";

const OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1";
const OPENROUTER_MODELS_URL = "https://openrouter.ai/api/v1/models";
const OPENROUTER_DEFAULT_MODEL_ID = "auto";
const OPENROUTER_DEFAULT_CONTEXT_WINDOW = 200000;
const OPENROUTER_DEFAULT_MAX_TOKENS = 8192;
const OPENROUTER_DEFAULT_COST = {
  input: 0,
  output: 0,
  cacheRead: 0,
  cacheWrite: 0,
};
const FETCH_TIMEOUT_MS = 15_000;
/**
 * Cap the dynamic catalog to avoid stack overflow in model-pricing bootstrap.
 * OpenRouter returns 2000+ models; the pricing module processes them recursively
 * and blows the call stack. 500 is plenty for the UI model picker.
 */
const MAX_DYNAMIC_MODELS = 500;

interface OpenRouterApiModel {
  id: string;
  name?: string;
  modality?: string;
  architecture?: {
    modality?: string;
  };
  supported_parameters?: string[];
  context_length?: number;
  max_completion_tokens?: number;
  max_output_tokens?: number;
  top_provider?: {
    max_completion_tokens?: number;
  };
  pricing?: {
    prompt?: string;
    completion?: string;
  };
}

function toModelDefinition(model: OpenRouterApiModel): ModelDefinitionConfig {
  const input: Array<"text" | "image"> = ["text"];
  const modality = model.architecture?.modality ?? model.modality ?? "";
  if ((modality.split("->")[0] ?? "").includes("image")) {
    input.push("image");
  }
  const prompt = parseFloat(model.pricing?.prompt || "0");
  const completion = parseFloat(model.pricing?.completion || "0");
  return {
    id: model.id,
    name: model.name || model.id,
    reasoning: model.supported_parameters?.includes("reasoning") ?? false,
    input,
    cost: {
      input: prompt * 1_000_000,
      output: completion * 1_000_000,
      cacheRead: 0,
      cacheWrite: 0,
    },
    contextWindow: model.context_length || 128_000,
    maxTokens:
      model.top_provider?.max_completion_tokens ??
      model.max_completion_tokens ??
      model.max_output_tokens ??
      OPENROUTER_DEFAULT_MAX_TOKENS,
  };
}

const STATIC_MODELS: ModelDefinitionConfig[] = [
  {
    id: OPENROUTER_DEFAULT_MODEL_ID,
    name: "OpenRouter Auto",
    reasoning: false,
    input: ["text", "image"],
    cost: OPENROUTER_DEFAULT_COST,
    contextWindow: OPENROUTER_DEFAULT_CONTEXT_WINDOW,
    maxTokens: OPENROUTER_DEFAULT_MAX_TOKENS,
  },
  {
    id: "openrouter/hunter-alpha",
    name: "Hunter Alpha",
    reasoning: true,
    input: ["text"],
    cost: OPENROUTER_DEFAULT_COST,
    contextWindow: 1048576,
    maxTokens: 65536,
  },
  {
    id: "openrouter/healer-alpha",
    name: "Healer Alpha",
    reasoning: true,
    input: ["text", "image"],
    cost: OPENROUTER_DEFAULT_COST,
    contextWindow: 262144,
    maxTokens: 65536,
  },
];

/**
 * Fetch all available models from the OpenRouter API.
 * Falls back to the static list on failure.
 */
export async function fetchOpenRouterModels(): Promise<ModelDefinitionConfig[]> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    try {
      const response = await fetch(OPENROUTER_MODELS_URL, {
        signal: controller.signal,
      });
      if (!response.ok) {
        return STATIC_MODELS;
      }
      const data = (await response.json()) as { data?: OpenRouterApiModel[] };
      const apiModels = data.data ?? [];
      if (apiModels.length === 0) {
        return STATIC_MODELS;
      }
      const seen = new Set(STATIC_MODELS.map((m) => m.id));
      const models = [...STATIC_MODELS];
      for (const apiModel of apiModels) {
        if (!apiModel.id || seen.has(apiModel.id)) {
          continue;
        }
        if (models.length >= MAX_DYNAMIC_MODELS) {
          break;
        }
        seen.add(apiModel.id);
        models.push(toModelDefinition(apiModel));
      }
      return models;
    } finally {
      clearTimeout(timeout);
    }
  } catch {
    return STATIC_MODELS;
  }
}

export function buildOpenrouterProvider(): ModelProviderConfig {
  return {
    baseUrl: OPENROUTER_BASE_URL,
    api: "openai-completions",
    models: STATIC_MODELS,
  };
}

export function buildOpenrouterProviderWithModels(
  models: ModelDefinitionConfig[],
): ModelProviderConfig {
  return {
    baseUrl: OPENROUTER_BASE_URL,
    api: "openai-completions",
    models,
  };
}
