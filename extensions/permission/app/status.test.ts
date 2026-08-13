import { expect, test } from "vitest";
import { getPermissionSystemStatus } from "#src/app/status";
import { DEFAULT_EXTENSION_CONFIG } from "../config/extension-config";

test("Permission-system status is only exposed when yolo mode is enabled", () => {
  expect(getPermissionSystemStatus(DEFAULT_EXTENSION_CONFIG)).toBe(undefined);
  expect(getPermissionSystemStatus({ ...DEFAULT_EXTENSION_CONFIG, yoloMode: true })).toBe("yolo");
});
