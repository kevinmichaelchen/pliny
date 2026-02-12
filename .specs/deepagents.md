# deepagents Integration (Legacy)

> This path requires API keys and is not used by the default CLI orchestrator.
> It is retained for future use.

## Stack

```
Deep Agents    <- Pliny agent (batteries-included agent framework)
  └── LangGraph    <- Orchestration runtime (persistence, streaming, interrupts)
      └── LangChain    <- Model integrations, tools, primitives
```

[Deep Agents](https://github.com/langchain-ai/deepagentsjs) are
"batteries-included" implementations of LangChain agents — automatic
compression of long conversations, a virtual filesystem, and subagent-spawning
for managing and isolating context.

## Two Layers

| Layer | Handles | Powered By |
|-------|---------|-----------|
| **Depth** (outer loop) | Planning, decomposition, recursive exploration, termination | `createDeepAgent` with `todoListMiddleware`, sub-agent delegation, `interruptOn` |
| **Breadth** (inner fan-out) | Parallel tool calls across all MCP backends | `MultiServerMCPClient` |

## How deepagents Drives the Loop

| Feature | Mechanism |
|---------|-----------|
| **Planning** | `todoListMiddleware` — agent maintains a structured todo list |
| **Sub-agent delegation** | `task` tool — spawns specialized sub-agents with context isolation |
| **Recursive depth** | Sub-agents can spawn their own sub-agents |
| **Human checkpoints** | `interruptOn` — pause on any tool call for human approval |
| **Persistence** | LangGraph checkpointing — pause and resume across sessions |
| **Context management** | `summarizationMiddleware` — auto-compresses at 170k tokens |
| **File I/O** | Built-in `read_file`, `write_file`, `edit_file`, `glob`, `grep` |

## Agent Setup

```typescript
import { createDeepAgent } from "deepagents";
import { MultiServerMCPClient } from "@langchain/mcp-adapters";
import { MemorySaver } from "@langchain/langgraph-checkpoint";

const mcpClient = new MultiServerMCPClient({
  mcpServers: loadUserConfig("pliny.config.yaml"),
  prefixToolNameWithServerName: true,
  additionalToolNamePrefix: "mcp",
  onConnectionError: "ignore",
});
const mcpTools = await mcpClient.getTools();

const agent = createDeepAgent({
  model: "claude-sonnet-4-5-20250929",
  tools: mcpTools,
  systemPrompt: researchPrompt,
  subagents: [
    {
      name: "researcher",
      description: "Researches a specific subtopic using all available MCP tools.",
      tools: mcpTools,
      systemPrompt: subtopicResearchPrompt,
    },
    {
      name: "critic",
      description: "Reviews research for gaps and suggests new areas.",
      systemPrompt: critiquePrompt,
    },
  ],
  interruptOn: { task: true },
  checkpointer: new MemorySaver(),
});
```

## Termination

| Mechanism | How It Works |
|-----------|-------------|
| **Todo completion** | Agent marks subtopics as done; stops when all are complete |
| **Human checkpoint** | `interruptOn: { task: true }` pauses before spawning sub-agents |
| **Recursion limit** | LangGraph's `recursionLimit` caps total graph steps (default: 10,000) |
| **Token budget** | `summarizationMiddleware` compresses at 170k tokens |
| **Critic feedback** | Critic sub-agent says "coverage is sufficient" |
| **Session resume** | Checkpointed — stop anytime, resume with `--resume` |

## LangGraph.js Primitives

### Persistence & Durable Execution

Every graph step is checkpointed automatically. If an MCP tool times out or the
process crashes mid-research, it resumes from the last successful step.

```typescript
import { PostgresSaver } from "@langchain/langgraph-checkpoint-postgres";

const checkpointer = PostgresSaver.fromConnString(process.env.DATABASE_URL);

const result = await task("search_perplexity", async () => {
  return await mcpTools.perplexity_search({ query: "..." });
})();
```

### Streaming

```typescript
for await (const event of agent.stream(input, {
  streamMode: ["updates", "custom"],
  subgraphs: true,
})) {
  // Real-time progress as sub-agents fan out
}
```

| Stream Mode | What It Shows |
|-------------|--------------|
| `"updates"` | State deltas after each step |
| `"messages"` | LLM tokens as the agent reasons |
| `"custom"` | Progress events from MCP tool wrappers |
| `"debug"` | Full execution traces |

### Interrupts & Human-in-the-Loop

```typescript
const direction = interrupt({
  message: "Found 3 research directions. Which should I explore?",
  options: ["ML architectures", "Training data", "Deployment patterns"],
});

// Resume from CLI
const result = await agent.invoke(new Command({ resume: "ML architectures" }), {
  configurable: { thread_id: "research-001" },
});
```

### Time Travel

```typescript
const history = await agent.getStateHistory({
  configurable: { thread_id: "research-001" },
});
const branchPoint = history.find(s => s.metadata?.step === "decompose");
await agent.updateState(branchPoint.config, { strategy: "depth-first" });
await agent.invoke(null, branchPoint.config);
```

## Long-Term Memory

```typescript
const agent = createDeepAgent({
  store: new InMemoryStore(),
  backend: (config) => new CompositeBackend(
    new StateBackend(config),
    { "/memories/": new StoreBackend(config) }
  ),
});
```

| Path | Backend | Lifetime |
|------|---------|----------|
| `/draft.md`, `/workspace/*` | `StateBackend` | Single thread (ephemeral) |
| `/memories/research/*` | `StoreBackend` | Across all threads (persistent) |

## Skills

Uses `deepagents` skills system for progressive tool disclosure:

```
skills/
├── perplexity/SKILL.md
├── exa/SKILL.md
├── deepwiki/SKILL.md
└── synthesis/SKILL.md
```

Skills follow the [Agent Skills specification](https://agentskills.io/).
