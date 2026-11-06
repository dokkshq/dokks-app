import { getViewSession } from "@/lib/admin/act-as";
import { loadWorkspaceActivity } from "@/lib/workspace/load";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, context: { params: Promise<{ site: string }> }) {
  const session = await getViewSession();
  if (!session) return Response.json({ error: "Sign in required." }, { status: 401 });
  const jobs = await loadWorkspaceActivity(session, (await context.params).site);
  if (!jobs) return Response.json({ error: "Workspace not found." }, { status: 404 });
  return Response.json({ jobs });
}
