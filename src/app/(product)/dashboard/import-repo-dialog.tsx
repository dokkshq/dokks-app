"use client";

import { useActionState, useEffect, useId, useState } from "react";
import { toast } from "sonner";
import { brandPrimary, productName } from "@/lib/brand";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
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
import type { ImportField, ImportFormState } from "@/lib/import/import-state";
import { initialImportFormState } from "@/lib/import/import-state";
import type { ImportRepo } from "@/lib/import/types";
import { importRepository } from "./actions";

type ImportRepoDialogProps = {
  repo: ImportRepo;
  docsRoot: string;
  isFirstSite: boolean;
};

function errorFor(state: ImportFormState, field: ImportField): string | undefined {
  return state.error?.field === field ? state.error.message : undefined;
}

function ImportForm({ repo, docsRoot, isFirstSite }: ImportRepoDialogProps) {
  const id = useId();
  const [state, formAction, pending] = useActionState(
    importRepository,
    initialImportFormState,
  );
  const [subdomain, setSubdomain] = useState(repo.suggestedSubdomain);
  const [primaryColor, setPrimaryColor] = useState(brandPrimary());
  const [reviewMode, setReviewMode] = useState<"AUTO_PUBLISH" | "REVIEW">("AUTO_PUBLISH");
  const formError = state.error?.field === "form" ? state.error.message : undefined;

  useEffect(() => {
    if (formError) toast.error(formError);
  }, [formError]);

  return (
    <form action={formAction} className="flex flex-col gap-5">
      <input type="hidden" name="repoId" value={repo.id} />

      <div className="rounded-control border border-border bg-muted/40 px-3 py-2">
        <p className="text-xs text-muted-foreground">Repository</p>
        <p className="truncate text-sm font-medium">{repo.fullName}</p>
      </div>

      <Field data-invalid={Boolean(errorFor(state, "name"))}>
        <FieldLabel htmlFor={`${id}-name`}>Site name</FieldLabel>
        <Input
          id={`${id}-name`}
          name="name"
          defaultValue={repo.name}
          maxLength={80}
          required
          aria-invalid={Boolean(errorFor(state, "name"))}
        />
        <FieldDescription>The name shown in the site header and dashboard.</FieldDescription>
        <FieldError>{errorFor(state, "name")}</FieldError>
      </Field>

      <Field data-invalid={Boolean(errorFor(state, "subdomain"))}>
        <FieldLabel htmlFor={`${id}-subdomain`}>Subdomain</FieldLabel>
        <div className="flex items-stretch">
          <Input
            id={`${id}-subdomain`}
            name="subdomain"
            value={subdomain}
            onChange={(event) => setSubdomain(event.currentTarget.value.toLowerCase())}
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
          Your docs will live at {subdomain || "subdomain"}.{docsRoot}
        </FieldDescription>
        <FieldError>{errorFor(state, "subdomain")}</FieldError>
      </Field>

      <Field data-invalid={Boolean(errorFor(state, "description"))}>
        <FieldLabel htmlFor={`${id}-description`}>Description</FieldLabel>
        <Textarea
          id={`${id}-description`}
          name="description"
          maxLength={280}
          placeholder="Short description of these docs"
          aria-invalid={Boolean(errorFor(state, "description"))}
        />
        <FieldDescription>Optional. Used for search results and social previews.</FieldDescription>
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
                  When you push to GitHub, {productName()} updates your live docs automatically. Best for most teams.
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
                  {productName()} prepares the changes, but your live docs stay unchanged until you approve them. Best for public or sensitive docs.
                </span>
              </span>
            </span>
          </label>
        </RadioGroup>
        {isFirstSite ? (
          <FieldDescription>
            This is your first site. You can change this later in site settings.
          </FieldDescription>
        ) : (
          <FieldDescription>You can change this later in site settings.</FieldDescription>
        )}
        <FieldError>{errorFor(state, "reviewMode")}</FieldError>
      </Field>

      {formError ? <FieldError>{formError}</FieldError> : null}

      <p className="text-xs text-muted-foreground">
        Nothing is created until you click Start build. You will stay in the workspace chat to watch the agent.
      </p>

      <DialogFooter>
        <DialogClose render={<Button type="button" variant="outline" />}>
          Cancel
        </DialogClose>
        <Button type="submit" loading={pending} loadingText="Starting build...">
          Start build
        </Button>
      </DialogFooter>
    </form>
  );
}

export function ImportRepoDialog({ repo, docsRoot, isFirstSite }: ImportRepoDialogProps) {
  return (
    <Dialog>
      <DialogTrigger render={<Button size="sm" />}>Import</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Import {repo.fullName}</DialogTitle>
          <DialogDescription>
            Name the site and choose how it looks. The first build starts when you click Build site.
          </DialogDescription>
        </DialogHeader>
        <ImportForm repo={repo} docsRoot={docsRoot} isFirstSite={isFirstSite} />
      </DialogContent>
    </Dialog>
  );
}
