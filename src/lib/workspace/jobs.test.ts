import { describe, expect, it } from "vitest";
import { jobFailureReason } from "@/lib/workspace/jobs";

describe("jobFailureReason", () => {
  it("prefers job.error", () => {
    expect(
      jobFailureReason({
        error: "No credits left.",
        detail: "Build failed",
        events: [{ id: "1", sequence: 1, level: "error", message: "ignored", createdAt: "" }],
      }),
    ).toBe("No credits left.");
  });

  it("falls back to the latest error event, then detail", () => {
    expect(
      jobFailureReason({
        error: null,
        detail: "Build failed",
        events: [
          { id: "1", sequence: 1, level: "info", message: "Reading", createdAt: "" },
          { id: "2", sequence: 2, level: "error", message: "GitHub 404", createdAt: "" },
        ],
      }),
    ).toBe("GitHub 404");
    expect(
      jobFailureReason({
        error: "  ",
        detail: "Waiting for worker",
        events: [],
      }),
    ).toBe("Waiting for worker");
  });
});
