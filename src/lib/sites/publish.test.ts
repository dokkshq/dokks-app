import { describe, expect, it } from "vitest";
import {
  canWriteGeneratedPage,
  shouldPublishImmediately,
} from "@/lib/sites/publish";

describe("publish rules", () => {
  it("leaves generated docs as a draft, including auto mode", () => {
    expect(
      shouldPublishImmediately({ reviewMode: "AUTO_PUBLISH", source: "FIRST_BUILD" }),
    ).toBe(false);
    expect(
      shouldPublishImmediately({ reviewMode: "AUTO_PUBLISH", source: "PUSH_UPDATE" }),
    ).toBe(false);
    expect(
      shouldPublishImmediately({ reviewMode: "REVIEW", source: "FIRST_BUILD" }),
    ).toBe(false);
    expect(
      shouldPublishImmediately({ reviewMode: "AUTO_PUBLISH", source: "CHAT_EDIT" }),
    ).toBe(false);
  });

  it("never overwrites hand edited pages except through chat review", () => {
    expect(
      canWriteGeneratedPage({ handEdited: false, source: "PUSH_UPDATE" }),
    ).toBe(true);
    expect(
      canWriteGeneratedPage({ handEdited: true, source: "PUSH_UPDATE" }),
    ).toBe(false);
    expect(
      canWriteGeneratedPage({ handEdited: true, source: "CHAT_EDIT" }),
    ).toBe(true);
  });
});
