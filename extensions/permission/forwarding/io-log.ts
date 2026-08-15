import type { ReviewLogger } from "#src/integrations/session-logger";

export function formatUnknownErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return String(error);
}

export function logPermissionForwardingWarning(logger: ReviewLogger | null, message: string, error?: unknown): void {
  logPermissionForwardingIssue({ logger, event: "permission_forwarding.warning", message, error });
}

export function logPermissionForwardingError(logger: ReviewLogger | null, message: string, error?: unknown): void {
  logPermissionForwardingIssue({ logger, event: "permission_forwarding.error", message, error });
}

type PermissionForwardingLogIssue = {
  logger: ReviewLogger | null;
  event: "permission_forwarding.warning" | "permission_forwarding.error";
  message: string;
  error?: unknown;
};

function logPermissionForwardingIssue(args: PermissionForwardingLogIssue): void {
  const details =
    args.error === undefined
      ? { message: args.message }
      : { message: args.message, error: formatUnknownErrorMessage(args.error) };
  args.logger?.review(args.event, details);
}
