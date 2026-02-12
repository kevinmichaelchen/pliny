import { DynamicStructuredTool } from "@langchain/core/tools";
import { z } from "zod";

/**
 * Creates a LangChain tool that wraps the OpenAI Codex SDK.
 * This allows the deep agent to delegate tasks to Codex for
 * code generation and analysis via stateful threads.
 */
export function createCodexTool(): DynamicStructuredTool {
  return new DynamicStructuredTool({
    name: "codex",
    description:
      "Delegate a task to OpenAI Codex for code generation, analysis, and execution. Best for tasks requiring code writing or modification.",
    schema: z.object({
      prompt: z.string().describe("The task or question for Codex"),
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
