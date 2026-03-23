# Requirements Document

## Introduction

This specification covers four targeted patches to the OpenRouter API client layer in OpenClaw. The goal is to harden request payloads against silent provider degradation (quantization fallbacks, stripped JSON schema flags), exploit Anthropic prompt caching for cost savings, and fix model ID parsing for OpenRouter-native models with suffixes like `:nitro`.

## Glossary

- **OpenRouter_Wrapper**: The `createOpenRouterWrapper()` stream function in `src/agents/pi-embedded-runner/proxy-stream-wrappers.ts` that injects headers and transforms payloads for all OpenRouter API requests.
- **System_Cache_Wrapper**: The `createOpenRouterSystemCacheWrapper()` stream function in `src/agents/pi-embedded-runner/proxy-stream-wrappers.ts` that appends `cache_control` to system/developer messages for Anthropic models on OpenRouter.
- **Provider_Routing_Injector**: The `injectOpenRouterRouting()` function in `extensions/openrouter/index.ts` that merges a `provider` routing object into the request payload when supplied via `extraParams`.
- **Model_Ref_Parser**: The `parseModelRef()` function in `src/agents/model-selection.ts` that splits a raw model string into a `{ provider, model }` tuple.
- **Model_ID_Normalizer**: The `normalizeProviderModelId()` function in `src/agents/model-selection.ts` that adjusts model IDs per provider conventions (e.g. prepending `openrouter/` for slash-less OpenRouter-native models).
- **Attribution_Headers**: The HTTP headers returned by `resolveProviderAttributionHeaders("openrouter")` in `src/agents/provider-attribution.ts`, currently including `HTTP-Referer`, `X-OpenRouter-Title`, and `X-OpenRouter-Categories`.
- **Provider_Payload**: A JSON object injected at the root of the OpenRouter request body that controls provider routing, quantization filtering, and fallback behavior on the OpenRouter gateway.
- **Quantization_Fallback**: An OpenRouter gateway behavior where requests are silently routed to lower-precision model nodes (e.g. FP4) when no quantization constraints are specified.
- **Structured_Output_Flag**: The `strict: true` JSON Schema flag in tool/function definitions that OpenRouter strips for Anthropic models unless the `anthropic-beta` header is present.

## Requirements

### Requirement 1: Default Provider Routing Payload

**User Story:** As a developer using OpenRouter, I want every API request to include a deterministic provider routing payload, so that requests are never silently routed to degraded FP4 quantization nodes.

#### Acceptance Criteria

1. WHEN a request is sent to the OpenRouter API, THE OpenRouter_Wrapper SHALL inject a `provider` object into the root of the JSON request body with the following properties:
   - `allow_fallbacks` set to `true`
   - `require_parameters` set to `true`
   - `quantizations` set to `["fp16", "bf16", "fp8"]`
   - `sort` set to `{ "by": "throughput", "partition": "none" }`
   - `ignore` set to `["DeepInfra", "Baseten", "AtlasCloud"]`
2. WHEN a user supplies a custom `provider` object via `extraParams`, THE Provider_Routing_Injector SHALL merge the user-supplied object with the default Provider_Payload, with user-supplied keys taking precedence.
3. WHEN no custom `provider` object is supplied via `extraParams`, THE OpenRouter_Wrapper SHALL use the default Provider_Payload without modification.

### Requirement 2: System Prompt Cache Pinning for Anthropic Models

**User Story:** As a developer routing Anthropic model requests through OpenRouter, I want the static system message to include a `cache_control` directive, so that Anthropic prompt caching reduces repeated loop costs by up to 90%.

#### Acceptance Criteria

1. WHEN the model ID starts with `anthropic/` and the provider is `openrouter`, THE System_Cache_Wrapper SHALL append `cache_control: { "type": "ephemeral" }` to the content block of each message with role `system` or `developer`.
2. THE System_Cache_Wrapper SHALL leave messages with role `user` or `assistant` unmodified regardless of model or provider.
3. WHEN the message content is a plain string, THE System_Cache_Wrapper SHALL convert the content to an array containing a single text block with the `cache_control` property attached.
4. WHEN the message content is already an array, THE System_Cache_Wrapper SHALL attach the `cache_control` property to the last element of the array only.

### Requirement 3: Anthropic Beta Header Injection

**User Story:** As a developer using Anthropic models via OpenRouter with structured JSON outputs, I want the `anthropic-beta` header included in every OpenRouter request, so that the `strict: true` JSON Schema flag is preserved and structured outputs work correctly.

#### Acceptance Criteria

1. THE OpenRouter_Wrapper SHALL include the header `anthropic-beta` with value `structured-outputs-2025-11-13` in every request sent to the OpenRouter API.
2. THE OpenRouter_Wrapper SHALL include the header `HTTP-Referer` with value `http://localhost:18789` in every request sent to the OpenRouter API.
3. WHEN Attribution_Headers also define an `HTTP-Referer` value, THE OpenRouter_Wrapper SHALL use the value `http://localhost:18789` from the wrapper, overriding the attribution value.
4. THE OpenRouter_Wrapper SHALL preserve all other existing Attribution_Headers (`X-OpenRouter-Title`, `X-OpenRouter-Categories`) alongside the new headers.

### Requirement 4: OpenRouter Model ID Preservation

**User Story:** As a developer using OpenRouter-native model variants (e.g. `openrouter/hunter-alpha:nitro`), I want the full model ID including suffixes to be preserved through parsing, so that the exact model variant is sent to the OpenRouter API without truncation.

#### Acceptance Criteria

1. WHEN the provider is `openrouter` and the raw model input is `openrouter/hunter-alpha:nitro`, THE Model_Ref_Parser SHALL produce `{ provider: "openrouter", model: "hunter-alpha:nitro" }`.
2. WHEN the provider is `openrouter` and the parsed model ID does not contain a `/`, THE Model_ID_Normalizer SHALL prepend `openrouter/` to produce the full API model ID (e.g. `hunter-alpha:nitro` becomes `openrouter/hunter-alpha:nitro`).
3. WHEN the provider is `openrouter` and the parsed model ID already contains a `/` (e.g. `anthropic/claude-sonnet-4-5`), THE Model_ID_Normalizer SHALL pass the model ID through without modification.
4. WHEN the raw model input contains a second `/` after the provider prefix (e.g. `openrouter/openrouter/hunter-alpha:nitro`), THE Model_Ref_Parser SHALL split only on the first `/` and preserve the remainder as the model ID.
5. FOR ALL valid OpenRouter model references, parsing then normalizing SHALL produce a model ID that, when sent to the OpenRouter API, matches the intended model identifier exactly (round-trip property).
