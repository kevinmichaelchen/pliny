/**
 * Subscription-friendly orchestrator.
 *
 * Instead of using deepagents (which calls models via LangChain API clients
 * requiring API keys), this orchestrator drives research through the CLI SDKs
 * which authenticate via user subscriptions.
 *
 * Flow:
 *   1. Claude Code (opus) decomposes the topic into subtopics
 *   2. Claude Code + Codex research subtopics in parallel
 *   3. Claude Code synthesizes all findings into a report
 */
import type { PlinyConfig } from "./types.js";

// ---------------------------------------------------------------------------
// Claude Code SDK wrapper
// ---------------------------------------------------------------------------

async function runClaude(
  prompt: string,
  opts: {
    model?: string;
    maxTurns?: number;
    systemPrompt?: string;
    cwd?: string;
  } = {},
): Promise<string> {
  const { query } = await import("@anthropic-ai/claude-agent-sdk");

  const q = query({
    prompt,
    options: {
      model: opts.model,
      cwd: opts.cwd ?? process.cwd(),
      maxTurns: opts.maxTurns ?? 10,
      permissionMode: "bypassPermissions",
      systemPrompt: opts.systemPrompt,
    },
  });

  for await (const message of q) {
    if (message.type === "result") {
      if (message.subtype === "success") {
        return message.result;
      }
      if ("errors" in message) {
        throw new Error(`Claude Code error: ${message.errors.join(", ")}`);
      }
    }
  }
  throw new Error("Claude Code returned no result");
}

// ---------------------------------------------------------------------------
// Codex SDK wrapper
// ---------------------------------------------------------------------------

async function runCodex(
  prompt: string,
  opts: {
    model?: string;
    reasoningEffort?: "minimal" | "low" | "medium" | "high" | "xhigh";
    sandboxMode?: "read-only" | "workspace-write";
    workingDirectory?: string;
  } = {},
): Promise<string> {
  const { Codex } = await import("@openai/codex-sdk");

  const codex = new Codex();
  const thread = codex.startThread({
    model: opts.model,
    modelReasoningEffort: opts.reasoningEffort,
    sandboxMode: opts.sandboxMode ?? "read-only",
    workingDirectory: opts.workingDirectory ?? process.cwd(),
  });

  const result = await thread.run(prompt);
  return result.finalResponse;
}

// ---------------------------------------------------------------------------
// Orchestrator
// ---------------------------------------------------------------------------

export interface ResearchOptions {
  config: PlinyConfig;
  query: string;
  onProgress?: (stage: string, detail: string) => void;
}

export async function research({
  config,
  query,
  onProgress,
}: ResearchOptions): Promise<string> {
  const log = onProgress ?? (() => {});
  const claudeModel = config.agents?.claudeModel ?? "claude-opus-4-6";
  const codexModel = config.agents?.codexModel;
  const codexEffort = config.agents?.codexReasoningEffort ?? "high";

  // ── Step 1: Decompose ──────────────────────────────────────────────────
  log("plan", "Decomposing topic into subtopics...");

  const planResult = await runClaude(
    `Break the following research topic into exactly 3 focused subtopics. Return ONLY a JSON array of strings, no other text.

Topic: ${query}`,
    { model: claudeModel, maxTurns: 3 },
  );

  let subtopics: string[];
  try {
    // Extract JSON array from the response
    const match = planResult.match(/\[[\s\S]*?\]/);
    subtopics = match ? JSON.parse(match[0]) : [query];
  } catch {
    subtopics = [query];
  }

  log("plan", `Subtopics: ${subtopics.join(", ")}`);

  // ── Step 2: Fan-out research ───────────────────────────────────────────
  log("research", `Researching ${subtopics.length} subtopics with Claude + Codex...`);

  const findings: Array<{ subtopic: string; claude?: string; codex?: string }> =
    [];

  // Run research in parallel — each subtopic gets both Claude and Codex
  const tasks = subtopics.map(async (subtopic, i) => {
    const researchPrompt = `Research the following subtopic thoroughly. Use any available tools (web search, etc). Be concise but informative, with source attribution where possible.

Subtopic: ${subtopic}`;

    const entry: { subtopic: string; claude?: string; codex?: string } = {
      subtopic,
    };

    // Run Claude and Codex in parallel for each subtopic
    const [claudeRes, codexRes] = await Promise.allSettled([
      runClaude(researchPrompt, {
        model: claudeModel,
        maxTurns: 8,
      }).then((r) => {
        log("research", `Claude finished subtopic ${i + 1}: ${subtopic.slice(0, 60)}`);
        return r;
      }),
      runCodex(researchPrompt, {
        model: codexModel,
        reasoningEffort: codexEffort,
      }).then((r) => {
        log("research", `Codex finished subtopic ${i + 1}: ${subtopic.slice(0, 60)}`);
        return r;
      }),
    ]);

    entry.claude =
      claudeRes.status === "fulfilled"
        ? claudeRes.value
        : `Error: ${claudeRes.reason}`;
    entry.codex =
      codexRes.status === "fulfilled"
        ? codexRes.value
        : `Error: ${codexRes.reason}`;
    findings[i] = entry;
  });

  await Promise.all(tasks);

  // ── Step 3: Synthesize ─────────────────────────────────────────────────
  log("synthesize", "Synthesizing findings into report...");

  const findingsText = findings
    .map(
      (f, i) => `
### Subtopic ${i + 1}: ${f.subtopic}

**Claude (${claudeModel}) findings:**
${f.claude}

**Codex (${codexModel ?? "default"}, ${codexEffort}) findings:**
${f.codex}`,
    )
    .join("\n\n---\n\n");

  const report = await runClaude(
    `You are a research synthesis expert. Combine the following parallel research findings into a single, well-structured markdown report. Cross-reference where the two agents agree, note where they differ, and produce a coherent narrative.

# Research Topic: ${query}

${findingsText}

Write the final report with:
1. Executive summary (2-3 paragraphs)
2. Sections for each subtopic with synthesized findings
3. Source attribution where available
4. Brief coverage notes at the end`,
    { model: claudeModel, maxTurns: 5 },
  );

  return report;
}
