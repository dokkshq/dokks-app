import { productName } from "@/lib/brand";
import { parseModelJson, normalizeSlug, type PageDraft } from "@/lib/copilot/contract";
import { PIPELINE_COST_CEILING_USD } from "@/lib/copilot/cost";
import { AGENT_MEMORY_NOTES, AGENT_READ_FILE_CHARS, AGENT_SEARCH_HITS, AGENT_STEP_TOKENS } from "@/lib/copilot/limits";
import type { CompletionResult, CopilotProvider } from "@/lib/copilot/providers";

export type AgentTool = "list_tree" | "search" | "read_file" | "read_pages" | "write_page" | "finish";

export type AgentEvent = {
  role: "thought" | "say" | "action" | "reply";
  message: string;
  body?: string;
  explored?: number;
  searches?: number;
  edited?: number;
};

export type AgentFile = { path: string; content: string };

export type AgentLoopResult = {
  reply: string;
  pages: PageDraft[];
  finished: boolean;
  promptTokens: number;
  completionTokens: number;
  estimatedCostUsd: number;
};

const TOOLS = new Set<AgentTool>(["list_tree", "search", "read_file", "read_pages", "write_page", "finish"]);

export async function runAgentLoop(args: {
  model: CopilotProvider;
  goal: string;
  siteName: string;
  files: AgentFile[];
  treePaths: string[];
  pages: PageDraft[];
  maxSteps: number;
  costCeilingUsd?: number;
  /** Page writes, including a home page, stay off until a plan is approved. */
  planApproved?: boolean;
  onEvent?: (event: AgentEvent) => Promise<void> | void;
}): Promise<AgentLoopResult> {
  const ceiling = args.costCeilingUsd ?? PIPELINE_COST_CEILING_USD;
  const drafts = new Map(args.pages.map((page) => [page.slug, { ...page }]));
  const notes: string[] = [];
  const usage = { promptTokens: 0, completionTokens: 0, estimatedCostUsd: 0 };
  let reply = "";
  let finished = false;

  for (let step = 0; step < args.maxSteps; step += 1) {
    if (usage.estimatedCostUsd >= ceiling) break;
    const started = Date.now();
    const completion = await args.model.complete({
      system: systemPrompt(),
      user: userPrompt({
        siteName: args.siteName,
        goal: args.goal,
        treeCount: args.treePaths.length,
        pageCount: drafts.size,
        notes,
      }),
      maxTokens: AGENT_STEP_TOKENS,
    });
    addUsage(usage, completion);
    const seconds = Math.max(1, Math.round((Date.now() - started) / 1000));
    const parsed = readStep(completion.text);
    if (!parsed) {
      notes.push("The last response was not valid JSON. Return one JSON object with thought, say, tool, and input.");
      continue;
    }
    if (parsed.thought) {
      await args.onEvent?.({ role: "thought", message: `Thought ${seconds}s`, body: parsed.thought });
    }
    if (parsed.say) {
      await args.onEvent?.({ role: "say", message: parsed.say });
    }
    if (parsed.tool === "finish") {
      reply = parsed.say || stringField(parsed.input.reply) || "Done.";
      finished = true;
      break;
    }
    const outcome = runTool(parsed.tool, parsed.input, {
      files: args.files,
      treePaths: args.treePaths,
      drafts,
      planApproved: args.planApproved === true,
    });
    await args.onEvent?.({
      role: "action",
      message: outcome.label,
      explored: outcome.explored,
      searches: outcome.searches,
      edited: outcome.edited,
    });
    notes.push(`Tool ${parsed.tool}: ${outcome.observation}`);
    if (notes.length > AGENT_MEMORY_NOTES) notes.shift();
  }

  if (!finished) {
    reply = reply || "I stopped before this was finished.";
  }
  return {
    reply,
    pages: [...drafts.values()],
    finished,
    ...usage,
  };
}

export function actionCounts(message: string): { explored?: number; searches?: number; edited?: number } {
  const explored = message.match(/Explored (\d+) file/);
  const searches = message.match(/(\d+) search/);
  const edited = message.match(/Edited (\d+) page/);
  return {
    explored: explored ? Number(explored[1]) : undefined,
    searches: searches ? Number(searches[1]) : undefined,
    edited: edited ? Number(edited[1]) : undefined,
  };
}

function systemPrompt(): string {
  return [
    `You are ${productName()}, the documentation agent for a product.`,
    "Work in steps. Each response is one JSON object and nothing else.",
    'Shape: {"thought":"private reasoning","say":"one or two sentences the user will read","tool":"list_tree","input":{}}',
    "Tools: list_tree, search, read_file, read_pages, write_page, finish.",
    "search input: {\"query\":\"word\",\"scope\":\"repo\"|\"docs\"}.",
    "read_file input: {\"path\":\"src/app/page.tsx\"}.",
    "read_pages input: {} to list pages, or {\"slug\":\"getting-started\"} to read one. Use an empty slug for the home page.",
    "write_page input: {\"slug\":\"guides/start\",\"title\":\"Get started\",\"section\":\"Guides\",\"description\":\"How to start\",\"content\":\"markdown\"}.",
    "finish input: {\"reply\":\"the message the user should read\"}.",
    "Read before you answer. Call write_page only after the site owner approves a plan.",
    "Do not publish. A home page is written only after that approval.",
    "Do not invent screens, buttons, or endpoints you have not read.",
  ].join(" ");
}

function userPrompt(args: {
  siteName: string;
  goal: string;
  treeCount: number;
  pageCount: number;
  notes: string[];
}): string {
  return [
    `Site: ${args.siteName}`,
    `Repository files: ${args.treeCount}`,
    `Docs pages: ${args.pageCount}`,
    "",
    "Goal:",
    args.goal,
    "",
    "Observations:",
    args.notes.length > 0 ? args.notes.join("\n\n") : "(none yet)",
  ].join("\n");
}

function readStep(text: string): { thought: string; say: string; tool: AgentTool; input: Record<string, unknown> } | null {
  try {
    const json = parseModelJson(text);
    const tool = json.tool;
    if (typeof tool !== "string" || !TOOLS.has(tool as AgentTool)) return null;
    const input = json.input && typeof json.input === "object" && !Array.isArray(json.input)
      ? (json.input as Record<string, unknown>)
      : {};
    return {
      thought: stringField(json.thought),
      say: stringField(json.say),
      tool: tool as AgentTool,
      input,
    };
  } catch {
    return null;
  }
}

function runTool(
  tool: AgentTool,
  input: Record<string, unknown>,
  ctx: { files: AgentFile[]; treePaths: string[]; drafts: Map<string, PageDraft>; planApproved: boolean },
): { label: string; observation: string; explored?: number; searches?: number; edited?: number } {
  if (tool === "list_tree") {
    const paths = ctx.treePaths.slice(0, 200);
    return {
      label: `Explored ${paths.length} file${paths.length === 1 ? "" : "s"}`,
      explored: paths.length,
      observation: paths.join("\n") || "(empty repository)",
    };
  }
  if (tool === "search") {
    const query = stringField(input.query).toLowerCase();
    const scope = input.scope === "docs" ? "docs" : "repo";
    const hits: string[] = [];
    if (scope === "docs") {
      for (const page of ctx.drafts.values()) {
        if (!query || `${page.title}\n${page.content}`.toLowerCase().includes(query)) {
          hits.push(`${page.slug || "(home)"}: ${page.title}`);
        }
        if (hits.length >= AGENT_SEARCH_HITS) break;
      }
    } else {
      for (const file of ctx.files) {
        const lines = file.content.split("\n");
        for (let index = 0; index < lines.length; index += 1) {
          if (query && lines[index]?.toLowerCase().includes(query)) {
            hits.push(`${file.path}:${index + 1}: ${lines[index]?.trim().slice(0, 160)}`);
          }
          if (hits.length >= AGENT_SEARCH_HITS) break;
        }
        if (hits.length >= AGENT_SEARCH_HITS) break;
      }
    }
    return {
      label: `Explored ${hits.length} file${hits.length === 1 ? "" : "s"}, ${hits.length} search${hits.length === 1 ? "" : "es"}`,
      explored: hits.length,
      searches: hits.length,
      observation: hits.join("\n") || "No matches.",
    };
  }
  if (tool === "read_file") {
    const path = stringField(input.path);
    const file = ctx.files.find((item) => item.path === path);
    return {
      label: "Explored 1 file",
      explored: 1,
      observation: file ? file.content.slice(0, AGENT_READ_FILE_CHARS) : `File not found: ${path}`,
    };
  }
  if (tool === "read_pages") {
    const slug = typeof input.slug === "string" ? input.slug : null;
    if (slug === null) {
      const titles = [...ctx.drafts.values()].map((page) => `${page.slug || "(home)"}: ${page.title}`);
      return {
        label: `Read ${titles.length} page${titles.length === 1 ? "" : "s"}`,
        observation: titles.join("\n") || "No docs pages yet.",
      };
    }
    const page = ctx.drafts.get(slug);
    return {
      label: "Read 1 page",
      observation: page ? page.content.slice(0, 8_000) : `Page not found: ${slug || "(home)"}`,
    };
  }
  if (tool === "write_page") {
    if (!ctx.planApproved) {
      return {
        label: "Edited 0 pages",
        edited: 0,
        observation: "Page writes wait until the site owner approves a plan. Nothing was published.",
      };
    }
    const written = writePage(input, ctx.drafts);
    return {
      label: written ? "Edited 1 page" : "Edited 0 pages",
      edited: written ? 1 : 0,
      observation: written ? `Saved ${written.slug || "(home)"}: ${written.title}` : "Could not save that page. Provide a title and markdown content.",
    };
  }
  return { label: "Finished", observation: "" };
}

function writePage(input: Record<string, unknown>, drafts: Map<string, PageDraft>): PageDraft | null {
  const title = stringField(input.title).slice(0, 120);
  const content = stringField(input.content).slice(0, 100_000);
  if (!title || !content) return null;
  const slug = normalizeSlug(typeof input.slug === "string" ? input.slug : "") ?? "";
  const existing = drafts.get(slug);
  const page: PageDraft = {
    slug,
    section: stringField(input.section).slice(0, 80) || existing?.section || "Guides",
    title,
    description: stringField(input.description).slice(0, 280) || existing?.description || null,
    navOrder: existing?.navOrder ?? 10 + drafts.size,
    content,
  };
  drafts.set(slug, page);
  return page;
}

function stringField(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function addUsage(
  usage: { promptTokens: number; completionTokens: number; estimatedCostUsd: number },
  result: CompletionResult,
) {
  usage.promptTokens += result.promptTokens;
  usage.completionTokens += result.completionTokens;
  usage.estimatedCostUsd = Math.round((usage.estimatedCostUsd + result.estimatedCostUsd) * 1_000_000) / 1_000_000;
}
