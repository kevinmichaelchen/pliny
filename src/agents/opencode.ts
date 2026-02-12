import { DynamicStructuredTool } from "@langchain/core/tools";
import { z } from "zod";

/**
 * Stub for OpenCode agent backend.
 * TODO: Implement when @opencode-ai/sdk becomes available.
 */
export function createOpenCodeTool(): DynamicStructuredTool {
  return new DynamicStructuredTool({
    name: "opencode",
    description:
      "Delegate a task to OpenCode for multi-model code analysis. (Not yet implemented)",
    schema: z.object({
      prompt: z.string().describe("The task or question for OpenCode"),
    }),
    func: async () => {
      return "OpenCode agent backend is not yet implemented.";
    },
  });
}
