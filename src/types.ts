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

export interface AgentBackendConfig {
  /** Claude Code model (e.g., "claude-opus-4-6") */
  claudeModel?: string;
  /** Codex model (e.g., "gpt-5.2") */
  codexModel?: string;
  /** Codex reasoning effort */
  codexReasoningEffort?: "minimal" | "low" | "medium" | "high" | "xhigh";
}

export interface PlinyConfig {
  /** LLM model identifier for the outer research loop */
  model?: string;
  /** MCP server configurations keyed by server name */
  servers: Record<string, MCPServerConfig>;
  /** Agent backend model configuration */
  agents?: AgentBackendConfig;
  /** Disable human-in-the-loop interrupts (run fully autonomously) */
  autonomous?: boolean;
}
