"use client";

import { useActionState, useEffect, useId, useState } from "react";
import { toast } from "sonner";
import { createWorkspaceAction } from "@/app/(product)/dashboard/actions";
import { brandPrimary } from "@/lib/brand";
import { Button } from "@/components/ui/button";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
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

      <input type="hidden" name="reviewMode" value="REVIEW" />
      <div className="flex items-center justify-between text-sm">
        <span>Publishing</span>
        <span>Draft</span>
      </div>
      <FieldError>{errorFor(state, "reviewMode")}</FieldError>

      {formError ? <FieldError>{formError}</FieldError> : null}

      <Button type="submit" loading={pending} loadingText="Creating...">
        Create workspace
      </Button>
    </form>
  );
}
