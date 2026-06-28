import { readFileSync } from "node:fs";
import { toRecord } from "./common";
import { stripJsonComments } from "./config-loader";

export function readConfiguredMcpServerNamesFromConfigPath(configPath: string): string[] {
  try {
    const raw = readFileSync(configPath, "utf-8");
    const parsed = JSON.parse(stripJsonComments(raw)) as unknown;
    const root = toRecord(parsed);
    const serverRecord = toRecord(root.mcpServers ?? root["mcp-servers"]);
    return Object.keys(serverRecord)
      .map((name) => name.trim())
      .filter((name) => name.length > 0);
  } catch {
    return [];
  }
}

export function getConfiguredMcpServerNamesFromPaths(paths: readonly string[]): string[] {
  const seen = new Set<string>();
  for (const path of paths) {
    for (const name of readConfiguredMcpServerNamesFromConfigPath(path)) seen.add(name);
  }
  return [...seen].sort((left, right) => right.length - left.length || left.localeCompare(right));
}
