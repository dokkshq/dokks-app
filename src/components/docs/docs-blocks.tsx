"use client";

import { useState } from "react";
import type { DocsBlock } from "@/components/docs/blocks";
import { CodeBlock } from "@/components/docs/code-block";

const LAYOUT_LABEL: Record<string, string> = {
  overview: "Overview",
  "get-started": "Get started",
  concept: "Concept",
  "how-to": "How-to",
  reference: "Reference",
  troubleshooting: "Troubleshooting",
};

export function LayoutMark({ layout }: { layout: string | null }) {
  if (!layout || !LAYOUT_LABEL[layout]) return null;
  return (
    <p className="font-mono text-[11px] tracking-widest text-(--docs-primary) uppercase">{LAYOUT_LABEL[layout]}</p>
  );
}

export function DocsBlockView({ block }: { block: Exclude<DocsBlock, { type: "markdown" }> }) {
  if (block.type === "cards") {
    return (
      <div className="grid gap-3 sm:grid-cols-2">
        {block.cards.map((card) => (
          <a key={card.href} href={card.href} className="rounded-control border border-border p-4 no-underline">
            <span className="block text-sm font-medium text-(--docs-primary)">{card.title}</span>
            {card.body ? <span className="mt-1 block text-sm text-muted-foreground">{card.body}</span> : null}
          </a>
        ))}
      </div>
    );
  }
  if (block.type === "steps") {
    return (
      <ol className="flex list-decimal flex-col gap-3 rounded-control border border-border bg-muted/40 p-4 pl-9 text-[15px] leading-7">
        {block.steps.map((step) => (
          <li key={step}>{step}</li>
        ))}
      </ol>
    );
  }
  if (block.type === "tabs") return <Tabs tabs={block.tabs} />;
  if (block.type === "code-group") {
    return (
      <Tabs
        tabs={block.groups.map((group) => ({
          label: group.label,
          body: group.code,
          language: group.language,
        }))}
      />
    );
  }
  if (block.type === "accordion") return <Accordion items={block.items} />;
  if (block.type === "callout") return <Callout kind={block.kind} text={block.text} />;
  if (block.type === "frame") {
    if (!block.src) return null;
    return (
      <figure className="overflow-hidden rounded-control border border-border">
        {/* Docs frames point at repo images, not the app image optimizer. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={block.src} alt={block.alt} className="w-full" />
      </figure>
    );
  }
  if (block.type === "tree") {
    return (
      <pre className="overflow-x-auto rounded-control border border-border bg-muted/40 p-4 font-mono text-[13px] leading-6">
        {block.text}
      </pre>
    );
  }
  if (block.type === "fields") {
    return (
      <div className="overflow-x-auto rounded-control border border-border">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-border text-xs tracking-wide text-muted-foreground uppercase">
            <tr>
              <th className="px-3 py-2 font-medium">Field</th>
              <th className="px-3 py-2 font-medium">Type</th>
              <th className="px-3 py-2 font-medium">Description</th>
            </tr>
          </thead>
          <tbody>
            {block.fields.map((field) => (
              <tr key={field.name} className="border-b border-border last:border-0">
                <td className="px-3 py-2 font-mono text-[13px]">
                  {field.name}
                  {field.required ? <span className="ml-2 text-[11px] text-muted-foreground">required</span> : null}
                </td>
                <td className="px-3 py-2 font-mono text-[13px]">{field.type}</td>
                <td className="px-3 py-2">{field.description}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }
  if (block.type === "request" || block.type === "response") {
    return (
      <div>
        <p className="mb-1 font-mono text-[11px] tracking-widest text-muted-foreground uppercase">
          {block.type === "request" ? "Request" : "Response"}
        </p>
        <CodeBlock code={block.text} language="text" />
      </div>
    );
  }
  if (block.type === "banner") {
    return <p className="rounded-control border border-(--docs-primary) bg-muted/40 px-4 py-3 text-sm">{block.text}</p>;
  }
  if (block.type === "badge") {
    return (
      <span className="inline-flex w-fit rounded-control border border-border px-2 py-0.5 font-mono text-[11px] tracking-wide uppercase">
        {block.text}
      </span>
    );
  }
  if (block.type === "tooltip") {
    return (
      <p className="text-[15px] leading-7">
        <abbr title={block.text} className="cursor-help border-b border-dotted border-muted-foreground no-underline">
          {block.term}
        </abbr>
      </p>
    );
  }
  return (
    <pre className="overflow-x-auto rounded-control border border-border bg-muted/40 p-4 font-mono text-[13px] leading-6">
      {block.text}
    </pre>
  );
}

function Callout({ kind, text }: { kind: string; text: string }) {
  const label = kind === "warning" ? "Warning" : kind === "danger" ? "Danger" : kind === "tip" ? "Tip" : "Note";
  const tone =
    kind === "danger"
      ? "border-destructive/40 bg-destructive/5"
      : kind === "warning"
        ? "border-amber-500/40 bg-amber-500/5"
        : "border-border bg-muted/50";
  return (
    <aside className={`rounded-control border px-4 py-3 ${tone}`}>
      <p className="font-mono text-[11px] tracking-widest text-(--docs-primary) uppercase">{label}</p>
      <p className="mt-1 text-[15px] leading-7 whitespace-pre-wrap">{text}</p>
    </aside>
  );
}

function Tabs({
  tabs,
}: {
  tabs: Array<{ label: string; body: string; language?: string }>;
}) {
  const [active, setActive] = useState(0);
  const current = tabs[active] ?? tabs[0];
  if (!current) return null;
  return (
    <div className="overflow-hidden rounded-control border border-border">
      <div className="flex gap-1 border-b border-border bg-muted/40 p-1" role="tablist">
        {tabs.map((tab, index) => (
          <button
            key={tab.label}
            type="button"
            role="tab"
            aria-selected={index === active}
            onClick={() => setActive(index)}
            className={
              index === active
                ? "rounded-control bg-background px-3 py-1 text-sm"
                : "rounded-control px-3 py-1 text-sm text-muted-foreground"
            }
          >
            {tab.label}
          </button>
        ))}
      </div>
      {current.language ? (
        <CodeBlock code={current.body} language={current.language} />
      ) : (
        <div className="p-4 text-[15px] leading-7 whitespace-pre-wrap">{current.body}</div>
      )}
    </div>
  );
}

function Accordion({ items }: { items: Array<{ title: string; body: string }> }) {
  const [open, setOpen] = useState<number | null>(null);
  return (
    <div className="flex flex-col divide-y divide-border rounded-control border border-border">
      {items.map((item, index) => (
        <div key={item.title}>
          <button
            type="button"
            className="flex w-full items-center justify-between px-4 py-3 text-left text-sm"
            aria-expanded={open === index}
            onClick={() => setOpen((current) => (current === index ? null : index))}
          >
            {item.title}
            <span className="text-muted-foreground">{open === index ? "▾" : "▸"}</span>
          </button>
          {open === index ? <p className="px-4 pb-3 text-[15px] leading-7">{item.body}</p> : null}
        </div>
      ))}
    </div>
  );
}
