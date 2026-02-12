import { readFileSync } from "fs";
import { parse } from "yaml";
import { MultiServerMCPClient } from "@langchain/mcp-adapters";
import type { PlinyConfig, MCPServerConfig } from "./types.js";

/**
 * Load a YAML config file with ${VAR} interpolation from process.env.
 */
export function loadConfig(path: string): PlinyConfig {
  const raw = readFileSync(path, "utf-8");
  const interpolated = raw.replace(/\$\{(\w+)\}/g, (_, name) => {
    return process.env[name] ?? "";
  });
  return parse(interpolated) as PlinyConfig;
}

/**
 * Transform PlinyConfig.servers into a MultiServerMCPClient.
 */
export function createMCPClient(config: PlinyConfig): MultiServerMCPClient {
  const mcpServers: Record<string, any> = {};

  for (const [name, server] of Object.entries(config.servers)) {
    if (server.url) {
      mcpServers[name] = {
        transport: "streamable_http" as const,
        url: server.url,
      };
    } else if (server.command) {
      mcpServers[name] = {
        transport: "stdio" as const,
        command: server.command,
        args: server.args ?? [],
        env: server.env,
      };
    }
  }

  return new MultiServerMCPClient({
    mcpServers,
    prefixToolNameWithServerName: true,
    additionalToolNamePrefix: "mcp",
    onConnectionError: "ignore",
  });
}
