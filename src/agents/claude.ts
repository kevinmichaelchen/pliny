import { DynamicStructuredTool } from "@langchain/core/tools";
import { z } from "zod";

/**
 * Creates a LangChain tool that wraps the Claude Code agent SDK.
 * This allows the deep agent to delegate tasks to Claude Code for
 * deep codebase analysis, file reading, and agentic tool use.
 */
export function createClaudeCodeTool(): DynamicStructuredTool {
  return new DynamicStructuredTool({
    name: "claude_code",
    description:
      "Delegate a task to Claude Code for deep codebase analysis, file reading, and agentic tool use. Best for tasks requiring reading/analyzing code repositories.",
    schema: z.object({
      prompt: z.string().describe("The task or question for Claude Code"),
      cwd: z
        .string()
        .optional()
        .describe("Working directory for the agent"),
      maxTurns: z
        .number()
        .optional()
        .default(10)
        .describe("Maximum conversation turns"),
    }),
    func: async ({ prompt, cwd, maxTurns }) => {
      try {
        const { query } = await import("@anthropic-ai/claude-agent-sdk");

        const q = query({
          prompt,
          options: {
            cwd: cwd ?? process.cwd(),
            maxTurns: maxTurns ?? 10,
            permissionMode: "bypassPermissions",
          },
        });

        for await (const message of q) {
          if (message.type === "result") {
            if (message.subtype === "success") {
              return message.result;
            }
            // Error result
            if ("errors" in message) {
              return `Claude Code error: ${message.errors.join(", ")}`;
            }
            return "Claude Code completed with unknown status";
          }
        }

        return "Claude Code returned no result";
      } catch (error) {
        return `Claude Code failed: ${error instanceof Error ? error.message : String(error)}`;
      }
    },
  });
}
