# Implementation Plan: OpenRouter API Optimization

## Overview

Four targeted patches to the OpenRouter API client layer: default provider routing payload injection, system prompt cache pinning verification, Anthropic beta header injection, and model ID preservation verification. Requirements 2 and 4 are already implemented and only need verification tests. Requirements 1 and 3 require code changes to `src/agents/pi-embedded-runner/proxy-stream-wrappers.ts`.

## Tasks

- [x] 1. Implement default provider routing and Anthropic beta headers
  - [x] 1.1 Add `OPENROUTER_DEFAULT_PROVIDER_ROUTING` constant and inject provider payload in `createOpenRouterWrapper`
    - Add the module-level constant to `src/agents/pi-embedded-runner/proxy-stream-wrappers.ts` with `allow_fallbacks`, `require_parameters`, `quantizations`, `sort`, and `ignore` fields
    - Modify `createOpenRouterWrapper`'s `onPayload` callback to inject `payload.provider` as `{ ...OPENROUTER_DEFAULT_PROVIDER_ROUTING, ...model.compat.openRouterRouting }` after `normalizeProxyReasoningPayload`
    - Guard against non-object `model.compat.openRouterRouting` with a `typeof` check
    - _Requirements: 1.1, 1.2, 1.3_

  - [x] 1.2 Add `anthropic-beta` and `HTTP-Referer` headers to `createOpenRouterWrapper`
    - Modify the header merge in `createOpenRouterWrapper` to append `"anthropic-beta": "structured-outputs-2025-11-13"` and `"HTTP-Referer": "http://localhost:18789"` after the spread of `attributionHeaders` and `options?.headers`
    - These wrapper-level headers must have highest precedence (placed last in the spread)
    - _Requirements: 3.1, 3.2, 3.3, 3.4_

  - [ ]\* 1.3 Write property test for provider routing merge (Property 1)
    - **Property 1: Provider routing merge**
    - Use `fast-check` to generate random user routing objects; verify `payload.provider` deep-equals `{ ...DEFAULT, ...userRouting }`; verify default is used when no user routing is supplied
    - Test file: `src/agents/pi-embedded-runner/proxy-stream-wrappers.test.ts`
    - **Validates: Requirements 1.1, 1.2, 1.3**

  - [ ]\* 1.4 Write property test for required headers with correct precedence (Property 4)
    - **Property 4: Required headers present with correct precedence**
    - Use `fast-check` to generate random attribution and caller headers; verify `anthropic-beta`, `HTTP-Referer`, `X-OpenRouter-Title`, `X-OpenRouter-Categories` are present with correct values; verify `HTTP-Referer` overrides attribution value
    - Test file: `src/agents/pi-embedded-runner/proxy-stream-wrappers.test.ts`
    - **Validates: Requirements 3.1, 3.2, 3.3, 3.4**

  - [ ]\* 1.5 Write unit tests for default provider routing and header injection
    - Verify exact default provider payload values match the constant
    - Verify user-supplied `{ quantizations: ["fp32"] }` overrides only that key
    - Verify `anthropic-beta` header value is exactly `"structured-outputs-2025-11-13"`
    - Verify `HTTP-Referer` overrides the attribution value `"https://openclaw.ai"`
    - Test file: `src/agents/pi-embedded-runner/proxy-stream-wrappers.test.ts`
    - _Requirements: 1.1, 1.2, 1.3, 3.1, 3.2, 3.3, 3.4_

- [x] 2. Checkpoint - Verify implementation changes
  - Ensure all tests pass, ask the user if questions arise.

- [x] 3. Verify system prompt cache pinning (Requirement 2 — existing behavior)
  - [ ]\* 3.1 Write property test for system/developer cache_control injection (Property 2)
    - **Property 2: System/developer cache_control injection**
    - Use `fast-check` to generate random system/developer messages with string or array content; pass through `createOpenRouterSystemCacheWrapper` with an Anthropic model; assert `cache_control: { type: "ephemeral" }` is present on the correct element
    - Test file: `src/agents/pi-embedded-runner/proxy-stream-wrappers.test.ts`
    - **Validates: Requirements 2.1, 2.3, 2.4**

  - [ ]\* 3.2 Write property test for user/assistant messages untouched (Property 3)
    - **Property 3: User/assistant messages are untouched**
    - Use `fast-check` to generate random user/assistant messages; pass through `createOpenRouterSystemCacheWrapper`; assert content is unchanged via deep equality
    - Test file: `src/agents/pi-embedded-runner/proxy-stream-wrappers.test.ts`
    - **Validates: Requirements 2.2**

  - [ ]\* 3.3 Write unit tests for system cache pinning
    - Verify string-to-array conversion for a specific system message
    - Verify array content gets `cache_control` on last element only
    - Verify non-Anthropic models skip the wrapper entirely
    - Test file: `src/agents/pi-embedded-runner/proxy-stream-wrappers.test.ts`
    - _Requirements: 2.1, 2.2, 2.3, 2.4_

- [x] 4. Verify model ID preservation (Requirement 4 — existing behavior)
  - [ ]\* 4.1 Write property test for model ID parse-normalize round trip (Property 5)
    - **Property 5: Model ID parse-normalize round trip**
    - Use `fast-check` to generate random model ID strings with colons, slashes, and alphanumeric characters; run `parseModelRef("openrouter/" + modelId, "openrouter")` then `normalizeProviderModelId`; assert the output matches the expected API model identifier
    - Test file: `src/agents/model-selection.test.ts`
    - **Validates: Requirements 4.1, 4.2, 4.3, 4.4, 4.5**

  - [ ]\* 4.2 Write unit tests for model ID parsing edge cases
    - Verify `parseModelRef("openrouter/hunter-alpha:nitro", "openrouter")` produces `{ provider: "openrouter", model: "hunter-alpha:nitro" }`
    - Verify double-prefix `"openrouter/openrouter/hunter-alpha:nitro"` splits correctly
    - Verify slash-containing model IDs (e.g. `anthropic/claude-sonnet-4-5`) pass through unchanged
    - Test file: `src/agents/model-selection.test.ts`
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5_

- [x] 5. Final checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Only tasks 1.1 and 1.2 involve actual code changes; all other tasks are verification/testing
- Requirements 2 and 4 are already correctly implemented — tasks 3 and 4 add test coverage only
- Property tests use `fast-check` (available via Vitest)
- Each property test references a specific correctness property from the design document
