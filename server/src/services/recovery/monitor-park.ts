import { MONITOR_PARK_MAX_HORIZON_MS } from "@paperclipai/shared";

/**
 * ALAA-1882: an issue is "monitor-parked" when its `monitorNextCheckAt` is a
 * concrete future instant that an owner durably left as the next-step disposition
 * (ALAA-1681 §A1/§A2 sets it to the event time). The recovery guards honor such a
 * park as a valid waiting path and suppress missing-disposition churn until it
 * passes.
 *
 * Bounding (both REQUIRED by ALAA-1882):
 *  - Only a value strictly in the future parks the issue. Once it is <= now the
 *    park expires and normal recovery resumes — exactly when the armed task should
 *    have fired and the owner must re-evaluate (surfaces the `event-overdue` delta).
 *  - A value more than MONITOR_PARK_MAX_HORIZON_MS (7d) out is ignored, so a stale
 *    far-future monitor cannot park an issue indefinitely.
 */
export function isMonitorParkActive(
  monitorNextCheckAt: Date | string | null | undefined,
  now: Date = new Date(),
): boolean {
  if (!monitorNextCheckAt) return false;
  const at = monitorNextCheckAt instanceof Date ? monitorNextCheckAt : new Date(monitorNextCheckAt);
  const ms = at.getTime();
  if (!Number.isFinite(ms)) return false;
  const nowMs = now.getTime();
  if (ms <= nowMs) return false;
  if (ms - nowMs > MONITOR_PARK_MAX_HORIZON_MS) return false;
  return true;
}
