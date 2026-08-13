/**
 * Filesystem-backed PermissionManager harness for integration tests.
 *
 * Writes a real config file and agents directory to a temp directory so
 * PermissionManager can load them without mocking the file system.
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { PermissionManager } from "#src/policy/permission-manager";
import type { ScopeConfig } from "#src/policy/types";

export type CreateManagerOptions = {
  mcpServerNames?: readonly string[];
};

export type CreateManagerWithProjectOptions = CreateManagerOptions & {
  projectConfig?: ScopeConfig;
  projectAgentFiles?: Record<string, string>;
};

export function createManager(
  config: ScopeConfig,
  agentFiles: Record<string, string> = {},
  options: CreateManagerOptions = {},
) {
  const baseDir = mkdtempSync(join(tmpdir(), "pi-permission-system-test-"));
  const globalConfigPath = join(baseDir, "pi-permissions.jsonc");
  const agentsDir = join(baseDir, "agents");

  mkdirSync(agentsDir, { recursive: true });
  writeFileSync(globalConfigPath, `${JSON.stringify(config, null, 2)}\n`, "utf8");

  for (const [name, content] of Object.entries(agentFiles)) {
    writeFileSync(join(agentsDir, `${name}.md`), content, "utf8");
  }

  const manager = new PermissionManager({
    globalConfigPath,
    agentsDir,
    mcpServerNames: options.mcpServerNames,
  });

  return {
    manager,
    globalConfigPath,
    cleanup: (): void => {
      rmSync(baseDir, { recursive: true, force: true });
    },
  };
}

type ProjectHarnessPaths = {
  baseDir: string;
  globalConfigPath: string;
  agentsDir: string;
  projectGlobalConfigPath: string;
  projectAgentsDir: string;
};

export function createManagerWithProject(
  config: ScopeConfig,
  agentFiles: Record<string, string> = {},
  options: CreateManagerWithProjectOptions = {},
) {
  const paths = createProjectHarnessPaths();
  writeProjectHarnessFiles({ paths, config, agentFiles, options });

  const manager = new PermissionManager({
    globalConfigPath: paths.globalConfigPath,
    agentsDir: paths.agentsDir,
    projectGlobalConfigPath: paths.projectGlobalConfigPath,
    projectAgentsDir: paths.projectAgentsDir,
    mcpServerNames: options.mcpServerNames,
  });

  return {
    manager,
    cleanup: (): void => {
      rmSync(paths.baseDir, { recursive: true, force: true });
    },
  };
}

function createProjectHarnessPaths(): ProjectHarnessPaths {
  const baseDir = mkdtempSync(join(tmpdir(), "pi-permission-system-proj-test-"));
  const projectRoot = join(baseDir, "project");
  return {
    baseDir,
    globalConfigPath: join(baseDir, "pi-permissions.jsonc"),
    agentsDir: join(baseDir, "agents"),
    projectGlobalConfigPath: join(projectRoot, "pi-permissions.jsonc"),
    projectAgentsDir: join(projectRoot, "agents"),
  };
}

function writeProjectHarnessFiles(args: {
  paths: ProjectHarnessPaths;
  config: ScopeConfig;
  agentFiles: Record<string, string>;
  options: CreateManagerWithProjectOptions;
}): void {
  mkdirSync(args.paths.agentsDir, { recursive: true });
  mkdirSync(args.paths.projectAgentsDir, { recursive: true });
  writeJsonConfig(args.paths.globalConfigPath, args.config);
  if (args.options.projectConfig) writeJsonConfig(args.paths.projectGlobalConfigPath, args.options.projectConfig);
  writeAgentFiles(args.paths.agentsDir, args.agentFiles);
  writeAgentFiles(args.paths.projectAgentsDir, args.options.projectAgentFiles ?? {});
}

function writeJsonConfig(path: string, config: ScopeConfig): void {
  writeFileSync(path, `${JSON.stringify(config, null, 2)}\n`, "utf8");
}

function writeAgentFiles(directory: string, files: Record<string, string>): void {
  for (const [name, content] of Object.entries(files)) {
    writeFileSync(join(directory, `${name}.md`), content, "utf8");
  }
}
