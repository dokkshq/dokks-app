import { NewWorkspaceForm } from "./new-workspace-form";
import { PageHeader } from "@/components/shell/page-header";
import { getViewSession } from "@/lib/admin/act-as";
import { docsRootDomain } from "@/lib/config";

export const dynamic = "force-dynamic";

export default async function NewWorkspacePage() {
  const session = await getViewSession();
  if (!session) return null;
  return (
    <>
      <PageHeader
        title="New workspace"
        description="Create an empty workspace, then import a GitHub repository inside it to start the first docs build."
      />
      <NewWorkspaceForm docsRoot={docsRootDomain()} />
    </>
  );
}
