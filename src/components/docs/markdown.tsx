import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { parseDocsBlocks } from "@/components/docs/blocks";
import { CodeBlock } from "@/components/docs/code-block";
import { DocsBlockView, LayoutMark } from "@/components/docs/docs-blocks";
import { nextHeadingId } from "@/components/docs/highlight";

export function prepareDocsMarkdown(content: string): string {
  const withoutSources = content.replace(/\n*<!--\s*sources:[\s\S]*?-->\s*/g, "\n").trim();
  return withoutSources
    .replace(/^> \[!(NOTE|TIP|WARNING|IMPORTANT|CAUTION|DANGER)\]\n((?:>.*(?:\n|$))+)/gm, (_full, kind: string, body: string) => {
      const text = body.replace(/^> ?/gm, "").trim();
      return `\n\`\`\`opentip-${kind.toLowerCase()}\n${text}\n\`\`\`\n`;
    })
    .replace(/:::steps\n([\s\S]*?)\n:::/g, (_full, body: string) => {
      return `\n\`\`\`opentip-steps\n${body.trim()}\n\`\`\`\n`;
    });
}

export function DocsMarkdown({ content }: { content: string }) {
  const parsed = parseDocsBlocks(content);
  return (
    <div className="flex flex-col gap-4">
      <LayoutMark layout={parsed.layout} />
      {parsed.blocks.map((block, index) =>
        block.type === "markdown" ? (
          <MarkdownBody key={index} content={block.text} />
        ) : (
          <DocsBlockView key={index} block={block} />
        ),
      )}
    </div>
  );
}

function MarkdownBody({ content }: { content: string }) {
  const counts = new Map<string, number>();
  const prepared = prepareDocsMarkdown(content);
  return (
    <div className="flex flex-col gap-4">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          p: ({ children }) => <p className="text-[15px] leading-7">{children}</p>,
          a: ({ href, children }) => (
            <a href={href} className="text-(--docs-primary) underline underline-offset-4">
              {children}
            </a>
          ),
          ul: ({ children }) => (
            <ul className="flex list-disc flex-col gap-2 pl-5 text-[15px] leading-7">{children}</ul>
          ),
          ol: ({ children }) => (
            <ol className="flex list-decimal flex-col gap-2 pl-5 text-[15px] leading-7">{children}</ol>
          ),
          blockquote: ({ children }) => (
            <blockquote className="border-l-2 border-(--docs-primary) pl-4 text-muted-foreground">
              {children}
            </blockquote>
          ),
          h2: ({ children }) => {
            const text = nodeText(children);
            return (
              <h2 id={nextHeadingId(text, counts)} className="pt-2 text-xl tracking-tight">
                {children}
              </h2>
            );
          },
          h3: ({ children }) => {
            const text = nodeText(children);
            return (
              <h3 id={nextHeadingId(text, counts)} className="pt-2 text-lg tracking-tight">
                {children}
              </h3>
            );
          },
          pre: ({ children }) => <>{children}</>,
          code: ({ className, children }) => {
            const text = String(children).replace(/\n$/, "");
            const language = /language-([\w-]+)/.exec(className ?? "")?.[1];
            if (language?.startsWith("opentip-")) {
              return <Callout kind={language.slice("opentip-".length)} text={text} />;
            }
            if (language || text.includes("\n")) {
              return <CodeBlock code={text} language={language ?? "text"} />;
            }
            return (
              <code className="rounded bg-muted px-1 py-0.5 font-mono text-[13px]">{children}</code>
            );
          },
        }}
      >
        {prepared}
      </ReactMarkdown>
    </div>
  );
}

function Callout({ kind, text }: { kind: string; text: string }) {
  if (kind === "steps") {
    const items = text
      .split("\n")
      .map((line) => line.replace(/^\d+[.)]\s*/, "").trim())
      .filter(Boolean);
    return (
      <ol className="flex list-decimal flex-col gap-3 rounded-control border border-border bg-muted/40 p-4 pl-9 text-[15px] leading-7">
        {items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ol>
    );
  }
  const label = kind === "danger" ? "Danger" : kind === "warning" || kind === "caution" ? "Warning" : kind === "tip" ? "Tip" : kind === "important" ? "Important" : "Note";
  return (
    <aside className="rounded-control border border-border bg-muted/50 px-4 py-3">
      <p className="font-mono text-[11px] tracking-widest text-(--docs-primary) uppercase">{label}</p>
      <p className="mt-1 text-[15px] leading-7">{text}</p>
    </aside>
  );
}

function nodeText(children: React.ReactNode): string {
  if (typeof children === "string" || typeof children === "number") return String(children);
  if (Array.isArray(children)) return children.map(nodeText).join("");
  if (children && typeof children === "object" && "props" in children) {
    const props = (children as { props?: { children?: React.ReactNode } }).props;
    return nodeText(props?.children);
  }
  return "";
}
