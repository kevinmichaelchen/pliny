#!/usr/bin/env bun
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { resolve } from "path";
import { loadConfig, createMCPClient } from "./config.js";
import { createResearchAgent } from "./agent.js";

const server = new McpServer({
  name: "pliny",
  version: "0.1.0",
});

// Lazy-initialized agent and MCP client
let agent: any;
let mcpClient: any;

async function ensureAgent() {
  if (agent) return;

  const configPath = resolve(
    process.env.PLINY_CONFIG ?? "pliny.config.yaml",
  );
  const config = loadConfig(configPath);
  mcpClient = createMCPClient(config);
  const mcpTools = await mcpClient.getTools();
  agent = createResearchAgent(config, mcpTools);
}

server.tool(
  "pliny_research",
  "Full recursive research with synthesis. Decomposes topic into subtopics, fans out across MCP tools, critiques findings, and produces a comprehensive report.",
  {
    query: z.string().describe("The research topic or question"),
    thread_id: z
      .string()
      .optional()
      .describe("Thread ID for resuming a previous session"),
  },
  async ({ query, thread_id }) => {
    await ensureAgent();
    const threadId = thread_id ?? `pliny-${Date.now()}`;

    const result = await agent.invoke(
      { messages: [{ role: "user", content: query }] },
      { configurable: { thread_id: threadId } },
    );

    const messages = result?.messages ?? [];
    const lastMsg = messages[messages.length - 1];
    const text =
      typeof lastMsg?.content === "string"
        ? lastMsg.content
        : JSON.stringify(result, null, 2);

    return {
      content: [{ type: "text" as const, text }],
    };
  },
);

server.tool(
  "pliny_search",
  "Quick single-pass fan-out across all configured MCP tools. No recursion — just parallel search and synthesis.",
  {
    query: z.string().describe("The search query"),
  },
  async ({ query }) => {
    await ensureAgent();
    const threadId = `pliny-search-${Date.now()}`;

    // Use a simpler invoke that won't recurse deeply
    const result = await agent.invoke(
      {
        messages: [
          {
            role: "user",
            content: `Do a single-pass search (no recursion) for: ${query}\n\nUse the researcher sub-agent once to fan out across all available tools, then synthesize the results. Do NOT create todos or loop — just one pass.`,
          },
        ],
      },
      { configurable: { thread_id: threadId } },
    );

    const messages = result?.messages ?? [];
    const lastMsg = messages[messages.length - 1];
    const text =
      typeof lastMsg?.content === "string"
        ? lastMsg.content
        : JSON.stringify(result, null, 2);

    return {
      content: [{ type: "text" as const, text }],
    };
  },
);

server.tool(
  "pliny_ask_repos",
  "Repo-focused research via repo-aware MCP servers (DeepWiki, Nia, GitHub). Best for understanding codebases and comparing implementations.",
  {
    query: z.string().describe("The repository-focused question"),
    repos: z
      .array(z.string())
      .optional()
      .describe("GitHub repo references (e.g., ['owner/repo'])"),
  },
  async ({ query, repos }) => {
    await ensureAgent();
    const threadId = `pliny-repos-${Date.now()}`;

    const repoContext = repos?.length
      ? `\n\nFocus on these repositories: ${repos.join(", ")}`
      : "";

    const result = await agent.invoke(
      {
        messages: [
          {
            role: "user",
            content: `Research the following about code repositories: ${query}${repoContext}\n\nPrioritize repo-aware tools like DeepWiki, Nia, and GitHub MCP tools.`,
          },
        ],
      },
      { configurable: { thread_id: threadId } },
    );

    const messages = result?.messages ?? [];
    const lastMsg = messages[messages.length - 1];
    const text =
      typeof lastMsg?.content === "string"
        ? lastMsg.content
        : JSON.stringify(result, null, 2);

    return {
      content: [{ type: "text" as const, text }],
    };
  },
);

// Start the server
const transport = new StdioServerTransport();
await server.connect(transport);
