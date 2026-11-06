"use client";

import { useActionState, useEffect, useId, useState } from "react";
import { toast } from "sonner";
import { createWorkspaceAction } from "@/app/(product)/dashboard/actions";
import { brandPrimary, productName } from "@/lib/brand";
import { Button } from "@/components/ui/button";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Radio, RadioGroup } from "@/components/ui/radio-group";
import { SelectField } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  initialWorkspaceFormState,
  type ImportField,
  type WorkspaceFormState,
} from "@/lib/import/import-state";

function errorFor(state: WorkspaceFormState, field: ImportField): string | undefined {
  return state.error?.field === field ? state.error.message : undefined;
}

function slugify(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 63);
}

export function NewWorkspaceForm({ docsRoot }: { docsRoot: string }) {
  const id = useId();
  const [state, formAction, pending] = useActionState(
    createWorkspaceAction,
    initialWorkspaceFormState,
  );
  const [name, setName] = useState("");
  const [subdomain, setSubdomain] = useState("");
  const [subdomainTouched, setSubdomainTouched] = useState(false);
  const [primaryColor, setPrimaryColor] = useState(brandPrimary());
  const [reviewMode, setReviewMode] = useState<"AUTO_PUBLISH" | "REVIEW">("AUTO_PUBLISH");
  const formError = state.error?.field === "form" ? state.error.message : undefined;

  useEffect(() => {
    if (formError) toast.error(formError);
  }, [formError]);

  return (
    <form action={formAction} className="mx-auto flex max-w-xl flex-col gap-5">
      <Field data-invalid={Boolean(errorFor(state, "name"))}>
        <FieldLabel htmlFor={`${id}-name`}>Workspace name</FieldLabel>
        <Input
          id={`${id}-name`}
          name="name"
          value={name}
          onChange={(event) => {
            const next = event.currentTarget.value;
            setName(next);
            if (!subdomainTouched) setSubdomain(slugify(next));
          }}
          maxLength={80}
          required
          aria-invalid={Boolean(errorFor(state, "name"))}
        />
        <FieldError>{errorFor(state, "name")}</FieldError>
      </Field>

      <Field data-invalid={Boolean(errorFor(state, "subdomain"))}>
        <FieldLabel htmlFor={`${id}-subdomain`}>Subdomain</FieldLabel>
        <div className="flex items-stretch">
          <Input
            id={`${id}-subdomain`}
            name="subdomain"
            value={subdomain}
            onChange={(event) => {
              setSubdomainTouched(true);
              setSubdomain(event.currentTarget.value.toLowerCase());
            }}
            minLength={2}
            maxLength={63}
            pattern="[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?"
            autoCapitalize="none"
            spellCheck={false}
            required
            aria-invalid={Boolean(errorFor(state, "subdomain"))}
            className="rounded-r-none border-r-0"
          />
          <span className="flex items-center rounded-r-control border border-input bg-muted px-2.5 text-sm text-muted-foreground">
            .{docsRoot}
          </span>
        </div>
        <FieldDescription>
          Docs will live at {subdomain || "subdomain"}.{docsRoot} after the first build.
        </FieldDescription>
        <FieldError>{errorFor(state, "subdomain")}</FieldError>
      </Field>

      <Field data-invalid={Boolean(errorFor(state, "description"))}>
        <FieldLabel htmlFor={`${id}-description`}>Description</FieldLabel>
        <Textarea
          id={`${id}-description`}
          name="description"
          maxLength={280}
          placeholder="Optional short description"
          aria-invalid={Boolean(errorFor(state, "description"))}
        />
        <FieldError>{errorFor(state, "description")}</FieldError>
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field data-invalid={Boolean(errorFor(state, "theme"))}>
          <FieldLabel htmlFor={`${id}-theme`}>Theme</FieldLabel>
          <SelectField
            id={`${id}-theme`}
            name="theme"
            defaultValue="MINIMAL"
            aria-invalid={Boolean(errorFor(state, "theme"))}
            options={[
              { value: "MINIMAL", label: "Minimal" },
              { value: "LEDGER", label: "Ledger" },
            ]}
          />
          <FieldError>{errorFor(state, "theme")}</FieldError>
        </Field>

        <Field data-invalid={Boolean(errorFor(state, "primaryColor"))}>
          <FieldLabel htmlFor={`${id}-primary-color`}>Primary color</FieldLabel>
          <div className="flex items-center gap-2">
            <span
              aria-hidden
              className="size-8 shrink-0 rounded-control border border-border"
              style={{ backgroundColor: primaryColor }}
            />
            <Input
              id={`${id}-primary-color`}
              name="primaryColor"
              value={primaryColor}
              onChange={(event) => setPrimaryColor(event.currentTarget.value)}
              spellCheck={false}
              aria-invalid={Boolean(errorFor(state, "primaryColor"))}
            />

          </div>
          <FieldError>{errorFor(state, "primaryColor")}</FieldError>
        </Field>
      </div>

      <Field data-invalid={Boolean(errorFor(state, "reviewMode"))}>
        <FieldLabel>How should updates work?</FieldLabel>
        <RadioGroup
          name="reviewMode"
          value={reviewMode}
          onValueChange={(value) => {
            if (value === "AUTO_PUBLISH" || value === "REVIEW") setReviewMode(value)
          }}
          className="grid gap-2"
        >
          <label className="cursor-pointer rounded-control border border-border p-3 has-data-checked:border-foreground has-data-checked:bg-muted/40">
            <span className="flex items-start gap-3">
              <Radio value="AUTO_PUBLISH" className="mt-1" />
              <span>
                <span className="block text-sm font-medium">Auto-publish updates</span>
                <span className="mt-1 block text-xs text-muted-foreground">
                  When you push to GitHub, {productName()} updates your live docs automatically.
                </span>
              </span>
            </span>
          </label>
          <label className="cursor-pointer rounded-control border border-border p-3 has-data-checked:border-foreground has-data-checked:bg-muted/40">
            <span className="flex items-start gap-3">
              <Radio value="REVIEW" className="mt-1" />
              <span>
                <span className="block text-sm font-medium">Review changes first</span>
                <span className="mt-1 block text-xs text-muted-foreground">
                  {productName()} prepares changes, and live docs stay unchanged until you approve them.
                </span>
              </span>
            </span>
          </label>
        </RadioGroup>
        <FieldError>{errorFor(state, "reviewMode")}</FieldError>
      </Field>

      {formError ? <FieldError>{formError}</FieldError> : null}

      <Button type="submit" loading={pending} loadingText="Creating...">
        Create workspace
      </Button>
    </form>
  );
}
