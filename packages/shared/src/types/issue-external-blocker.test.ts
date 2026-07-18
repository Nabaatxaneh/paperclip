import { describe, expect, it } from "vitest";
import {
  ISSUE_EXTERNAL_BLOCKER_UNDATED_TTL_MS,
  isIssueExternalBlockerActive,
  type IssueExternalBlocker,
} from "./issue.js";

const NOW = new Date("2026-07-18T12:00:00.000Z");

function blocker(overrides: Partial<IssueExternalBlocker> = {}): IssueExternalBlocker {
  return {
    kind: "scheduled_task",
    ref: "ALAA2067-ColocationProbe",
    eventAt: "2026-07-20T20:30:00.000Z",
    setAt: "2026-07-18T11:00:00.000Z",
    ...overrides,
  };
}

describe("isIssueExternalBlockerActive (ALAA-2078 AC1/AC3)", () => {
  it("treats a missing blocker as not parked, preserving today's needs_attention signal", () => {
    expect(isIssueExternalBlockerActive(null, NOW)).toBe(false);
    expect(isIssueExternalBlockerActive(undefined, NOW)).toBe(false);
  });

  it("parks while eventAt is in the future", () => {
    expect(isIssueExternalBlockerActive(blocker(), NOW)).toBe(true);
  });

  it("escalates once eventAt has passed", () => {
    const overdue = blocker({ eventAt: "2026-07-18T11:59:59.000Z" });
    expect(isIssueExternalBlockerActive(overdue, NOW)).toBe(false);
  });

  it("escalates exactly at eventAt rather than one tick later", () => {
    const atEvent = blocker({ eventAt: NOW.toISOString() });
    expect(isIssueExternalBlockerActive(atEvent, NOW)).toBe(false);
  });

  it("parks an undated blocker only within the TTL measured from setAt", () => {
    const fresh = blocker({ eventAt: null, setAt: "2026-07-18T11:00:00.000Z" });
    expect(isIssueExternalBlockerActive(fresh, NOW)).toBe(true);

    const expired = blocker({
      eventAt: null,
      setAt: new Date(NOW.getTime() - ISSUE_EXTERNAL_BLOCKER_UNDATED_TTL_MS - 1).toISOString(),
    });
    expect(isIssueExternalBlockerActive(expired, NOW)).toBe(false);
  });

  it("refuses to park on an unparseable date instead of parking forever", () => {
    expect(isIssueExternalBlockerActive(blocker({ eventAt: "not-a-date" }), NOW)).toBe(false);
    expect(isIssueExternalBlockerActive(blocker({ eventAt: null, setAt: "nope" }), NOW)).toBe(false);
  });
});
