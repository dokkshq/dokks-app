"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SubmitButton } from "@/components/ui/submit-button";
import { PLAN_SECTIONS } from "@/lib/copilot/components";
import type { DocsPlanView } from "@/lib/workspace/jobs";
import { approveDocsPlanAction } from "@/app/(product)/dashboard/w/[site]/actions";

export function PlanApproval({
  siteId,
  subdomain,
  jobId,
  plan,
}: {
  siteId: string;
  subdomain: string;
  jobId: string;
  plan: DocsPlanView;
}) {
  const [pages, setPages] = useState(plan.pages);
  const [productRoot, setProductRoot] = useState(plan.productRoot);
  const [selected, setSelected] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const sections = useMemo(() => PLAN_SECTIONS, []);

  function update(index: number, patch: Partial<(typeof pages)[number]>) {
    setPages((current) => current.map((page, item) => (item === index ? { ...page, ...patch } : page)));
  }

  function addPage() {
    setPages((current) => [
      ...current,
      { slug: "", title: "New page", section: "How-to", description: "", layout: "how-to" },
    ]);
  }

  function dropPage(index: number) {
    setPages((current) => current.filter((_, item) => item !== index));
    setSelected([]);
  }

  function mergeSelected() {
    if (selected.length < 2) {
      setError("Select two pages to merge.");
      return;
    }
    const [first, second] = selected;
    setPages((current) => {
      const into = current.find((page) => page.slug === first);
      const from = current.find((page) => page.slug === second);
      if (!into || !from) return current;
      return current
        .filter((page) => page.slug !== second)
        .map((page) =>
          page.slug === first
            ? {
                ...page,
                title: page.title,
                description: [page.description, `Also covers ${from.title}.`].filter(Boolean).join(" "),
              }
            : page,
        );
    });
    setSelected([]);
    setError(null);
  }

  return (
    <form action={approveDocsPlanAction} className="flex flex-col gap-3 rounded-control border border-border p-3">
      <input type="hidden" name="siteId" value={siteId} />
      <input type="hidden" name="subdomain" value={subdomain} />
      <input type="hidden" name="jobId" value={jobId} />
      <input type="hidden" name="productRoot" value={productRoot} />
      <input type="hidden" name="planJson" value={JSON.stringify(pages)} />
      <p className="text-sm">Outline waiting for approval</p>
      {plan.coverage ? <p className="text-sm text-muted-foreground">{plan.coverage}</p> : null}
      {plan.products.length > 1 ? (
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          Product
          <select
            value={productRoot}
            onChange={(event) => setProductRoot(event.target.value)}
            className="h-8 rounded-control border border-border bg-background px-2 text-sm text-foreground"
          >
            {plan.products.map((product) => (
              <option key={product.id} value={product.root}>
                {product.name}
              </option>
            ))}
          </select>
        </label>
      ) : null}
      <ul className="flex flex-col gap-2">
        {pages.map((page, index) => (
          <li key={`${page.slug}-${index}`} className="flex flex-col gap-1 rounded-control border border-border p-2">
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                aria-label={`Select ${page.title}`}
                checked={selected.includes(page.slug)}
                onChange={(event) => {
                  setSelected((current) =>
                    event.target.checked ? [...current, page.slug] : current.filter((slug) => slug !== page.slug),
                  );
                }}
              />
              <Input
                aria-label="Title"
                value={page.title}
                onChange={(event) => update(index, { title: event.target.value })}
              />
            </div>
            <div className="flex items-center gap-2">
              <select
                aria-label="Section"
                value={page.section}
                onChange={(event) => update(index, { section: event.target.value })}
                className="h-8 flex-1 rounded-control border border-border bg-background px-2 text-sm"
              >
                {sections.map((section) => (
                  <option key={section}>{section}</option>
                ))}
              </select>
              <Button type="button" variant="outline" size="sm" onClick={() => dropPage(index)}>
                Drop
              </Button>
            </div>
            <p className="truncate text-xs text-muted-foreground">{page.slug || "(home)"}</p>
          </li>
        ))}
      </ul>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      <div className="flex flex-wrap justify-end gap-2">
        <Button type="button" variant="outline" size="sm" onClick={addPage}>
          Add page
        </Button>
        <Button type="button" variant="outline" size="sm" onClick={mergeSelected}>
          Merge
        </Button>
        <SubmitButton size="sm">Approve outline</SubmitButton>
      </div>
    </form>
  );
}
