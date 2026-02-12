# Architecture

## Overview

Pliny is a subscription-friendly research orchestrator that drives research
through CLI agent SDKs (Claude Code and Codex), which authenticate via existing
user subscriptions rather than API keys.

### Research Flow

```
┌──────────────────────────────────────────────────────────────┐
│                    Orchestrator (3 steps)                     │
│                                                              │
│  1. Decompose: Claude breaks topic into 3 subtopics         │
│  2. Fan-out: Claude + Codex research all subtopics          │
│     in parallel (6 concurrent agent calls)                   │
│  3. Synthesize: Claude merges findings into a report         │
│                                                              │
│  ┌────────────────────────────────────────────────────────┐  │
│  │              Per-Subtopic (parallel)                    │  │
│  │                                                        │  │
│  │  ┌──────────────┐    ┌──────────────┐                  │  │
│  │  │  Claude Code  │    │    Codex     │                  │  │
│  │  │  (SDK query)  │    │  (SDK thread)│                  │  │
│  │  └──────────────┘    └──────────────┘                  │  │
│  │                                                        │  │
│  │  Each agent uses its own MCP tools                     │  │
│  │  (~/.mcp.json, etc.)                                   │  │
│  └────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────┘
```

### Subscription-Based Auth

The orchestrator uses CLI SDKs that authenticate via user subscriptions:

| Agent | SDK | Auth |
|-------|-----|------|
| Claude Code | `@anthropic-ai/claude-agent-sdk` | Anthropic subscription |
| Codex | `@openai/codex-sdk` | OpenAI subscription |

No API keys needed — if you can run `claude` and `codex` from the command line,
Pliny works.

## Agent Backends

### Claude Code

Wrapped via `@anthropic-ai/claude-agent-sdk`:

```typescript
const { query } = await import("@anthropic-ai/claude-agent-sdk");
const q = query({
  prompt,
  options: {
    model: "claude-sonnet-4-5-20250929",
    maxTurns: 10,
    permissionMode: "bypassPermissions",
  },
});
for await (const message of q) {
  if (message.type === "result" && message.subtype === "success") {
    return message.result;
  }
}
```

### Codex

Wrapped via `@openai/codex-sdk`:

```typescript
const { Codex } = await import("@openai/codex-sdk");
const codex = new Codex();
const thread = codex.startThread({
  model: "gpt-5.2",
  modelReasoningEffort: "medium",
  sandboxMode: "read-only",
});
const result = await thread.run(prompt);
return result.finalResponse;
```

## Concurrency Model

All subtopics are researched in parallel. For each subtopic, Claude and Codex
run concurrently via `Promise.allSettled`. With the default of 3 subtopics,
that's up to 6 concurrent agent calls.

```
Subtopic 1: Claude ──────┐    Codex ──────┐
Subtopic 2: Claude ──────┤    Codex ──────┤  (all in parallel)
Subtopic 3: Claude ──────┘    Codex ──────┘
```

If one agent fails (e.g., Codex times out), the other's findings are still
included. `Promise.allSettled` ensures no single failure blocks the pipeline.

## Depth & Iteration

The current orchestrator runs a single pass (not recursive):

1. **Decompose** into 3 subtopics (1 Claude call, maxTurns: 3)
2. **Research** each subtopic (1 Claude + 1 Codex per subtopic, maxTurns: 8)
3. **Synthesize** into a report (1 Claude call, maxTurns: 5)

Total: ~8 agent calls. No recursive loops — the orchestrator completes in one
pass. Future versions may add recursive depth via critique-driven re-exploration.

## Legacy: deepagents Path

The `src/agent.ts` file contains a `createDeepAgent`-based implementation that
supports recursive depth, human-in-the-loop interrupts, persistence, and
cross-session memory. This path requires API keys (`ANTHROPIC_API_KEY`,
`OPENAI_API_KEY`) and is not used by the CLI. It is retained for future use
when API-key-based workflows are needed.

See [deepagents.md](./deepagents.md) for details.
