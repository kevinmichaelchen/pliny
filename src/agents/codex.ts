import { DynamicStructuredTool } from "@langchain/core/tools";
import { z } from "zod";

/**
 * Creates a LangChain tool that wraps the OpenAI Codex SDK.
 * This allows the deep agent to delegate tasks to Codex for
 * code generation and analysis via stateful threads.
 */
export function createCodexTool(options?: {
  model?: string;
  reasoningEffort?: "minimal" | "low" | "medium" | "high" | "xhigh";
}): DynamicStructuredTool {
  const defaultModel = options?.model;
  const defaultReasoningEffort = options?.reasoningEffort;

  return new DynamicStructuredTool({
    name: "codex",
    description:
      "Delegate a research task to OpenAI Codex. Best for web research, synthesis, and analysis tasks that benefit from strong reasoning.",
    schema: z.object({
      prompt: z.string().describe("The research task or question for Codex"),
      workingDirectory: z
        .string()
        .optional()
        .describe("Working directory for the agent"),
      sandboxMode: z
        .enum(["read-only", "workspace-write"])
        .optional()
        .default("read-only")
        .describe("Sandbox mode for the Codex agent"),
    }),
    func: async ({ prompt, workingDirectory, sandboxMode }) => {
      try {
        const { Codex } = await import("@openai/codex-sdk");

        const codex = new Codex();
        const thread = codex.startThread({
          model: defaultModel,
          modelReasoningEffort: defaultReasoningEffort,
          sandboxMode: sandboxMode ?? "read-only",
          workingDirectory: workingDirectory ?? process.cwd(),
        });

        const result = await thread.run(prompt);
        return result.finalResponse;
      } catch (error) {
        return `Codex failed: ${error instanceof Error ? error.message : String(error)}`;
      }
    },
  });
}
