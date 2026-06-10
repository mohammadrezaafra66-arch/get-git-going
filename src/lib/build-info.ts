// Build metadata constant. Bumping this value forces the bundler to emit
// a fresh production chunk so stale published deployments pick up the
// latest code and environment variables on the next publish.
// No runtime behavior depends on this value.
export const BUILD_TAG = "2026-05-06T10:00:00Z-cache-buster-1" as const;
