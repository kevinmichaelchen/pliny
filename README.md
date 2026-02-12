# Pliny

> Named after [Pliny the Elder](https://en.wikipedia.org/wiki/Pliny_the_Elder),
> who authored _Naturalis Historia_ — the oldest surviving comprehensive
> encyclopedic work.

**Pliny** is an autonomous, recursive research agent that goes deep on any
topic. It fans out queries to your MCP tool servers in parallel, synthesizes
results, discovers subtopics, and keeps going until it has thorough coverage.
**Bring Your Own MCP** — plug in any MCP servers you want.

Built on [`deepagents`](https://github.com/langchain-ai/deepagentsjs),
[`@langchain/mcp-adapters`](https://github.com/langchain-ai/langchainjs/tree/main/libs/langchain-mcp-adapters),
and [Bun](https://bun.sh).

## Why

Every research tool has blind spots. Perplexity synthesizes great answers but
can't read your codebase. DeepWiki understands repos but doesn't search the
live web. Exa finds obscure sources but doesn't synthesize. Nia indexes
packages but doesn't know today's news.

A single fan-out across these tools gives you breadth. But real research needs
**depth** too — discovering subtopics you didn't know to ask about, going down
rabbit holes, and knowing when you've covered enough ground.

Pliny does both: **breadth** (parallel fan-out across BYOMCP backends) and
**depth** (recursive research loops powered by `deepagents`).

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                  Deep Agent (outer loop)                     │
│                                                             │
│  1. Plan: decompose topic into subtopics (write_todos)      │
│  2. Research: delegate subtopics to sub-agents              │
│  3. Synthesize: combine findings, identify gaps             │
│  4. Discover: extract new subtopics from results            │
│  5. Repeat until coverage threshold / human approval        │
│                                                             │
│  ┌────────────────────────────────────────────────────────┐ │
│  │        Fan-Out Sub-Agent (per subtopic)                 │ │
│  │                                                        │ │
│  │  MultiServerMCPClient loads all user-configured tools  │ │
│  │                                                        │ │
│  │    ┌──────────┐ ┌──────────┐ ┌──────────┐             │ │
│  │    │Perplexity│ │   Exa    │ │ DeepWiki │  ...        │ │
│  │    └──────────┘ └──────────┘ └──────────┘             │ │
│  │                                                        │ │
│  │  Results synthesized and returned to outer loop        │ │
│  └────────────────────────────────────────────────────────┘ │
│                                                             │
│  Checkpointed — pause overnight, resume tomorrow            │
│  Human checkpoints — approve before going deeper            │
└─────────────────────────────────────────────────────────────┘
```

### Stack

Pliny builds on three layers of the LangChain ecosystem:

```
Deep Agents    ← Pliny lives here (batteries-included agent framework)
  └── LangGraph    ← Orchestration runtime (persistence, streaming, interrupts)
      └── LangChain    ← Model integrations, tools, primitives
```

[Deep Agents](https://github.com/langchain-ai/deepagentsjs) are
"batteries-included" implementations of LangChain agents — automatic
compression of long conversations, a virtual filesystem, and subagent-spawning
for managing and isolating context. If you don't need these capabilities or want
to customize your own, you can drop down to LangChain/LangGraph directly.

### Two Layers

| Layer | Handles | Powered By |
|-------|---------|-----------|
| **Depth** (outer loop) | Planning, decomposition, recursive exploration, termination | [`deepagents`](https://github.com/langchain-ai/deepagentsjs) — `createDeepAgent` with `todoListMiddleware`, sub-agent delegation, `interruptOn` |
| **Breadth** (inner fan-out) | Parallel tool calls across all MCP backends | [`@langchain/mcp-adapters`](https://github.com/langchain-ai/langchainjs/tree/main/libs/langchain-mcp-adapters) — `MultiServerMCPClient` |

> **Parallel execution:** `deepagents`' built-in `task` tool runs sub-agents
> sequentially. For true parallel fan-out across subtopics, Pliny uses
> LangGraph's [Functional API](https://docs.langchain.com/oss/javascript/langgraph/use-functional-api#parallel-execution)
> — `task()` + `Promise.all()` to dispatch multiple researcher sub-agents
> concurrently:
>
> ```typescript
> const researchSubtopic = task("research", async (subtopic: string) => {
>   // Each subtopic fans out across all MCP tools in parallel
>   return await researcherAgent.invoke({ messages: [{ role: "user", content: subtopic }] });
> });
>
> // Parallel fan-out across all subtopics
> const findings = await Promise.all(subtopics.map(researchSubtopic));
> ```

### How `deepagents` Drives the Loop

[`deepagents`](https://github.com/langchain-ai/deepagentsjs) is a library
from LangChain for building deep, multi-step agents on top of LangGraph.js.
It provides:

| Feature | Mechanism |
|---------|-----------|
| **Planning** | `todoListMiddleware` — agent maintains a structured todo list |
| **Sub-agent delegation** | `task` tool — spawns specialized sub-agents with context isolation |
| **Recursive depth** | Sub-agents can spawn their own sub-agents |
| **Human checkpoints** | `interruptOn` — pause on any tool call for human approval |
| **Persistence** | LangGraph checkpointing — pause and resume across sessions |
| **Context management** | `summarizationMiddleware` — auto-compresses at 170k tokens |
| **File I/O** | Built-in `read_file`, `write_file`, `edit_file`, `glob`, `grep` |

```typescript
import { createDeepAgent } from "deepagents";
import { MultiServerMCPClient } from "@langchain/mcp-adapters";
import { MemorySaver } from "@langchain/langgraph-checkpoint";

// 1. Load user-configured MCP tools
const mcpClient = new MultiServerMCPClient({
  mcpServers: loadUserConfig("pliny.config.yaml"),
  prefixToolNameWithServerName: true,
  additionalToolNamePrefix: "mcp",
  useStandardContentBlocks: true,
  onConnectionError: "ignore",
});
const mcpTools = await mcpClient.getTools();

// 2. Create the deep research agent
const agent = createDeepAgent({
  model: "claude-sonnet-4-5-20250929",
  tools: mcpTools,
  systemPrompt: researchPrompt,
  subagents: [
    {
      name: "researcher",
      description: "Researches a specific subtopic using all available MCP tools. Give it one focused question at a time.",
      tools: mcpTools,
      systemPrompt: subtopicResearchPrompt,
    },
    {
      name: "critic",
      description: "Reviews research for gaps, contradictions, and suggests new areas to explore.",
      systemPrompt: critiquePrompt,
    },
  ],
  interruptOn: {
    task: true, // Human approval before spawning sub-agents
  },
  checkpointer: new MemorySaver(),
});

// 3. Run
const result = await agent.invoke(
  { messages: [{ role: "user", content: "Research parks & wildlife agency operations across the US and Canada" }] },
  { configurable: { thread_id: "parks-research-001" } }
);
```

The agent autonomously:
1. Decomposes "parks & wildlife operations" into subtopics (permitting,
   endangered species, habitat management, law enforcement, funding models...)
2. Delegates each subtopic to a `researcher` sub-agent
3. Each sub-agent fans out across all MCP tools (Perplexity for current
   policy, Exa for academic sources, etc.)
4. Sends findings to the `critic` sub-agent to identify gaps
5. Discovers new subtopics from the critique ("you didn't cover tribal
   co-management or Section 7 consultation")
6. Loops back to step 2 with the new subtopics
7. Writes progressive findings to `final_report.md`
8. Stops when the todo list is complete or the human says enough

## Bring Your Own MCP

Pliny doesn't hardcode backends. You declare which MCP servers you want in a
config file, and Pliny dynamically connects to all of them via
[`MultiServerMCPClient`](https://github.com/langchain-ai/langchainjs/tree/main/libs/langchain-mcp-adapters).
Any MCP server works — stdio, HTTP, or SSE.

```yaml
# pliny.config.yaml
servers:
  perplexity:
    command: npx
    args: ["-y", "@perplexity-ai/mcp-server"]
    env:
      PERPLEXITY_API_KEY: ${PERPLEXITY_API_KEY}

  exa:
    command: npx
    args: ["-y", "exa-mcp-server"]
    env:
      EXA_API_KEY: ${EXA_API_KEY}

  deepwiki:
    url: https://mcp.deepwiki.com/mcp

  nia:
    command: npx
    args: ["-y", "nia-codebase-mcp@latest", "--api-key=${NIA_API_KEY}"]

  context7:
    command: npx
    args: ["-y", "@upstash/context7-mcp@latest"]

  parallel:
    command: npx
    args: ["-y", "@anthropic-ai/mcp-parallel"]
```

### Recommended MCP Servers

Any MCP server works, but here are some that are particularly good for
research:

| Server | What It Does | Auth |
|--------|-------------|------|
| **[Perplexity](https://github.com/perplexityai/modelcontextprotocol)** | Synthesized web answers with citations, deep research | API key |
| **[Exa](https://github.com/exa-labs/exa-mcp-server)** | Semantic web search, code examples, company research | API key |
| **[DeepWiki](https://github.com/CognitionAI/deepwiki)** | AI-generated repo documentation, cross-repo Q&A | Free |
| **[Nia](https://github.com/nozomio-labs/nia)** | Code indexing, package search, AI research (quick/deep/oracle) | API key |
| **[Context7](https://github.com/upstash/context7)** | Up-to-date library documentation and code examples | Free |
| **[Parallel](https://docs.parallel.ai)** | Web search and web fetch with content extraction | API key |
| **[HuggingFace](https://huggingface.co/docs/hub/mcp)** | Model/dataset/paper search and metadata | Free |
| **[GitHub](https://github.com/github/github-mcp-server)** | Issues, PRs, code search, repo management | Token |

### When to Use Which

| Research Need | Best Servers |
|--------------|-------------|
| Current events, factual Q&A | Perplexity, Parallel |
| Find code examples and patterns | Exa, Nia, Context7 |
| Understand a GitHub repo | DeepWiki, Nia |
| Library/framework docs | Context7, Nia |
| Company or product research | Exa |
| Academic papers, datasets | HuggingFace, Perplexity |
| Cross-repo architecture analysis | DeepWiki (up to 10 repos) |

## Agent CLI Backends

In addition to MCP servers, Pliny can delegate to AI coding agents as
specialized sub-agents. Where MCP tools return structured data (search results,
documents), agent backends can reason over code, read entire repositories, and
produce synthesized analysis. They're registered as additional `subagents` in the
`createDeepAgent` config:

```typescript
subagents: [
  {
    name: "codebase-analyst",
    description: "Analyzes a codebase in depth — architecture, patterns, dependencies.",
    tools: [claudeCodeTool],  // Wraps the SDK as a LangChain tool
  },
],
```

| Agent | SDK | Best For |
|-------|-----|----------|
| **[Claude Code](https://github.com/anthropics/claude-code)** | `@anthropic-ai/claude-agent-sdk` | Deep codebase analysis, file reading, agentic tool use |
| **[Codex](https://github.com/openai/codex)** | `@openai/codex-sdk` | Code generation, stateful threads |
| **[OpenCode](https://github.com/opencode-ai/opencode)** | `@opencode-ai/sdk` | 75+ models, daemon mode, REST API |

## Interfaces

### CLI

```bash
# Basic query — runs the full recursive research loop
pliny "What are the tradeoffs of Redis vs Valkey for caching?"

# Deep domain research
pliny "Parks & wildlife agency operations across the US and Canada"

# Use a custom config
pliny --config ./my-pliny.config.yaml "..."

# Resume a previous session
pliny --resume parks-research-001

# Output formats
pliny --format json "..."      # Structured JSON
pliny --format markdown "..."  # Markdown report (default)
```

### MCP Server

Pliny also exposes itself as an MCP server, so Claude Code, Codex, or any MCP
client can use it as a meta-tool:

```jsonc
// .mcp.json
{
  "mcpServers": {
    "pliny": {
      "command": "bunx",
      "args": ["pliny-mcp"]
    }
  }
}
```

Exposed tools:

| Tool | Description |
|------|-------------|
| `pliny_research` | Full recursive research with synthesis |
| `pliny_search` | Quick single-pass fan-out (no recursion) |
| `pliny_ask_repos` | Repo-focused research via repo-aware servers |

## Termination

How does Pliny know when to stop?

| Mechanism | How It Works |
|-----------|-------------|
| **Todo completion** | Agent marks subtopics as done; stops when all are complete |
| **Human checkpoint** | `interruptOn: { task: true }` pauses before spawning sub-agents |
| **Recursion limit** | LangGraph's `recursionLimit` caps total graph steps (default: 10,000) |
| **Token budget** | `summarizationMiddleware` compresses at 170k tokens |
| **Critic feedback** | Critic sub-agent says "coverage is sufficient" |
| **Session resume** | Checkpointed — stop anytime, resume with `--resume` |

## LangGraph.js Under the Hood

`deepagents` is built on [LangGraph.js](https://github.com/langchain-ai/langgraphjs),
which provides the runtime primitives that power the features above. You don't
interact with these directly — `createDeepAgent` wires them up — but
understanding them helps when customizing or debugging Pliny:

### Persistence & Durable Execution

Every graph step is checkpointed automatically. If an MCP tool times out or the
process crashes mid-research, Pliny resumes from the last successful step — no
work is lost.

```typescript
import { PostgresSaver } from "@langchain/langgraph-checkpoint-postgres";

const checkpointer = PostgresSaver.fromConnString(process.env.DATABASE_URL);

// Wrap expensive MCP calls in task() to prevent re-execution on resume
const result = await task("search_perplexity", async () => {
  return await mcpTools.perplexity_search({ query: "..." });
})();
```

| Durability Mode | Behavior | Use When |
|----------------|----------|----------|
| `"exit"` | Persist only on graph exit | Short research queries |
| `"async"` | Persist asynchronously during execution | Default for most research |
| `"sync"` | Persist synchronously before each step | Critical long-running research |

### Streaming

Pliny streams progress in real-time as sub-agents fan out across MCP servers:

```typescript
for await (const event of agent.stream(input, {
  streamMode: ["updates", "custom"],
  subgraphs: true,
})) {
  // "Searching Perplexity...", "Found 12 sources via Exa...",
  // "Analyzing repo with DeepWiki...", "Synthesizing findings..."
}
```

| Stream Mode | What It Shows |
|-------------|--------------|
| `"updates"` | State deltas after each step |
| `"messages"` | LLM tokens as the agent reasons |
| `"custom"` | Progress events from MCP tool wrappers (via `config.writer()`) |
| `"debug"` | Full execution traces for debugging |

### Interrupts & Human-in-the-Loop

The `interrupt()` function pauses execution and returns control to the user.
Resume with `Command({ resume: value })`:

```typescript
// Inside a research node
const direction = interrupt({
  message: "Found 3 research directions. Which should I explore?",
  options: ["ML architectures", "Training data", "Deployment patterns"],
});
// User resumes with their choice — execution continues from here

// Resume from CLI
const result = await agent.invoke(new Command({ resume: "ML architectures" }), {
  configurable: { thread_id: "research-001" },
});
```

Interrupts propagate through subgraphs, so if a sub-agent needs clarification,
the user sees it at the top level.

### Time Travel

Fork research at any checkpoint to explore alternative paths:

```typescript
// Get full research history
const history = await agent.getStateHistory({
  configurable: { thread_id: "research-001" },
});

// Find the checkpoint after initial topic decomposition
const branchPoint = history.find(s => s.metadata?.step === "decompose");

// Fork: try a different research strategy from that point
await agent.updateState(branchPoint.config, {
  strategy: "depth-first",  // instead of breadth-first
});
await agent.invoke(null, branchPoint.config);
```

Use cases: debug why research went off-track, compare breadth-first vs
depth-first strategies, test different MCP tool configurations on the same query.

### Memory & Subgraphs

LangGraph provides two layers of memory — short-term (thread-scoped via
checkpointers) and long-term (cross-thread via stores). See
[Long-Term Memory](#long-term-memory) for how Pliny uses `CompositeBackend` to
persist research state across sessions.

Each research sub-agent runs as a LangGraph subgraph with isolated state but
shared persistence. Interrupts, streaming, and persistence propagate through
the subgraph hierarchy automatically.

## Setup

### Prerequisites

- [Bun](https://bun.sh) >= 1.1
- API keys for whatever MCP servers you configure

### Install

```bash
git clone https://github.com/kevinmichaelchen/pliny.git
cd pliny
bun install
```

### Configure

1. Copy the example config:

```bash
cp pliny.config.example.yaml pliny.config.yaml
```

2. Add your API keys to `.env`:

```bash
# Add keys for whichever servers you're using
PERPLEXITY_API_KEY=pplx-...
EXA_API_KEY=exa-...
NIA_API_KEY=nia-...
ANTHROPIC_API_KEY=sk-ant-...
OPENAI_API_KEY=sk-...
```

3. Edit `pliny.config.yaml` to add/remove MCP servers.

### Run

```bash
# CLI mode
bun run src/cli.ts "your research query"

# MCP server mode (stdio)
bun run src/mcp.ts
```

## Project Structure

```
pliny/
  src/
    cli.ts              # CLI entry point
    mcp.ts              # MCP server entry point
    config.ts           # Config loader (YAML -> MultiServerMCPClient)
    agent.ts            # createDeepAgent setup with BYOMCP tools
    prompts/
      research.ts       # System prompt for the outer research loop
      subtopic.ts       # System prompt for subtopic sub-agents
      critique.ts       # System prompt for the critic sub-agent
    agents/
      claude.ts         # Claude Code agent backend
      codex.ts          # Codex agent backend
      opencode.ts       # OpenCode agent backend
    types.ts            # Shared types
  skills/
    perplexity/
      SKILL.md          # When/how to use Perplexity
    exa/
      SKILL.md          # When/how to use Exa
    deepwiki/
      SKILL.md          # When/how to use DeepWiki
    synthesis/
      SKILL.md          # How to synthesize findings into reports
  pliny.config.example.yaml
  package.json
  tsconfig.json
  .env.example
```

## Tech Stack

| Component | Technology |
|-----------|-----------|
| Runtime | [Bun](https://bun.sh) |
| Deep Agent | [`deepagents`](https://github.com/langchain-ai/deepagentsjs) — recursive research loop, planning, sub-agents, HITL |
| Orchestration | [LangGraph.js](https://github.com/langchain-ai/langgraphjs) (`@langchain/langgraph`) — persistence, durable execution, streaming, interrupts, time-travel, memory, subgraphs |
| MCP Client | [`@langchain/mcp-adapters`](https://github.com/langchain-ai/langchainjs/tree/main/libs/langchain-mcp-adapters) — Bring Your Own MCP |
| MCP Server | [`@modelcontextprotocol/sdk`](https://github.com/modelcontextprotocol/typescript-sdk) — Pliny's own MCP interface |
| LLM Providers | [LangChain.js](https://github.com/langchain-ai/langchainjs) (`@langchain/anthropic`, `@langchain/openai`, etc.) |
| Schema Validation | [Zod](https://zod.dev) |

## Key Dependencies

```jsonc
{
  "deepagents": "^1.7",                           // Deep agent harness
  "@langchain/langgraph": "latest",                // Graph engine
  "@langchain/langgraph-checkpoint": "latest",     // Checkpointer interface
  "@langchain/langgraph-checkpoint-postgres": "latest", // Production persistence
  "@langchain/core": "latest",
  "@langchain/mcp-adapters": "^1.1",              // Bring Your Own MCP
  "@langchain/anthropic": "latest",
  "@langchain/openai": "latest",
  "@modelcontextprotocol/sdk": "^1.26",           // MCP server SDK
  "@anthropic-ai/claude-agent-sdk": "latest",
  "@openai/codex-sdk": "latest",
  "zod": "^3.25"
}
```

## Long-Term Memory

Research often spans multiple sessions — you start investigating tonight, sleep on
it, and continue tomorrow. Pliny uses `deepagents`'
[`CompositeBackend`](https://docs.langchain.com/oss/deepagents/long-term-memory)
to persist research state across threads:

```typescript
const agent = createDeepAgent({
  store: new InMemoryStore(), // PostgresStore for production
  backend: (config) => new CompositeBackend(
    new StateBackend(config),                    // Ephemeral (scratch space)
    { "/memories/": new StoreBackend(config) }   // Persistent across threads
  ),
  systemPrompt: `Save your research progress to /memories/research/:
  - /memories/research/sources.txt - Sources discovered
  - /memories/research/findings.md - Key findings per subtopic
  - /memories/research/gaps.txt - Known gaps to investigate next
  - /memories/research/report.md - Progressive report draft`,
  // ...
});
```

| Path | Backend | Lifetime |
|------|---------|----------|
| `/draft.md`, `/workspace/*` | `StateBackend` | Single thread (ephemeral) |
| `/memories/research/*` | `StoreBackend` | Across all threads (persistent) |

Resume a previous research session and the agent picks up where it left off —
sources already found, subtopics already explored, gaps already identified.

### Store Implementations

| Store | Use For |
|-------|---------|
| `InMemoryStore` | Development and testing |
| `PostgresStore` | Production (survives restarts) |

## Skills

Pliny uses `deepagents`'
[skills system](https://docs.langchain.com/oss/deepagents/skills) for
**progressive tool disclosure** — instead of loading all instructions into the
system prompt, each MCP backend gets a `SKILL.md` file that the agent reads
only when relevant.

```
skills/
├── perplexity/
│   └── SKILL.md       # When to use Perplexity, query strategies
├── exa/
│   └── SKILL.md       # When to use Exa, search operators
├── deepwiki/
│   └── SKILL.md       # When to use DeepWiki, repo analysis tips
├── academic-research/
│   ├── SKILL.md       # How to research academic topics
│   └── arxiv_search.ts
└── synthesis/
    └── SKILL.md       # How to synthesize findings into reports
```

### How It Works

1. **Match** — Agent receives a prompt, checks skill descriptions (frontmatter only)
2. **Read** — If a skill matches, agent reads the full `SKILL.md`
3. **Execute** — Agent follows the skill's instructions

This keeps the system prompt lean while still giving the agent deep knowledge
about each backend when it needs it.

### Subagent Skills

Each sub-agent gets its own isolated skills:

```typescript
const agent = createDeepAgent({
  skills: ["/skills/main/"],  // Main agent skills
  subagents: [
    {
      name: "researcher",
      skills: ["/skills/perplexity/", "/skills/exa/", "/skills/deepwiki/"],
    },
    {
      name: "critic",
      skills: ["/skills/synthesis/", "/skills/academic-research/"],
    },
  ],
});
```

Skills follow the [Agent Skills specification](https://agentskills.io/) and
layer with "last wins" precedence.

## Error Handling

Pliny is designed to degrade gracefully when individual MCP servers fail:

| Failure | Behavior |
|---------|----------|
| **Server unreachable at startup** | `onConnectionError: "ignore"` — Pliny starts with available servers |
| **Server fails mid-research** | Sub-agent reports the failure; outer loop continues with remaining servers |
| **LLM provider timeout** | Durable execution resumes from last checkpoint — no work lost |
| **Rate limit hit** | LangChain's built-in retry with exponential backoff |

Research quality degrades proportionally — losing Perplexity means no
synthesized web answers, but Exa and DeepWiki still contribute. The critic
sub-agent flags coverage gaps caused by missing servers.

## Output

Pliny produces a structured research report:

```
output/
  report.md             # Final synthesized report (default)
  report.json           # Structured output (--format json)
  sources.json          # All sources with citations and provenance
```

The markdown report includes:
- **Executive summary** — Key findings in 2-3 paragraphs
- **Subtopic sections** — One section per explored subtopic with findings and sources
- **Source attribution** — Inline citations linking back to the MCP server and tool that produced each finding
- **Coverage notes** — What was explored, what gaps remain, what the critic flagged

## Roadmap

- [ ] Deep agent setup with `createDeepAgent` + BYOMCP tools
- [ ] BYOMCP config loader (`pliny.config.yaml` -> `MultiServerMCPClient`)
- [ ] Research system prompts (outer loop, subtopic, critic)
- [ ] CLI interface with `--resume` support
- [ ] MCP server interface (Pliny as a meta-tool)
- [ ] Agent CLI backends (Claude Code, Codex, OpenCode)
- [ ] Parallel sub-agent execution (Functional API `task()` + `Promise.all()`)
- [ ] Structured research frontier (custom middleware)
- [ ] Streaming output (progressive results as sub-agents complete)
- [ ] Cost tracking and budget limits
- [ ] Long-term memory (cross-session knowledge via `StoreBackend`)
- [ ] Skills system (progressive tool disclosure)
- [ ] Result caching
- [ ] LangSmith observability integration

## License

MIT
