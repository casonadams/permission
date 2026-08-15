import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import type { GateDescriptor } from "../gates/descriptor";
import type { PermissionCheckResult } from "../policy/types";
import { formatApprovalGuidance } from "../prompting/approval-guidance";

export function sendApprovalGuidance(pi: ExtensionAPI, descriptor: GateDescriptor, check: PermissionCheckResult): void {
  const sendMessage = (pi as ExtensionAPI & { sendMessage?: ExtensionAPI["sendMessage"] }).sendMessage;
  const guidance = getApprovalGuidance(descriptor, check);
  if (!sendMessage || !guidance) return;

  sendMessage.call(pi, { customType: "permission-guidance", content: guidance, display: true }, { deliverAs: "steer" });
}

function getApprovalGuidance(descriptor: GateDescriptor, check: PermissionCheckResult): string | undefined {
  const pattern =
    descriptor.surface === "path"
      ? getExternalPathPattern(descriptor, check)
      : descriptor.sessionApproval?.representativePattern;
  return formatApprovalGuidance(descriptor.surface, pattern);
}

function getExternalPathPattern(descriptor: GateDescriptor, check: PermissionCheckResult): string | undefined {
  if (check.source !== "special" || !isExternalPath(descriptor)) return undefined;
  const path = descriptor.promptDetails.path;
  return path ? `${path.replace(/\/$/, "")}/*` : undefined;
}

function isExternalPath(descriptor: GateDescriptor): boolean {
  return (
    (descriptor.denialContext.kind === "path" || descriptor.denialContext.kind === "bash_path") &&
    descriptor.denialContext.cwd !== undefined
  );
}
