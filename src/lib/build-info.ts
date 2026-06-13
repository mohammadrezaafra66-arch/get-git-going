// Build metadata constant. Bumping this value forces the bundler to emit
// a fresh production chunk so stale published deployments pick up the
// latest code and environment variables on the next publish.
// No runtime behavior depends on this value.
export const BUILD_TAG = "2026-06-08T08:30:00Z-auth-cache-stability-2" as const;
