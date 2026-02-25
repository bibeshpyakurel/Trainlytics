export type RequestVersionTracker = {
  next: () => number;
  invalidate: () => void;
  isStale: (version: number) => boolean;
  current: () => number;
};

export function createRequestVersionTracker(initialVersion = 0): RequestVersionTracker {
  let version = initialVersion;

  return {
    next() {
      version += 1;
      return version;
    },
    invalidate() {
      version += 1;
    },
    isStale(requestVersion: number) {
      return requestVersion !== version;
    },
    current() {
      return version;
    },
  };
}
