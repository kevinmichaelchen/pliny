---
name: perplexity
description: Web search and synthesis via Perplexity AI
---

# Perplexity MCP Tools

## When to Use
- Current events and recent information
- Factual Q&A with citations
- Synthesized web answers (not just links)
- General knowledge queries

## Available Tools
- `mcp__perplexity__perplexity_search_web` — Search the web with AI synthesis

## Query Strategies
- Be specific: "Redis vs Valkey performance benchmarks 2024" not "Redis alternatives"
- Use `recency` parameter for time-sensitive topics: "week", "month", "year"
- Perplexity returns synthesized answers with citations — great for getting quick overviews
- Follow up on specific citations from Perplexity results with other tools (Exa, Parallel) for deeper detail

## Limitations
- Results are synthesized, not raw — may miss nuanced details
- Best for breadth, not depth on technical topics
- Use Context7 or DeepWiki for library/framework-specific documentation
