import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { basename, dirname } from "node:path";
import { fileURLToPath } from "node:url";

function walkUpToNodeModules(fromUrl: string): string | null {
  try {
    const thisFile = fileURLToPath(fromUrl);
    let dir = dirname(thisFile);
    while (dir !== dirname(dir)) {
      if (basename(dir) === "node_modules") {
        return dir;
      }
      dir = dirname(dir);
    }
    return null;
  } catch {
    return null;
  }
}

function discoverGlobalNodeModulesViaSubprocess(): string | null {
  try {
    const result = spawnSync("npm", ["root", "-g"], {
      encoding: "utf-8",
      timeout: 5000,
      stdio: ["ignore", "pipe", "ignore"],
    });
    const root = result.stdout.trim();
    if (result.status === 0 && root && existsSync(root)) {
      return root;
    }
    return null;
  } catch {
    return null;
  }
}

export function discoverGlobalNodeModulesRoot(fromUrl = import.meta.url): string | null {
  const fromSelf = walkUpToNodeModules(fromUrl);
  if (fromSelf) return fromSelf;
  return discoverGlobalNodeModulesViaSubprocess();
}
