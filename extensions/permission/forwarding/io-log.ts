import type { DebugReviewLogger } from "#src/integrations/session-logger";

export function formatUnknownErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return String(error);
}

/**
 * Log a warning to both the review and debug logs.
 * Pass `null` for `logger` to silently no-op (e.g. in unit tests without IO).
 */
export function logPermissionForwardingWarning(
  logger: DebugReviewLogger | null,
  message: string,
  error?: unknown,
): void {
  logPermissionForwardingIssue({ logger, event: "permission_forwarding.warning", message, error });
}

/**
 * Log an error to both the review and debug logs.
 * Pass `null` for `logger` to silently no-op (e.g. in unit tests without IO).
 */
export function logPermissionForwardingError(logger: DebugReviewLogger | null, message: string, error?: unknown): void {
  logPermissionForwardingIssue({ logger, event: "permission_forwarding.error", message, error });
}

type PermissionForwardingLogIssue = {
  logger: DebugReviewLogger | null;
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
  args.logger?.debug(args.event, details);
}
