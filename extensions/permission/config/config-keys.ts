export const PERMISSION_KEYS = ["permission"] as const;
export type PermissionKey = (typeof PERMISSION_KEYS)[number];