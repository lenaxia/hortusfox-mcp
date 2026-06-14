import { afterEach, vi } from "vitest";

export function withCleanEnv(stash: NodeJS.ProcessEnv) {
  afterEach(() => {
    process.env = { ...stash };
  });
}
