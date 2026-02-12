/**
 * Subscription-friendly orchestrator.
 *
 * Instead of using deepagents (which calls models via LangChain API clients
 * requiring API keys), this orchestrator drives research through the CLI SDKs
 * which authenticate via user subscriptions.
 *
 * Flow:
 *   1. Claude decomposes the topic into subtopics
 *   2. Claude researches ALL subtopics; Codex researches a subset (it's slower)
 *   3. Claude synthesizes all findings into a report
 *
 * Model speed awareness:
 *   Codex/GPT-5.2 is roughly 10x slower than Claude Sonnet. To keep total
 *   wall-clock time reasonable, Codex only researches a fraction of subtopics
 *   (default: 1 out of 3). Claude covers all subtopics so nothing is missed.
 */
import type { PlinyConfig } from "./types.js";

// ---------------------------------------------------------------------------
// Model speed profiles — relative latency for workload balancing
// ---------------------------------------------------------------------------

interface ModelProfile {
  /** Relative speed factor (1.0 = baseline). Lower = faster. */
  relativeLatency: number;
}

/**
 * Known model speed profiles. Used to decide how many subtopics each agent
 * should handle so the pipeline finishes in roughly the same wall-clock time.
 *
 * These are approximate — actual latency depends on prompt complexity,
 * reasoning effort, tool use, and network conditions.
 */
const MODEL_PROFILES: Record<string, ModelProfile> = {
  // Anthropic models
  "claude-sonnet-4-5-20250929": { relativeLatency: 1.0 },
  "claude-opus-4-6": { relativeLatency: 3.0 },

  // OpenAI models (via Codex CLI — includes sandbox overhead)
  "gpt-5.2": { relativeLatency: 10.0 },
  "o3": { relativeLatency: 8.0 },
  "o4-mini": { relativeLatency: 4.0 },
};

/** Reasoning effort multipliers applied to Codex's base latency. */
const EFFORT_MULTIPLIERS: Record<string, number> = {
  minimal: 0.3,
  low: 0.5,
  medium: 1.0,
  high: 2.0,
  xhigh: 4.0,
};

/**
 * Decide how many subtopics Codex should handle given the speed differential.
 * Claude always handles ALL subtopics; Codex handles a subset proportional
 * to how much slower it is.
 */
function codexSubtopicCount(
  totalSubtopics: number,
  claudeModel: string,
  codexModel: string | undefined,
  codexEffort: string,
): number {
  const claudeProfile = MODEL_PROFILES[claudeModel] ?? { relativeLatency: 1.0 };
  const codexProfile = MODEL_PROFILES[codexModel ?? "gpt-5.2"] ?? { relativeLatency: 10.0 };
  const effortMult = EFFORT_MULTIPLIERS[codexEffort] ?? 1.0;

  const effectiveCodexLatency = codexProfile.relativeLatency * effortMult;
  const ratio = claudeProfile.relativeLatency / effectiveCodexLatency;

  // Codex gets at least 1 subtopic, at most all of them
  const codexCount = Math.max(1, Math.round(totalSubtopics * ratio));
  return Math.min(codexCount, totalSubtopics);
}

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
  const claudeModel = config.agents?.claudeModel ?? "claude-sonnet-4-5-20250929";
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
  // Claude handles ALL subtopics. Codex handles a subset based on speed.
  const numCodexSubtopics = codexSubtopicCount(
    subtopics.length,
    claudeModel,
    codexModel,
    codexEffort,
  );

  log(
    "research",
    `Claude: ${subtopics.length} subtopics, Codex: ${numCodexSubtopics} subtopics ` +
      `(speed-adjusted for ${codexModel ?? "gpt-5.2"} @ ${codexEffort})`,
  );

  const findings: Array<{ subtopic: string; claude?: string; codex?: string }> =
    [];

  const tasks = subtopics.map(async (subtopic, i) => {
    const researchPrompt = `Research the following subtopic thoroughly. Use any available tools (web search, etc). Be concise but informative, with source attribution where possible.

Subtopic: ${subtopic}`;

    const entry: { subtopic: string; claude?: string; codex?: string } = {
      subtopic,
    };

    // Claude always runs; Codex only for first N subtopics
    const agentCalls: Array<Promise<{ agent: string; result: string }>> = [
      runClaude(researchPrompt, {
        model: claudeModel,
        maxTurns: 8,
      }).then((r) => {
        log("research", `Claude finished subtopic ${i + 1}: ${subtopic.slice(0, 60)}`);
        return { agent: "claude", result: r };
      }),
    ];

    if (i < numCodexSubtopics) {
      agentCalls.push(
        runCodex(researchPrompt, {
          model: codexModel,
          reasoningEffort: codexEffort,
        }).then((r) => {
          log("research", `Codex finished subtopic ${i + 1}: ${subtopic.slice(0, 60)}`);
          return { agent: "codex", result: r };
        }),
      );
    }

    const results = await Promise.allSettled(agentCalls);

    for (const res of results) {
      if (res.status === "fulfilled") {
        if (res.value.agent === "claude") entry.claude = res.value.result;
        else entry.codex = res.value.result;
      } else {
        log("research", `Agent failed on subtopic ${i + 1}: ${res.reason}`);
      }
    }

    findings[i] = entry;
  });

  await Promise.all(tasks);

  // ── Step 3: Synthesize ─────────────────────────────────────────────────
  log("synthesize", "Synthesizing findings into report...");

  const findingsText = findings
    .map((f, i) => {
      let section = `
### Subtopic ${i + 1}: ${f.subtopic}

**Claude (${claudeModel}) findings:**
${f.claude ?? "(not available)"}`;

      if (f.codex) {
        section += `

**Codex (${codexModel ?? "default"}, ${codexEffort}) findings:**
${f.codex}`;
      }

      return section;
    })
    .join("\n\n---\n\n");

  const report = await runClaude(
    `You are a research synthesis expert. Combine the following parallel research findings into a single, well-structured markdown report. Cross-reference where multiple agents agree, note where they differ, and produce a coherent narrative.

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
