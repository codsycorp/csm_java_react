# AI Routing Profiles (Code Assistant + Menu JSON)

This document provides ready-to-use tuning profiles for the 2 core AI flows:
- Code assistant (`/api/ai-code-stream`, `contextType=code`)
- Menu designer (`contextType=menu_json`)

Apply values in `src/main/resources/application.properties` (or env-specific override files).

## Profile A: Cost-Saving (Recommended Default)

```properties
# Streaming model baseline
# Keep Flash as default, rely on routing + fallback for harder cases.
gemini.model=gemini-2.5-flash
gemini.streaming.max-tokens=16384
gemini.streaming.temperature=0.2
gemini.streaming.request-timeout-ms=120000

# ai-code-stream routing
ai.code-stream.routing.enabled=true
ai.code-stream.routing.simple-model=gemini-2.5-flash
ai.code-stream.routing.complex-threshold-chars=20000
ai.code-stream.routing.prefer-simple-for-edit=true
ai.code-stream.routing.edit-simple-max-chars=120000
ai.code-stream.routing.force-simple-first=true
ai.code-stream.routing.simple-first-max-chars=60000
ai.code-stream.routing.retry-default-max-prompt-chars=80000

# AI assistant prompt budgets
ai.assistant.prompt-budget.menu.max-chars=140000
ai.assistant.prompt-budget.code.max-chars=90000
ai.assistant.prompt-budget.code-analyze.current-code-max-chars=22000
ai.assistant.prompt-budget.continuity.max-chars=30000
ai.assistant.prompt-budget.global.max-chars=60000

# Menu probe strategy
ai.assistant.menu.primary-probe-enabled=true
ai.assistant.menu.primary-probe.skip-when-over-ratio=1.4
ai.assistant.menu.direct-provider-primary-probe-first=true
```

## Profile B: Quality-First (Higher Cost)

```properties
# Streaming model baseline
gemini.model=gemini-2.5-pro
gemini.streaming.max-tokens=24576
gemini.streaming.temperature=0.25
gemini.streaming.request-timeout-ms=180000

# ai-code-stream routing
ai.code-stream.routing.enabled=true
ai.code-stream.routing.simple-model=gemini-2.5-flash
ai.code-stream.routing.complex-threshold-chars=12000
ai.code-stream.routing.prefer-simple-for-edit=false
ai.code-stream.routing.edit-simple-max-chars=60000
ai.code-stream.routing.force-simple-first=false
ai.code-stream.routing.simple-first-max-chars=40000
ai.code-stream.routing.retry-default-max-prompt-chars=120000

# AI assistant prompt budgets
ai.assistant.prompt-budget.menu.max-chars=180000
ai.assistant.prompt-budget.code.max-chars=120000
ai.assistant.prompt-budget.code-analyze.current-code-max-chars=35000
ai.assistant.prompt-budget.continuity.max-chars=45000
ai.assistant.prompt-budget.global.max-chars=90000

# Menu probe strategy
ai.assistant.menu.primary-probe-enabled=true
ai.assistant.menu.primary-probe.skip-when-over-ratio=1.8
ai.assistant.menu.direct-provider-primary-probe-first=true
```

## Telemetry You Should Monitor

The backend now emits `AI_TELEMETRY` logs for both AI flows.

Telemetry dashboard endpoint:
- `GET /api/ai-metrics-dashboard`
- Optional query params:
   - `windowHours`
   - `fallbackRateThreshold`
   - `quickProbeRateThreshold`
   - `minSamples`

Track these fields daily:
- `promptChars`, `promptTokens` or `inputChars~`, `inputTokens~`
- `outputChars`, `completionTokens` or `outputTokens~`
- `model`, `switchedToDefaultModel`, `providerFallbackUsed`
- `quickProbe`, `skipQuickProbe`, `geminiFallback`

Track these orchestration fields too:
- `orchestrationEnabled`
- `orchestrationInputChars`
- `orchestrationOutputChars`
- `orchestrationSavedChars`
- `orchestrationPlanSteps`

## Agentic Orchestration (Copilot-style local workflow)

The backend now supports a local preflight orchestration phase before final AI calls:
- Planning: build lightweight plan steps
- Local tools: symbol scan + attachment digest + JSON root key extraction
- Tiered context: metadata -> relevant signals -> runtime tool output

Config keys:

```properties
ai.orchestration.agentic.enabled=true
ai.orchestration.agentic.max-context-chars=22000
ai.orchestration.agentic.max-code-symbols=40
ai.orchestration.agentic.max-attachment-items=8
ai.orchestration.agentic.max-intents=12

# Routing matrix (planner/balanced/complex)
ai.orchestration.routing.matrix.enabled=true
ai.orchestration.routing.matrix.planner-model=gemini-2.5-flash
ai.orchestration.routing.matrix.balanced-model=gemini-2.5-flash
ai.orchestration.routing.matrix.complex-model=gemini-2.5-pro

# Speculative local execution (safe whitelist)
ai.orchestration.speculative.enabled=true
ai.orchestration.speculative.min-attachment-chars=16000
ai.orchestration.speculative.max-json-scan-chars=300000
```

Debug endpoint:
- `POST /api/ai-orchestration-preview`
- Purpose: inspect planning steps, routing tier, preferred model hint, speculative operation, and compressed context block before final AI call.

## Rollout Plan

1. Start with Profile A for 24h.
2. Review `AI_TELEMETRY` volume and fallback rates.
3. If quality drops on complex edits, selectively increase:
   - `ai.assistant.prompt-budget.menu.max-chars`
   - `ai.code-stream.routing.retry-default-max-prompt-chars`
   - `gemini.streaming.max-tokens`

## Environment Profiles

This repository now includes profile-specific overrides:
- `src/main/resources/application-dev.properties`
- `src/main/resources/application-staging.properties`
- `src/main/resources/application-prod.properties`

Example startup:

```bash
# Dev
SPRING_PROFILES_ACTIVE=dev

# Staging
SPRING_PROFILES_ACTIVE=staging

# Production
SPRING_PROFILES_ACTIVE=prod
```
