import type { PermissionNotifier } from "#src/integrations/notifier";

export function formatUnknownErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  return String(error);
}

export function notifyPermissionForwardingWarning(
  notifier: PermissionNotifier | null,
  message: string,
  error?: unknown,
): void {
  if (!notifier) return;
  notifier.warn(error === undefined ? message : `${message}: ${formatUnknownErrorMessage(error)}`);
}

export const notifyPermissionForwardingError = notifyPermissionForwardingWarning;
