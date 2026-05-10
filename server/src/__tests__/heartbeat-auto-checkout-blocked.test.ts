import { describe, expect, it } from "vitest";
import { shouldAutoCheckoutIssueForWake } from "../services/heartbeat.js";

const baseInput = {
  contextSnapshot: { wakeReason: "issue_status_changed" } as Record<string, unknown>,
  issueStatus: "todo" as string | null,
  issueAssigneeAgentId: "agent-1" as string | null,
  isDependencyReady: true,
  agentId: "agent-1",
};

describe("shouldAutoCheckoutIssueForWake", () => {
  it("auto-checks-out a todo issue on a normal wake", () => {
    expect(shouldAutoCheckoutIssueForWake({ ...baseInput, issueStatus: "todo" })).toBe(true);
  });

  it("auto-checks-out a backlog issue on a normal wake", () => {
    expect(shouldAutoCheckoutIssueForWake({ ...baseInput, issueStatus: "backlog" })).toBe(true);
  });

  it("auto-checks-out an in_progress issue on a normal wake", () => {
    expect(shouldAutoCheckoutIssueForWake({ ...baseInput, issueStatus: "in_progress" })).toBe(true);
  });

  it("does NOT auto-check-out a blocked issue on issue_status_changed (breaks oscillation loop)", () => {
    // Before this fix, an assigned `blocked` issue would be flipped to
    // `in_progress` on the next wake, which itself fired another
    // `issue_status_changed` event — leading to a tight blocked↔in_progress
    // oscillation. ALAA-393.
    expect(
      shouldAutoCheckoutIssueForWake({
        ...baseInput,
        issueStatus: "blocked",
        contextSnapshot: { wakeReason: "issue_status_changed" },
      }),
    ).toBe(false);
  });

  it("does NOT auto-check-out a blocked issue on issue_assigned wake", () => {
    // Even a fresh assignment must not auto-flip blocked → in_progress; the
    // agent or user has to explicitly PATCH the issue out of blocked.
    expect(
      shouldAutoCheckoutIssueForWake({
        ...baseInput,
        issueStatus: "blocked",
        contextSnapshot: { wakeReason: "issue_assigned" },
      }),
    ).toBe(false);
  });

  it("does NOT auto-check-out a blocked issue on any other wake reason", () => {
    for (const wakeReason of ["wake", "comment_added", "scheduled", "retry_failed_run"]) {
      expect(
        shouldAutoCheckoutIssueForWake({
          ...baseInput,
          issueStatus: "blocked",
          contextSnapshot: { wakeReason },
        }),
      ).toBe(false);
    }
  });

  it("does NOT auto-check-out when the dependency readiness gate is false (blocker chain)", () => {
    // Pre-existing behaviour: when blockerIssueIds reference an unresolved
    // blocker, listDependencyReadiness reports isDependencyReady=false and
    // the harness must skip auto-checkout. Reaffirmed here so a future
    // refactor cannot regress it.
    expect(
      shouldAutoCheckoutIssueForWake({
        ...baseInput,
        issueStatus: "todo",
        isDependencyReady: false,
      }),
    ).toBe(false);
  });

  it("does NOT auto-check-out when the assigned agent does not match", () => {
    expect(
      shouldAutoCheckoutIssueForWake({
        ...baseInput,
        issueAssigneeAgentId: "agent-2",
      }),
    ).toBe(false);
  });

  it("does NOT auto-check-out when no wake reason is present", () => {
    expect(
      shouldAutoCheckoutIssueForWake({
        ...baseInput,
        contextSnapshot: {},
      }),
    ).toBe(false);
  });

  it("does NOT auto-check-out on @-mention wakes", () => {
    expect(
      shouldAutoCheckoutIssueForWake({
        ...baseInput,
        contextSnapshot: { wakeReason: "issue_comment_mentioned" },
      }),
    ).toBe(false);
  });

  it("does NOT auto-check-out on execution_* wake reasons", () => {
    for (const wakeReason of [
      "execution_review_requested",
      "execution_approval_requested",
      "execution_changes_requested",
    ]) {
      expect(
        shouldAutoCheckoutIssueForWake({
          ...baseInput,
          contextSnapshot: { wakeReason },
        }),
      ).toBe(false);
    }
  });

  it("does NOT auto-check-out unsupported statuses such as done", () => {
    for (const issueStatus of ["done", "cancelled", "archived"]) {
      expect(
        shouldAutoCheckoutIssueForWake({
          ...baseInput,
          issueStatus,
        }),
      ).toBe(false);
    }
  });
});
