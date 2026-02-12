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
2. **Fan-out** — Claude and Codex research all subtopics in parallel
3. **Synthesize** — Claude merges all findings into a single markdown report

Each agent uses whatever MCP tools it has configured in its own environment
(`~/.mcp.json`, etc.) — Perplexity, Exa, web search, and so on.

## Defaults

| Setting | Default | Notes |
|---------|---------|-------|
| **Subtopics** | 3 | Each query is decomposed into 3 subtopics |
| **Concurrency** | 6 | All subtopics researched in parallel (Claude + Codex per subtopic) |
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

## License

MIT
