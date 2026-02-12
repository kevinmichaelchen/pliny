# Pliny

> Named after [Pliny the Elder](https://en.wikipedia.org/wiki/Pliny_the_Elder),
> who authored _Naturalis Historia_ — the oldest surviving comprehensive
> encyclopedic work.

**Pliny** is an autonomous research agent that fans out queries across multiple
AI agents in parallel, then synthesizes the results into a single report.
It uses [Claude Code](https://github.com/anthropics/claude-code) and
[Codex](https://github.com/openai/codex) as research backends, authenticating
via your existing subscriptions — no API keys needed.

## Quick Start

### Prerequisites

- [Bun](https://bun.sh) >= 1.1
- An [Anthropic](https://console.anthropic.com/) subscription (for Claude Code)
- An [OpenAI](https://platform.openai.com/) subscription (for Codex)
- `claude` and `codex` CLIs installed and authenticated

### Install

```bash
git clone https://github.com/kevinmichaelchen/pliny.git
cd pliny
bun install
```

### Configure

```bash
cp pliny.config.example.yaml pliny.config.yaml
```

Edit `pliny.config.yaml` to choose your models:

```yaml
agents:
  claudeModel: claude-sonnet-4-5-20250929  # or claude-opus-4-6
  codexModel: gpt-5.2
  codexReasoningEffort: medium              # minimal | low | medium | high | xhigh

servers: {}  # MCP servers are optional — agents use their own tools
```

### Run

```bash
# Basic research query
bun run src/cli.ts "What are the tradeoffs of Redis vs Valkey?"

# JSON output
bun run src/cli.ts --format json "History of ice cream"

# Custom config
bun run src/cli.ts --config ./my-config.yaml "your query"
```

## How It Works

Pliny runs a 3-step pipeline:

1. **Decompose** — Claude breaks your topic into 3 focused subtopics
2. **Fan-out** — Claude researches all subtopics; Codex researches a
   speed-adjusted subset (see below)
3. **Synthesize** — Claude merges all findings into a single markdown report

Each agent uses whatever MCP tools it has configured in its own environment
(`~/.mcp.json`, etc.) — Perplexity, Exa, web search, and so on.

### Model Speed Awareness

Pliny knows that different models have different latency characteristics.
GPT-5.2 via Codex is roughly **10x slower** than Claude Sonnet for end-to-end
research tasks. To keep total wall-clock time reasonable, Codex only researches
a fraction of subtopics while Claude covers all of them:

> [!NOTE]
>
> The speed ratios are rough anecdotal observations from end-to-end CLI usage,
> not formal benchmarks. Raw API latency is actually comparable
> ([~600ms TTFT for GPT-5.2 vs ~800ms for Sonnet](https://claude5.com/news/gpt-5-2-speed-boost-40-percent-faster-february-2026)),
> but the Codex CLI adds significant overhead from sandbox startup, reasoning
> depth, and multi-turn tool loops. Your mileage will vary by query complexity
> and reasoning effort setting.

| Config | Claude subtopics | Codex subtopics | Why |
|--------|:---:|:---:|-----|
| Sonnet + `medium` | 3 | 1 | Codex is ~10x slower |
| Sonnet + `low` | 3 | 1 | Codex is ~5x slower |
| Opus + `medium` | 3 | 1 | Opus is ~3x, Codex ~10x |
| Sonnet + `minimal` | 3 | 1 | Codex is ~3x slower |
| Opus + `xhigh` | 3 | 1 | Both are slow — Codex gets 1 |

## Defaults

| Setting | Default | Notes |
|---------|---------|-------|
| **Subtopics** | 3 | Each query is decomposed into 3 subtopics |
| **Claude concurrency** | 3 | Claude researches all subtopics in parallel |
| **Codex concurrency** | 1 | Codex researches 1 subtopic (speed-adjusted) |
| **Depth** | 1 pass | Single decompose-research-synthesize cycle (no recursive loops) |
| **Claude maxTurns** | 8 | Per-subtopic research turn limit |
| **Codex sandboxMode** | `read-only` | Codex runs in read-only sandbox |

## Can I interrupt a running query?

Yes — `Ctrl+C` kills the process. Because Claude and Codex run as separate
subprocesses via their SDKs, the OS will clean them up. There is no partial
resume; re-run the query from scratch.

## MCP Servers

Pliny itself doesn't connect to MCP servers by default. Instead, each agent CLI
(Claude Code, Codex) uses its own MCP configuration. Whatever tools you have
set up for `claude` or `codex` will be available during research.

If you want Pliny to connect to MCP servers directly (for the deepagents path
or the MCP server interface), configure them in `pliny.config.yaml`:

```yaml
servers:
  deepwiki:
    url: https://mcp.deepwiki.com/mcp

  perplexity:
    command: npx
    args: ["-y", "@perplexity-ai/mcp-server"]
    env:
      PERPLEXITY_API_KEY: ${PERPLEXITY_API_KEY}
```

See [.specs/mcp-servers.md](.specs/mcp-servers.md) for a full list of
recommended servers.

## Agent Backends

| Agent | SDK | Auth | Speed |
|-------|-----|------|-------|
| **Claude Code** | `@anthropic-ai/claude-agent-sdk` | Anthropic subscription | Fast (Sonnet) to moderate (Opus) |
| **Codex** | `@openai/codex-sdk` | OpenAI subscription | Varies by `codexReasoningEffort` |

**Speed tip:** For quick demos, use Sonnet + `codexReasoningEffort: medium`.
Opus and `xhigh` produce deeper analysis but take significantly longer.

## Output

The CLI writes the final report to stdout (markdown by default, JSON with
`--format json`). Progress logs go to stderr.

The markdown report includes:
- Executive summary (2-3 paragraphs)
- Sections for each subtopic with synthesized findings
- Source attribution where available
- Coverage notes

## Internals

Architecture, deepagents integration, LangGraph primitives, and project
structure are documented in the [`.specs/`](.specs/) directory.

## TODO

- [ ] **Recursive depth** — Currently the orchestrator runs a single
  decompose-research-synthesize pass. Support configurable recursion depth
  where sub-agents can spawn their own sub-agents, with a critic loop that
  identifies gaps and triggers re-exploration.
- [ ] **Configurable branching factor** — Let sub-agents decide how many
  sub-subtopics to decompose into based on the model they're using and the
  complexity of the topic, rather than hard-coding 3.
- [ ] **Model-aware sub-agent delegation** — Sub-agents should know which
  models to call and how much to decompose. A fast model (Sonnet) can handle
  more breadth; a slow model (GPT-5.2 xhigh) should go deep on fewer topics.
- [ ] **Shared memory across sub-agents** — Sub-agents currently run in
  isolation. Implement [LangGraph shared memory](https://docs.langchain.com/oss/javascript/concepts/memory.md)
  so findings from one sub-agent inform others in real-time (e.g., avoiding
  duplicate research, building on earlier discoveries).
- [ ] **MCP tool hints** — Currently the research prompt just says "use any
  available tools." Users should be able to specify which MCP servers their
  agents have (e.g., Perplexity, Exa, DeepWiki) so the orchestrator can
  encourage agents to use them. Could be configured via `pliny.config.yaml`,
  CLI flags (`--prefer-tools perplexity,exa`), or both.
- [ ] **OpenCode agent backend** — Integrate [OpenCode](https://github.com/opencode-ai/opencode)
  as an additional agent backend (75+ models, daemon mode).
- [ ] **Partial resume** — Save intermediate findings so interrupted queries
  can resume from where they left off.
- [ ] **Cost/token tracking** — Track token usage and estimated cost across
  all agent calls.
- [ ] **Streaming output** — Stream findings as sub-agents complete rather
  than waiting for all to finish.
- [ ] **Free model support** — Integrate free model providers so users can
  run Pliny without paid subscriptions. Candidates:
  [OpenRouter free models](https://openrouter.ai/openrouter/free),
  [OpenCode Zen](https://opencode.ai/docs/zen/),
  [Kilo Code free/budget models](https://kilo.ai/docs/code-with-ai/agents/free-and-budget-models),
  [Amp Code free tier](https://ampcode.com/free).
- [ ] **Better model selection** — Expand the model roster beyond Sonnet/Opus
  and GPT-5.2. Candidates: Haiku, Sonnet (as a lightweight option), GPT-5.2
  Low, Kimi K2.5, MiniMax, GigaPotato, GLM-5. This ties into model-aware
  delegation — the orchestrator should pick models based on cost, speed, and
  task complexity.

## License

MIT
