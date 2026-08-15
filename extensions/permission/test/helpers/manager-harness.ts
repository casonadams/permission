/**
 * Filesystem-backed PermissionManager harness for integration tests.
 *
 * Writes a real config file and agents directory to a temp directory so
 * PermissionManager can load them without mocking the file system.
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { ResolvedPolicyPaths } from "#src/config/policy-loader";
import { PermissionManager, type PolicyLoader } from "#src/policy/permission-manager";
import type { Rule } from "#src/policy/rule";
import type { ScopeConfig } from "#src/policy/types";

export type CreateManagerOptions = {
  mcpServerNames?: readonly string[];
};

export type CreateManagerWithProjectOptions = CreateManagerOptions & {
  projectConfig?: unknown;
  projectAgentFiles?: Record<string, string>;
};

export function createManager(
  config: unknown,
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
  config: unknown,
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
  config: unknown;
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

function writeJsonConfig(path: string, config: unknown): void {
  writeFileSync(path, `${JSON.stringify(config, null, 2)}\n`, "utf8");
}

function writeAgentFiles(directory: string, files: Record<string, string>): void {
  for (const [name, content] of Object.entries(files)) {
    writeFileSync(join(directory, `${name}.md`), content, "utf8");
  }
}

export function makeManager(mcpServerNames: readonly string[] = []): PermissionManager {
  return new PermissionManager({
    globalConfigPath: "/nonexistent/config.json",
    agentsDir: "/nonexistent/agents",
    mcpServerNames,
  });
}

export function makeManagerWithConfig(permission: Record<string, unknown>, mcpServerNames: readonly string[] = []) {
  return createManager({ permission }, {}, { mcpServerNames });
}

export function makeManagerWithScopes(
  globalPermission: Record<string, unknown>,
  projectPermission?: Record<string, unknown>,
) {
  return createManagerWithProject(
    { permission: globalPermission },
    {},
    { projectConfig: projectPermission === undefined ? undefined : { permission: projectPermission } },
  );
}

export function sessionAllow(surface: string, pattern: string): Rule {
  return { surface, pattern, action: "allow", layer: "session", origin: "session" };
}

type InMemoryScopes = {
  global?: ScopeConfig;
  project?: ScopeConfig;
  agent?: Record<string, ScopeConfig>;
  projectAgent?: Record<string, ScopeConfig>;
};

export function makeInMemoryManager(
  scopes: InMemoryScopes = {},
  mcpServerNames: readonly string[] = [],
): PermissionManager {
  return new PermissionManager({ policyLoader: createInMemoryPolicyLoader(scopes, mcpServerNames) });
}

function createInMemoryPolicyLoader(scopes: InMemoryScopes, mcpServerNames: readonly string[]): PolicyLoader {
  return {
    loadGlobalConfig: () => scopes.global ?? {},
    loadProjectConfig: () => scopes.project ?? {},
    loadAgentConfig: (name?: string) => (name ? (scopes.agent?.[name] ?? {}) : {}),
    loadProjectAgentConfig: (name?: string) => (name ? (scopes.projectAgent?.[name] ?? {}) : {}),
    getConfiguredMcpServerNames: () => mcpServerNames,
    getCacheStamp: () => "in-memory",
    getConfigIssues: () => [],
    getResolvedPolicyPaths: (): ResolvedPolicyPaths => ({
      globalConfigPath: "/in-memory/config.json",
      globalConfigExists: true,
      projectConfigPath: null,
      projectConfigExists: false,
      agentsDir: "/in-memory/agents",
      agentsDirExists: false,
      projectAgentsDir: null,
      projectAgentsDirExists: false,
    }),
  };
}
