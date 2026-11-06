export type DocsBlock =
  | { type: "markdown"; text: string }
  | { type: "cards"; cards: Array<{ title: string; href: string; body: string }> }
  | { type: "steps"; steps: string[] }
  | { type: "tabs"; tabs: Array<{ label: string; body: string }> }
  | { type: "code-group"; groups: Array<{ label: string; language: string; code: string }> }
  | { type: "accordion"; items: Array<{ title: string; body: string }> }
  | { type: "callout"; kind: "note" | "tip" | "warning" | "danger"; text: string }
  | { type: "frame"; alt: string; src: string | null }
  | { type: "tree"; text: string }
  | { type: "fields"; fields: Array<{ name: string; type: string; required: boolean; description: string }> }
  | { type: "request"; text: string }
  | { type: "response"; text: string }
  | { type: "banner"; text: string }
  | { type: "badge"; text: string }
  | { type: "tooltip"; term: string; text: string }
  | { type: "prompt"; text: string };

const NAMED = new Set([
  "cards",
  "steps",
  "tabs",
  "code-group",
  "accordion",
  "frame",
  "tree",
  "fields",
  "request",
  "response",
  "banner",
  "badge",
  "tooltip",
  "prompt",
  "note",
  "tip",
  "warning",
  "danger",
]);

export function readPageLayout(content: string): string | null {
  const match = content.match(/<!--\s*layout:\s*([\w-]+)\s*-->/i);
  return match?.[1] ?? null;
}

export function parseDocsBlocks(content: string): { layout: string | null; blocks: DocsBlock[] } {
  const layout = readPageLayout(content);
  const source = content.replace(/<!--\s*layout:\s*[\w-]+\s*-->/gi, "").replace(/\n*<!--\s*sources:[\s\S]*?-->\s*/g, "\n");
  const lines = source.split("\n");
  const blocks: DocsBlock[] = [];
  const markdown: string[] = [];
  const flush = () => {
    const text = markdown.join("\n").trim();
    markdown.length = 0;
    if (text) blocks.push({ type: "markdown", text });
  };
  for (let index = 0; index < lines.length; index += 1) {
    const open = lines[index]?.match(/^:::([a-z-]+)\s*$/);
    if (!open || !NAMED.has(open[1])) {
      markdown.push(lines[index] ?? "");
      continue;
    }
    const body: string[] = [];
    index += 1;
    while (index < lines.length && lines[index] !== ":::") {
      body.push(lines[index] ?? "");
      index += 1;
    }
    flush();
    const block = buildBlock(open[1], body.join("\n").trim());
    if (block) blocks.push(block);
  }
  flush();
  return { layout, blocks };
}

function buildBlock(name: string, body: string): DocsBlock | null {
  if (name === "note" || name === "tip" || name === "warning" || name === "danger") {
    return { type: "callout", kind: name, text: body };
  }
  if (name === "cards") return { type: "cards", cards: parseCards(body) };
  if (name === "steps") {
    const steps = body
      .split("\n")
      .map((line) => line.replace(/^\d+[.)]\s*/, "").trim())
      .filter(Boolean);
    return steps.length > 0 ? { type: "steps", steps } : null;
  }
  if (name === "tabs") return { type: "tabs", tabs: parseSections(body) };
  if (name === "code-group") return { type: "code-group", groups: parseCodeGroup(body) };
  if (name === "accordion") return { type: "accordion", items: parseSections(body) };
  if (name === "frame") {
    const image = body.match(/!\[([^\]]*)\]\(([^)\s]+)\)/);
    return { type: "frame", alt: image?.[1] ?? "", src: image?.[2] ?? null };
  }
  if (name === "tree") return body ? { type: "tree", text: body } : null;
  if (name === "fields") return { type: "fields", fields: parseFields(body) };
  if (name === "request") return body ? { type: "request", text: body } : null;
  if (name === "response") return body ? { type: "response", text: body } : null;
  if (name === "banner") return body ? { type: "banner", text: body } : null;
  if (name === "badge") return body ? { type: "badge", text: body } : null;
  if (name === "tooltip") {
    const [term, ...rest] = body.split("|");
    const text = rest.join("|").trim();
    if (!term?.trim() || !text) return null;
    return { type: "tooltip", term: term.trim(), text };
  }
  if (name === "prompt") return body ? { type: "prompt", text: body } : null;
  return null;
}

function parseCards(body: string): Array<{ title: string; href: string; body: string }> {
  return body
    .split(/\n---\n/)
    .map((part) => {
      const lines = part.trim().split("\n");
      const link = lines[0]?.match(/^\[([^\]]+)\]\(([^)\s]+)\)/);
      if (!link) return null;
      return { title: link[1], href: link[2], body: lines.slice(1).join(" ").trim() };
    })
    .filter((card): card is { title: string; href: string; body: string } => card !== null);
}

function parseSections(body: string): Array<{ label: string; body: string; title: string }> {
  const parts = body.split(/\n(?=== )/g);
  return parts
    .map((part) => {
      const lines = part.trim().split("\n");
      const label = lines[0]?.replace(/^==\s*/, "").trim() ?? "";
      const text = lines.slice(1).join("\n").trim();
      if (!label) return null;
      return { label, title: label, body: text };
    })
    .filter((item): item is { label: string; body: string; title: string } => item !== null);
}

function parseCodeGroup(body: string): Array<{ label: string; language: string; code: string }> {
  return parseSections(body).map((section) => {
    const [language, ...labelParts] = section.label.split(" ");
    const fenced = section.body.match(/^```[^\n]*\n([\s\S]*?)\n```$/);
    return {
      language: language || "text",
      label: labelParts.join(" ") || language || "code",
      code: (fenced?.[1] ?? section.body).trim(),
    };
  });
}

function parseFields(body: string): Array<{ name: string; type: string; required: boolean; description: string }> {
  return body
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [name, type, flag, ...rest] = line.split("|").map((part) => part.trim());
      return {
        name: name || "field",
        type: type || "string",
        required: (flag || "").toLowerCase() !== "optional",
        description: rest.join(" | "),
      };
    });
}
