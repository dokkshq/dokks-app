export type ChatTurn = "question" | "edit" | "both";

const EDIT_VERB =
  /\b(change|update|rewrite|shorten|edit|add|remove|delete|fix|make|rename|replace|write|drop|move)\b/i;
const QUESTION_START =
  /^(what|why|how|who|when|where|which|does|do|is|are|can|could|would|explain|tell me|describe)\b/i;

export function classifyChatTurn(instruction: string): ChatTurn {
  const text = instruction.trim();
  const asks = text.endsWith("?") || QUESTION_START.test(text);
  const edits = EDIT_VERB.test(text);
  if (asks && edits) return "both";
  if (edits) return "edit";
  return "question";
}
