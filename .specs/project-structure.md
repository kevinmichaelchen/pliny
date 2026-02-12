# Project Structure

```
pliny/
  src/
    cli.ts              # CLI entry point
    orchestrator.ts     # Subscription-friendly research orchestrator
    config.ts           # Config loader (YAML with env var interpolation)
    agent.ts            # Legacy deepagents-based agent (not used by CLI)
    mcp.ts              # MCP server entry point (Pliny as meta-tool)
    types.ts            # Shared types
    prompts/
      research.ts       # System prompt for outer research loop (deepagents)
      subtopic.ts       # System prompt for subtopic sub-agents (deepagents)
      critique.ts       # System prompt for critic sub-agent (deepagents)
    agents/
      claude.ts         # Claude Code as LangChain DynamicStructuredTool
      codex.ts          # Codex as LangChain DynamicStructuredTool
      opencode.ts       # OpenCode agent backend (stub)
  skills/
    perplexity/SKILL.md
    exa/SKILL.md
    deepwiki/SKILL.md
    synthesis/SKILL.md
  .specs/               # Internal specs and architecture docs
  pliny.config.example.yaml
  package.json
  tsconfig.json
```

## Key Dependencies

```jsonc
{
  // Orchestrator (subscription-based)
  "@anthropic-ai/claude-agent-sdk": "latest",
  "@openai/codex-sdk": "latest",

  // Legacy deepagents path (API-key-based)
  "deepagents": "^1.7",
  "@langchain/langgraph": "latest",
  "@langchain/mcp-adapters": "^1.1",

  // MCP server interface
  "@modelcontextprotocol/sdk": "^1.26",

  // Config
  "yaml": "^2.3",
  "zod": "^3.25"
}
```
