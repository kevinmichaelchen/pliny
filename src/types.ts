export interface MCPServerConfig {
  /** Stdio transport: command to run */
  command?: string;
  /** Stdio transport: command arguments */
  args?: string[];
  /** Stdio transport: environment variables */
  env?: Record<string, string>;
  /** HTTP transport: server URL */
  url?: string;
}

export interface PlinyConfig {
  /** LLM model identifier for the outer research loop */
  model?: string;
  /** MCP server configurations keyed by server name */
  servers: Record<string, MCPServerConfig>;
}
