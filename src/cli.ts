#!/usr/bin/env bun
import { existsSync } from "fs";
import { resolve } from "path";
import { loadConfig } from "./config.js";
import { research } from "./orchestrator.js";

function usage(): never {
  console.error(`Usage: pliny [options] <query>

Options:
  --config <path>      Path to config file (default: pliny.config.yaml)
  --format json|markdown  Output format (default: markdown)
  --help               Show this help message`);
  process.exit(1);
}

async function main() {
  const args = process.argv.slice(2);

  let configPath = "pliny.config.yaml";
  let format: "json" | "markdown" = "markdown";
  let query: string | undefined;

  // Parse args
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--config" && args[i + 1]) {
      configPath = args[++i];
    } else if (arg === "--format" && args[i + 1]) {
      const f = args[++i];
      if (f === "json" || f === "markdown") format = f;
    } else if (arg === "--help" || arg === "-h") {
      usage();
    } else if (!arg.startsWith("--")) {
      query = arg;
    }
  }

  if (!query) {
    usage();
  }

  // Resolve config path
  const resolvedConfigPath = resolve(configPath);
  if (!existsSync(resolvedConfigPath)) {
    console.error(`Config file not found: ${resolvedConfigPath}`);
    console.error(
      "Copy pliny.config.example.yaml to pliny.config.yaml and configure your servers.",
    );
    process.exit(1);
  }

  // Load config
  console.error("[pliny] Loading config...");
  const config = loadConfig(resolvedConfigPath);

  const claudeModel = config.agents?.claudeModel ?? "claude-opus-4-6";
  const codexModel = config.agents?.codexModel ?? "default";
  const codexEffort = config.agents?.codexReasoningEffort ?? "high";
  console.error(
    `[pliny] Agents: Claude (${claudeModel}) + Codex (${codexModel}, ${codexEffort})`,
  );
  console.error(`[pliny] Researching: ${query}\n`);

  const report = await research({
    config,
    query,
    onProgress: (stage, detail) => {
      console.error(`[pliny:${stage}] ${detail}`);
    },
  });

  if (format === "json") {
    console.log(JSON.stringify({ query, report }, null, 2));
  } else {
    console.log(report);
  }

  console.error("\n[pliny] Done.");
}

main().catch((err) => {
  console.error("[pliny] Fatal error:", err);
  process.exit(1);
});
