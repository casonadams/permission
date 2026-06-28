export function createPermissionRequestId(prefix?: string): string {
  const id = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}-${process.pid}`;
  return prefix ? `${prefix}-${id}` : id;
}
