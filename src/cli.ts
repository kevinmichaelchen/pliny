#!/usr/bin/env bun
import { existsSync } from "fs";
import { resolve } from "path";
import { loadConfig, createMCPClient } from "./config.js";
import { createResearchAgent } from "./agent.js";
import { Command } from "@langchain/langgraph";

function usage(): never {
  console.error(`Usage: pliny [options] <query>

Options:
  --config <path>      Path to config file (default: pliny.config.yaml)
  --resume <thread_id> Resume a previous research session
  --format json|markdown  Output format (default: markdown)
  --help               Show this help message`);
  process.exit(1);
}

async function main() {
  const args = process.argv.slice(2);

  let configPath = "pliny.config.yaml";
  let resumeThreadId: string | undefined;
  let format: "json" | "markdown" = "markdown";
  let query: string | undefined;

  // Parse args
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--config" && args[i + 1]) {
      configPath = args[++i];
    } else if (arg === "--resume" && args[i + 1]) {
      resumeThreadId = args[++i];
    } else if (arg === "--format" && args[i + 1]) {
      const f = args[++i];
      if (f === "json" || f === "markdown") format = f;
    } else if (arg === "--help" || arg === "-h") {
      usage();
    } else if (!arg.startsWith("--")) {
      query = arg;
    }
  }

  if (!query && !resumeThreadId) {
    usage();
  }

  // Resolve config path
  const resolvedConfigPath = resolve(configPath);
  if (!existsSync(resolvedConfigPath)) {
    console.error(`Config file not found: ${resolvedConfigPath}`);
    console.error(
      "Copy pliny.config.example.yaml to pliny.config.yaml and configure your MCP servers.",
    );
    process.exit(1);
  }

  // Load config and create MCP client
  console.error("[pliny] Loading config...");
  const config = loadConfig(resolvedConfigPath);

  console.error("[pliny] Connecting to MCP servers...");
  const mcpClient = createMCPClient(config);
  const mcpTools = await mcpClient.getTools();
  console.error(`[pliny] Connected. ${mcpTools.length} tools available.`);

  // Create agent — cast to any to avoid deep type instantiation issues
  // with deepagents' complex generic types
  const agent = createResearchAgent(config, mcpTools) as any;

  const threadId = resumeThreadId ?? `pliny-${Date.now()}`;
  console.error(`[pliny] Thread: ${threadId}`);

  try {
    if (resumeThreadId && !query) {
      // Resume: invoke with null to continue from last checkpoint
      console.error("[pliny] Resuming previous session...");
      const result = await agent.invoke(null, {
        configurable: { thread_id: threadId },
      });
      printResult(result, format);
    } else if (resumeThreadId && query) {
      // Resume with new input via Command
      console.error("[pliny] Resuming with new input...");
      const result = await agent.invoke(new Command({ resume: query }), {
        configurable: { thread_id: threadId },
      });
      printResult(result, format);
    } else {
      // New research — stream for progress
      console.error(`[pliny] Researching: ${query}`);

      const stream = await agent.stream(
        { messages: [{ role: "user", content: query! }] },
        {
          configurable: { thread_id: threadId },
          streamMode: ["updates", "custom"],
          subgraphs: true,
        },
      );

      for await (const event of stream) {
        // Log progress from streamed events
        if (Array.isArray(event) && event.length === 2) {
          const [ns, data] = event;
          if (typeof data === "object" && data !== null) {
            if ("type" in data && (data as any).type === "progress") {
              console.error(`[pliny] ${(data as any).message ?? "..."}`);
            }
            if ("messages" in data) {
              const messages = (data as any).messages;
              if (Array.isArray(messages)) {
                for (const msg of messages) {
                  if (msg?.content && typeof msg.content === "string") {
                    const preview = msg.content.slice(0, 120);
                    const prefix = Array.isArray(ns) && ns.length
                      ? ns.join("/") + ": "
                      : "";
                    console.error(`[pliny] ${prefix}${preview}...`);
                  }
                }
              }
            }
          }
        }
      }

      // Get final state
      const finalState = await agent.getState({
        configurable: { thread_id: threadId },
      });
      printResult(finalState.values, format);
    }
  } finally {
    await mcpClient.close();
  }

  console.error(
    `\n[pliny] Done. Resume with: bun run src/cli.ts --resume ${threadId}`,
  );
}

function printResult(result: any, format: "json" | "markdown") {
  if (format === "json") {
    console.log(JSON.stringify(result, null, 2));
  } else {
    // Extract the last assistant message or report
    if (result?.messages && Array.isArray(result.messages)) {
      const lastMsg = result.messages[result.messages.length - 1];
      if (lastMsg?.content) {
        console.log(
          typeof lastMsg.content === "string"
            ? lastMsg.content
            : JSON.stringify(lastMsg.content, null, 2),
        );
        return;
      }
    }
    console.log(JSON.stringify(result, null, 2));
  }
}

main().catch((err) => {
  console.error("[pliny] Fatal error:", err);
  process.exit(1);
});
