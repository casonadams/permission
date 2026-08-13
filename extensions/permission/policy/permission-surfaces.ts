export const SEARCH_PATH_TOOLS: ReadonlySet<string> = new Set(["find", "grep", "ls"]);
export const READ_ONLY_PATH_BEARING_TOOLS: ReadonlySet<string> = new Set(["read", ...SEARCH_PATH_TOOLS]);
export const PATH_BEARING_TOOLS: ReadonlySet<string> = new Set([...READ_ONLY_PATH_BEARING_TOOLS, "write", "edit"]);
export const BUILT_IN_TOOL_PERMISSION_NAMES: ReadonlySet<string> = new Set(["bash", ...PATH_BEARING_TOOLS]);
export const SPECIAL_PERMISSION_KEYS: ReadonlySet<string> = new Set(["external_directory", "path"]);
