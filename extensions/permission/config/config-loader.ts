import { existsSync, readFileSync } from "node:fs";
import { normalize } from "node:path";
import { stripJsonComments } from "./config-json-comments";
import { mergeUnifiedConfigs } from "./config-merge";
import { normalizeUnifiedConfig, type UnifiedConfigLoadResult, type UnifiedPermissionConfig } from "./config-normalize";
import {
  getGlobalConfigPath,
  getLegacyExtensionConfigPath,
  getLegacyGlobalPolicyPath,
  getLegacyProjectPolicyPath,
  getProjectConfigPath,
} from "./config-paths";

export interface MergedConfigResult {
  global: UnifiedPermissionConfig;
  project: UnifiedPermissionConfig;
  merged: UnifiedPermissionConfig;
  issues: string[];
}

type MergeState = {
  merged: UnifiedPermissionConfig;
  issues: string[];
};

type ConfigLoadStep = {
  path: string;
  warning?: string;
};

export function loadAndMergeConfigs(agentDir: string, cwd: string, extensionRoot: string): MergedConfigResult {
  const paths = buildConfigPaths(agentDir, cwd, extensionRoot);
  let state: MergeState = { merged: {}, issues: [] };

  for (const step of buildLegacySteps(paths)) {
    state = applyOptionalConfigStep(state, step);
  }

  const globalResult = loadUnifiedConfig(paths.newGlobalPath);
  state = applyConfigResult(state, globalResult);

  state = applyOptionalConfigStep(state, {
    path: paths.legacyProjectPolicyPath,
    warning: legacyProjectWarning(paths.legacyProjectPolicyPath, paths.newProjectPath),
  });

  const projectResult = loadUnifiedConfig(paths.newProjectPath);
  state = applyConfigResult(state, projectResult);

  return {
    global: globalResult.config,
    project: projectResult.config,
    merged: state.merged,
    issues: state.issues,
  };
}

function buildConfigPaths(agentDir: string, cwd: string, extensionRoot: string) {
  return {
    newGlobalPath: getGlobalConfigPath(agentDir),
    newProjectPath: getProjectConfigPath(cwd),
    legacyGlobalPolicyPath: getLegacyGlobalPolicyPath(agentDir),
    legacyProjectPolicyPath: getLegacyProjectPolicyPath(cwd),
    legacyExtConfigPath: getLegacyExtensionConfigPath(extensionRoot),
  };
}

function buildLegacySteps(paths: ReturnType<typeof buildConfigPaths>): ConfigLoadStep[] {
  const steps: ConfigLoadStep[] = [
    {
      path: paths.legacyGlobalPolicyPath,
      warning: legacyGlobalWarning(paths.legacyGlobalPolicyPath, paths.newGlobalPath),
    },
  ];
  if (normalize(paths.legacyExtConfigPath) !== normalize(paths.newGlobalPath)) {
    steps.push({
      path: paths.legacyExtConfigPath,
      warning: legacyExtensionWarning(paths.legacyExtConfigPath, paths.newGlobalPath),
    });
  }
  return steps;
}

function applyOptionalConfigStep(state: MergeState, step: ConfigLoadStep): MergeState {
  if (!existsSync(step.path)) return state;
  const result = loadUnifiedConfig(step.path);
  return applyConfigResult({ merged: state.merged, issues: [...state.issues, step.warning ?? ""] }, result);
}

function applyConfigResult(state: MergeState, result: UnifiedConfigLoadResult): MergeState {
  return {
    merged: mergeUnifiedConfigs(state.merged, result.config),
    issues: [...state.issues.filter(Boolean), ...result.issues],
  };
}

function legacyGlobalWarning(legacyPath: string, newPath: string): string {
  return `Legacy global policy found at '${legacyPath}'. Move it to '${newPath}':\n  mv '${legacyPath}' '${newPath}'`;
}

function legacyExtensionWarning(legacyPath: string, newPath: string): string {
  return `Legacy extension config found at '${legacyPath}'. Move runtime settings to '${newPath}':\n  mv '${legacyPath}' '${newPath}'`;
}

function legacyProjectWarning(legacyPath: string, newPath: string): string {
  return `Legacy project policy found at '${legacyPath}'. Move it to '${newPath}':\n  mv '${legacyPath}' '${newPath}'`;
}

export function loadUnifiedConfig(path: string): UnifiedConfigLoadResult {
  if (!existsSync(path)) return { config: {}, issues: [] };

  try {
    const raw = readFileSync(path, "utf-8");
    const parsed = JSON.parse(stripJsonComments(raw)) as unknown;
    return normalizeUnifiedConfig(parsed);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      config: {},
      issues: [`Failed to read config at '${path}': ${message}`],
    };
  }
}
