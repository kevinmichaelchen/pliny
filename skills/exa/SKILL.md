---
name: exa
description: Semantic web search and company research via Exa
---

# Exa MCP Tools

## When to Use
- Finding specific code examples and patterns
- Company and product research
- Academic and technical content discovery
- Finding obscure or specialized sources

## Available Tools
- `mcp__exa__web_search_exa` — Semantic web search with content extraction
- `mcp__exa__company_research_exa` — Focused company/product research
- `mcp__exa__get_code_context_exa` — Find code examples and technical context

## Query Strategies
- Exa excels at semantic search: phrase queries as natural language, not keywords
- Use `get_code_context_exa` for finding implementation patterns across the web
- `company_research_exa` is best for competitive analysis and product comparisons
- Set `numResults` to control breadth (default 5, up to 10 for comprehensive searches)
- Set `tokensNum` for code context to control depth of each result

## Limitations
- API key required
- Results are web content, not synthesized — you'll need to synthesize yourself
- Better for discovery than for authoritative reference
