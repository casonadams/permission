import { describe, expect, it } from "vitest";

import { createPermissionRequestId } from "#src/request-id";

describe("createPermissionRequestId", () => {
  it("creates an unprefixed id with timestamp, random segment, and pid", () => {
    expect(createPermissionRequestId()).toMatch(/^\d+-[a-z0-9]+-\d+$/);
  });

  it("adds the prefix when provided", () => {
    expect(createPermissionRequestId("skill-input")).toMatch(/^skill-input-\d+-[a-z0-9]+-\d+$/);
  });

  it("returns a unique id on each call", () => {
    const id1 = createPermissionRequestId();
    const id2 = createPermissionRequestId();
    expect(id1).not.toBe(id2);
  });
});
