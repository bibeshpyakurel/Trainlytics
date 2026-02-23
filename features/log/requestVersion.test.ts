import { describe, expect, it } from "vitest";
import { createRequestVersionTracker } from "@/features/log/requestVersion";

describe("createRequestVersionTracker", () => {
  it("marks older versions as stale after a newer request starts", () => {
    const tracker = createRequestVersionTracker();
    const first = tracker.next();
    const second = tracker.next();

    expect(tracker.isStale(first)).toBe(true);
    expect(tracker.isStale(second)).toBe(false);
  });

  it("invalidates in-flight requests on cleanup", () => {
    const tracker = createRequestVersionTracker();
    const requestVersion = tracker.next();
    tracker.invalidate();

    expect(tracker.isStale(requestVersion)).toBe(true);
    expect(tracker.current()).toBe(2);
  });
});
