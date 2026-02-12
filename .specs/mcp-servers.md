# MCP Servers Reference

## Recommended Servers

Any MCP server works, but these are particularly good for research:

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

## When to Use Which

| Research Need | Best Servers |
|--------------|-------------|
| Current events, factual Q&A | Perplexity, Parallel |
| Find code examples and patterns | Exa, Nia, Context7 |
| Understand a GitHub repo | DeepWiki, Nia |
| Library/framework docs | Context7, Nia |
| Company or product research | Exa |
| Academic papers, datasets | HuggingFace, Perplexity |
| Cross-repo architecture analysis | DeepWiki (up to 10 repos) |

## Config Examples

### Stdio Transport

```yaml
servers:
  perplexity:
    command: npx
    args: ["-y", "@perplexity-ai/mcp-server"]
    env:
      PERPLEXITY_API_KEY: ${PERPLEXITY_API_KEY}
```

### HTTP Transport

```yaml
servers:
  deepwiki:
    url: https://mcp.deepwiki.com/mcp
```

## Error Handling

| Failure | Behavior |
|---------|----------|
| **Server unreachable at startup** | `onConnectionError: "ignore"` — starts with available servers |
| **Server fails mid-research** | Agent reports the failure; other agents continue |
| **LLM provider timeout** | Graceful degradation via `Promise.allSettled` |

Research quality degrades proportionally — losing one agent means fewer
perspectives, but the others still contribute.
