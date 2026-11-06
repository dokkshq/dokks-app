export const DEFAULT_HEAVY_MODEL = "grok-build-0.1";
export const HEAVY_MODEL_CONFIG_OPTION = "grok-4.7";
export const DEFAULT_SMALL_MODEL = "grok-build-0.1";

export type TaskSize = "heavy" | "small";
export type ProviderId = "xai" | "fake";
export type CopilotJobKind =
  | "FIRST_BUILD"
  | "PUSH_UPDATE"
  | "CHAT_EDIT"
  | "SUMMARY_REFRESH";

export type ModelChoice = {
  provider: "xai";
  model: string;
  task: TaskSize;
};

export function selectModel(
  task: TaskSize,
  env: { XAI_HEAVY_MODEL?: string; XAI_SMALL_MODEL?: string } = {},
): ModelChoice {
  if (task === "heavy") {
    return {
      provider: "xai",
      model: env.XAI_HEAVY_MODEL?.trim() || DEFAULT_HEAVY_MODEL,
      task,
    };
  }
  return {
    provider: "xai",
    model: env.XAI_SMALL_MODEL?.trim() || DEFAULT_SMALL_MODEL,
    task,
  };
}

export function taskSizeForJob(
  kind: CopilotJobKind,
  instruction?: string,
): TaskSize {
  if (kind === "FIRST_BUILD") return "heavy";
  if (kind === "CHAT_EDIT" && (instruction?.length ?? 0) > 2_000) return "heavy";
  return "small";
}

export function pageWriteMode(page: { handEdited: boolean }): "update" | "skip" {
  return page.handEdited ? "skip" : "update";
}
