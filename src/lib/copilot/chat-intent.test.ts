import { describe, expect, it } from "vitest";
import { classifyChatTurn } from "@/lib/copilot/chat-intent";

describe("classifyChatTurn", () => {
  it("treats a question as a question", () => {
    expect(classifyChatTurn("What does the home page say?")).toBe("question");
    expect(classifyChatTurn("Explain how import works")).toBe("question");
  });

  it("treats a change request as an edit", () => {
    expect(classifyChatTurn("Make the home page shorter")).toBe("edit");
  });

  it("treats a question that also asks for a change as both", () => {
    expect(classifyChatTurn("Why is this so long, and can you shorten it?")).toBe("both");
  });
});