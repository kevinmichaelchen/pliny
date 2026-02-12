import {
  createDeepAgent,
  CompositeBackend,
  StateBackend,
  StoreBackend,
} from "deepagents";
import { MemorySaver } from "@langchain/langgraph-checkpoint";
import { InMemoryStore } from "@langchain/langgraph";
import type { StructuredTool } from "@langchain/core/tools";
import { researchPrompt } from "./prompts/research.js";
import { subtopicResearchPrompt } from "./prompts/subtopic.js";
import { critiquePrompt } from "./prompts/critique.js";
import { createClaudeCodeTool } from "./agents/claude.js";
import { createCodexTool } from "./agents/codex.js";
import type { PlinyConfig } from "./types.js";

/**
 * Create the Pliny research agent with MCP tools and agent backends.
 */
export function createResearchAgent(
  config: PlinyConfig,
  mcpTools: StructuredTool[],
) {
  const claudeCodeTool = createClaudeCodeTool({
    model: config.agents?.claudeModel,
  });
  const codexTool = createCodexTool({
    model: config.agents?.codexModel,
    reasoningEffort: config.agents?.codexReasoningEffort,
  });
  const store = new InMemoryStore();

  return createDeepAgent({
    model: config.model ?? "claude-sonnet-4-5-20250929",
    tools: [],
    systemPrompt: researchPrompt,
    subagents: [
      {
        name: "researcher",
        description:
          "Researches a specific subtopic using all available MCP tools. Give it one focused question at a time.",
        tools: [...mcpTools, claudeCodeTool, codexTool],
        systemPrompt: subtopicResearchPrompt,
      },
      {
        name: "critic",
        description:
          "Reviews research for gaps, contradictions, and suggests new areas to explore.",
        systemPrompt: critiquePrompt,
      },
    ],
    ...(config.autonomous ? {} : { interruptOn: { task: true } }),
    checkpointer: new MemorySaver(),
    store,
    backend: (stateAndStore) =>
      new CompositeBackend(new StateBackend(stateAndStore), {
        "/memories/": new StoreBackend(stateAndStore),
      }),
  });
}
