import type { ExtensionCommandContext, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { EXTENSION_ID } from "../config/extension-config";

export const PERMISSION_SYSTEM_STATUS_KEY = EXTENSION_ID;

type PermissionStatusContext = Pick<ExtensionContext, "ui"> | Pick<ExtensionCommandContext, "ui">;

export function clearPermissionSystemStatus(ctx: PermissionStatusContext): void {
  ctx.ui.setStatus(PERMISSION_SYSTEM_STATUS_KEY, undefined);
}
