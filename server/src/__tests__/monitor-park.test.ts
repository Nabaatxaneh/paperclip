import { describe, expect, it } from "vitest";
import { MONITOR_PARK_MAX_HORIZON_MS } from "@paperclipai/shared";
import { isMonitorParkActive } from "../services/recovery/monitor-park.ts";

const now = new Date("2026-07-09T12:00:00Z");

describe("isMonitorParkActive (ALAA-1882)", () => {
  it("returns false for null/undefined/invalid values", () => {
    expect(isMonitorParkActive(null, now)).toBe(false);
    expect(isMonitorParkActive(undefined, now)).toBe(false);
    expect(isMonitorParkActive("not-a-date", now)).toBe(false);
  });

  it("returns false when the monitor is now or in the past (park expired)", () => {
    expect(isMonitorParkActive(now, now)).toBe(false);
    expect(isMonitorParkActive(new Date(now.getTime() - 1), now)).toBe(false);
  });

  it("returns true for a bounded future monitor", () => {
    expect(isMonitorParkActive(new Date(now.getTime() + 60_000), now)).toBe(true);
    expect(isMonitorParkActive(new Date(now.getTime() + MONITOR_PARK_MAX_HORIZON_MS), now)).toBe(true);
  });

  it("returns false beyond the horizon cap so a stale far-future monitor cannot park forever", () => {
    expect(isMonitorParkActive(new Date(now.getTime() + MONITOR_PARK_MAX_HORIZON_MS + 1), now)).toBe(false);
  });

  it("accepts ISO string inputs", () => {
    expect(isMonitorParkActive("2026-07-09T13:35:00Z", now)).toBe(true);
    expect(isMonitorParkActive("2026-07-09T11:00:00Z", now)).toBe(false);
  });
});
