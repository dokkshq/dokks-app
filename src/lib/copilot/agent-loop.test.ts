import { describe, expect, it } from "vitest";
import { runAgentLoop } from "@/lib/copilot/agent-loop";
import type { CopilotProvider } from "@/lib/copilot/providers";

function provider(steps: string[]): CopilotProvider {
  let index = 0;
  return {
    id: "fake",
    model: "test",
    task: "heavy",
    async complete() {
      const text = steps[Math.min(index, steps.length - 1)] ?? "";
      index += 1;
      return {
        text,
        provider: "fake",
        model: "test",
        promptTokens: 10,
        completionTokens: 5,
        estimatedCostUsd: 0.01,
      };
    },
  };
}

const files = [
  { path: "README.md", content: "# Plugr\n\nStudents find gigs.\n" },
  { path: "src/app/gigs/page.tsx", content: "<h1>Find a gig</h1>" },
];

describe("runAgentLoop", () => {
  it("stops on finish and does not write pages when none were written", async () => {
    const result = await runAgentLoop({
      model: provider([
        JSON.stringify({
          thought: "The user asked a question.",
          say: "I'll read the docs first.",
          tool: "read_pages",
          input: {},
        }),
        JSON.stringify({
          thought: "I can answer.",
          say: "The home page introduces Plugr.",
          tool: "finish",
          input: { reply: "The home page introduces Plugr." },
        }),
      ]),
      goal: "What does the home page say?",
      siteName: "Plugr",
      files,
      treePaths: files.map((file) => file.path),
      pages: [{ slug: "", section: "Introduction", title: "Plugr", description: null, navOrder: 0, content: "Welcome" }],
      maxSteps: 8,
    });
    expect(result.finished).toBe(true);
    expect(result.reply).toBe("The home page introduces Plugr.");
    expect(result.pages).toHaveLength(1);
    expect(result.pages[0]?.content).toBe("Welcome");
  });

  it("does not write a home page before a plan is approved", async () => {
    const result = await runAgentLoop({
      model: provider([
        JSON.stringify({
          thought: "The home page should be shorter.",
          say: "I'll rewrite the home page.",
          tool: "write_page",
          input: { slug: "", title: "Plugr", section: "Introduction", content: "Students find gigs." },
        }),
        JSON.stringify({
          thought: "Done.",
          say: "Stopped.",
          tool: "finish",
          input: { reply: "I could not publish the home page." },
        }),
      ]),
      goal: "Make the home page shorter",
      siteName: "Plugr",
      files,
      treePaths: files.map((file) => file.path),
      pages: [{ slug: "", section: "Introduction", title: "Plugr", description: null, navOrder: 0, content: "A very long welcome" }],
      maxSteps: 8,
    });
    expect(result.pages.find((page) => page.slug === "")?.content).toBe("A very long welcome");
  });

  it("writes a page after the plan is approved", async () => {
    const events: string[] = [];
    const result = await runAgentLoop({
      model: provider([
        JSON.stringify({
          thought: "The home page should be shorter.",
          say: "I'll rewrite the home page.",
          tool: "write_page",
          input: { slug: "", title: "Plugr", section: "Introduction", content: "Students find gigs." },
        }),
        JSON.stringify({
          thought: "Done.",
          say: "The home page is shorter.",
          tool: "finish",
          input: { reply: "I shortened the home page." },
        }),
      ]),
      goal: "Make the home page shorter",
      siteName: "Plugr",
      files,
      treePaths: files.map((file) => file.path),
      pages: [{ slug: "", section: "Introduction", title: "Plugr", description: null, navOrder: 0, content: "A very long welcome" }],
      maxSteps: 8,
      planApproved: true,
      onEvent: (event) => {
        events.push(event.message);
      },
    });
    expect(result.pages.find((page) => page.slug === "")?.content).toBe("Students find gigs.");
    expect(events).toContain("Edited 1 page");
  });

  it("stops when the model never finishes", async () => {
    const result = await runAgentLoop({
      model: provider([
        JSON.stringify({ thought: "Looking.", say: "I'll list the files.", tool: "list_tree", input: {} }),
      ]),
      goal: "Write the docs",
      siteName: "Plugr",
      files,
      treePaths: files.map((file) => file.path),
      pages: [],
      maxSteps: 2,
    });
    expect(result.finished).toBe(false);
    expect(result.reply).toMatch(/stopped/i);
  });
});
