export type ImportField =
  | "name"
  | "subdomain"
  | "description"
  | "theme"
  | "primaryColor"
  | "reviewMode";

export type ImportFormState = {
  error: { field: ImportField | "form"; message: string } | null;
};

export const initialImportFormState: ImportFormState = { error: null };

export type WorkspaceFormState = ImportFormState;

export const initialWorkspaceFormState: WorkspaceFormState = { error: null };
