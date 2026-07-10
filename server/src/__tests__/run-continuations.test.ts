import { describe, expect, it } from "vitest";
import {
  DEFAULT_MAX_LIVENESS_CONTINUATION_ATTEMPTS,
  RUN_LIVENESS_CONTINUATION_REASON,
  buildRunLivenessContinuationIdempotencyKey,
  decideRunLivenessContinuation,
} from "../services/run-continuations.ts";
import { MONITOR_PARK_SKIP_REASON } from "../services/recovery/index.ts";

const companyId = "company-1";
const agentId = "agent-1";
const issueId = "issue-1";
const runId = "run-1";

function run(overrides: Record<string, unknown> = {}) {
  return {
    id: runId,
    companyId,
    agentId,
    continuationAttempt: 0,
    ...overrides,
  } as never;
}

function issue(overrides: Record<string, unknown> = {}) {
  return {
    id: issueId,
    companyId,
    identifier: "PAP-1577",
    title: "Add bounded liveness continuation wakes",
    status: "in_progress",
    assigneeAgentId: agentId,
    executionState: null,
    projectId: null,
    ...overrides,
  } as never;
}

function agent(overrides: Record<string, unknown> = {}) {
  return {
    id: agentId,
    companyId,
    status: "idle",
    ...overrides,
  } as never;
}

describe("run liveness continuations", () => {
  it("enqueues the first plan_only continuation for the same issue and assignee", () => {
    const decision = decideRunLivenessContinuation({
      run: run(),
      issue: issue(),
      agent: agent(),
      livenessState: "plan_only",
      livenessReason: "Planned without acting",
      nextAction: "Take the first concrete action now.",
      budgetBlocked: false,
      idempotentWakeExists: false,
    });

    expect(decision.kind).toBe("enqueue");
    if (decision.kind !== "enqueue") return;
    expect(decision.nextAttempt).toBe(1);
    expect(decision.idempotencyKey).toBe(
      buildRunLivenessContinuationIdempotencyKey({
        issueId,
        sourceRunId: runId,
        livenessState: "plan_only",
        nextAttempt: 1,
      }),
    );
    expect(decision.payload).toMatchObject({
      issueId,
      sourceRunId: runId,
      livenessState: "plan_only",
      livenessReason: "Planned without acting",
      continuationAttempt: 1,
      maxContinuationAttempts: DEFAULT_MAX_LIVENESS_CONTINUATION_ATTEMPTS,
      instruction: "Take the first concrete action now.",
    });
    expect(decision.contextSnapshot).toMatchObject({
      issueId,
      wakeReason: RUN_LIVENESS_CONTINUATION_REASON,
      livenessContinuationAttempt: 1,
      livenessContinuationMaxAttempts: DEFAULT_MAX_LIVENESS_CONTINUATION_ATTEMPTS,
      livenessContinuationSourceRunId: runId,
      livenessContinuationState: "plan_only",
      livenessContinuationReason: "Planned without acting",
      livenessContinuationInstruction: "Take the first concrete action now.",
    });
  });

  it("enqueues the second empty_response continuation", () => {
    const decision = decideRunLivenessContinuation({
      run: run({ continuationAttempt: 1 }),
      issue: issue(),
      agent: agent(),
      livenessState: "empty_response",
      livenessReason: "No useful output",
      nextAction: null,
      budgetBlocked: false,
      idempotentWakeExists: false,
    });

    expect(decision.kind).toBe("enqueue");
    if (decision.kind !== "enqueue") return;
    expect(decision.nextAttempt).toBe(2);
  });

  it("does not enqueue a third continuation and returns an exhaustion comment", () => {
    const decision = decideRunLivenessContinuation({
      run: run({ continuationAttempt: 2 }),
      issue: issue(),
      agent: agent(),
      livenessState: "plan_only",
      livenessReason: "Still planning",
      nextAction: null,
      budgetBlocked: false,
      idempotentWakeExists: false,
    });

    expect(decision.kind).toBe("exhausted");
    if (decision.kind !== "exhausted") return;
    expect(decision.comment).toContain("Bounded liveness continuation exhausted");
    expect(decision.comment).toContain("Attempts used: 2/2");
  });

  it("skips non-actionable and guarded issues", () => {
    const guardedCases = [
      { livenessState: "advanced" as const },
      { issue: issue({ status: "done" }) },
      { issue: issue({ assigneeAgentId: "other-agent" }) },
      { issue: issue({ executionState: { status: "pending" } }) },
      { agent: agent({ status: "paused" }) },
      { budgetBlocked: true },
      { idempotentWakeExists: true },
    ];

    for (const guarded of guardedCases) {
      const decision = decideRunLivenessContinuation({
        run: run(),
        issue: guarded.issue ?? issue(),
        agent: guarded.agent ?? agent(),
        livenessState: guarded.livenessState ?? "plan_only",
        livenessReason: "No progress",
        nextAction: null,
        budgetBlocked: guarded.budgetBlocked ?? false,
        idempotentWakeExists: guarded.idempotentWakeExists ?? false,
      });

      expect(decision.kind).toBe("skip");
    }
  });
});

describe("run liveness continuations — monitor park (ALAA-1882)", () => {
  const now = new Date("2026-07-09T12:00:00Z");
  const futureMonitor = new Date("2026-07-09T13:35:00Z"); // in-window
  const pastMonitor = new Date("2026-07-09T11:00:00Z");
  const farMonitor = new Date("2026-07-20T12:00:01Z"); // > 7 day horizon

  it("skips a succeeded empty_response run on an issue parked to a future monitor", () => {
    const decision = decideRunLivenessContinuation({
      run: run(),
      issue: issue({ monitorNextCheckAt: futureMonitor }),
      agent: agent(),
      livenessState: "empty_response",
      livenessReason: "Silent no-op end while parked",
      nextAction: null,
      budgetBlocked: false,
      idempotentWakeExists: false,
      honorMonitorPark: true,
      now,
    });

    expect(decision.kind).toBe("skip");
    if (decision.kind !== "skip") return;
    expect(decision.reason).toBe(MONITOR_PARK_SKIP_REASON);
  });

  it("monitor park takes precedence over continuation exhaustion", () => {
    const decision = decideRunLivenessContinuation({
      run: run({ continuationAttempt: DEFAULT_MAX_LIVENESS_CONTINUATION_ATTEMPTS }),
      issue: issue({ monitorNextCheckAt: futureMonitor }),
      agent: agent(),
      livenessState: "plan_only",
      livenessReason: "Still planning while parked",
      nextAction: null,
      budgetBlocked: false,
      idempotentWakeExists: false,
      honorMonitorPark: true,
      now,
    });

    expect(decision.kind).toBe("skip");
    if (decision.kind !== "skip") return;
    expect(decision.reason).toBe(MONITOR_PARK_SKIP_REASON);
  });

  it("does not suppress when the honorMonitorPark gate is off", () => {
    const decision = decideRunLivenessContinuation({
      run: run(),
      issue: issue({ monitorNextCheckAt: futureMonitor }),
      agent: agent(),
      livenessState: "empty_response",
      livenessReason: "No useful output",
      nextAction: null,
      budgetBlocked: false,
      idempotentWakeExists: false,
      honorMonitorPark: false,
      now,
    });

    expect(decision.kind).toBe("enqueue");
  });

  it("does not suppress when the monitor is already in the past (event-overdue resumes)", () => {
    const decision = decideRunLivenessContinuation({
      run: run(),
      issue: issue({ monitorNextCheckAt: pastMonitor }),
      agent: agent(),
      livenessState: "empty_response",
      livenessReason: "No useful output",
      nextAction: null,
      budgetBlocked: false,
      idempotentWakeExists: false,
      honorMonitorPark: true,
      now,
    });

    expect(decision.kind).toBe("enqueue");
  });

  it("does not suppress when the monitor is beyond the 7-day horizon cap", () => {
    const decision = decideRunLivenessContinuation({
      run: run(),
      issue: issue({ monitorNextCheckAt: farMonitor }),
      agent: agent(),
      livenessState: "empty_response",
      livenessReason: "No useful output",
      nextAction: null,
      budgetBlocked: false,
      idempotentWakeExists: false,
      honorMonitorPark: true,
      now,
    });

    expect(decision.kind).toBe("enqueue");
  });

  it("does not suppress when monitorNextCheckAt is null", () => {
    const decision = decideRunLivenessContinuation({
      run: run(),
      issue: issue({ monitorNextCheckAt: null }),
      agent: agent(),
      livenessState: "empty_response",
      livenessReason: "No useful output",
      nextAction: null,
      budgetBlocked: false,
      idempotentWakeExists: false,
      honorMonitorPark: true,
      now,
    });

    expect(decision.kind).toBe("enqueue");
  });
});
