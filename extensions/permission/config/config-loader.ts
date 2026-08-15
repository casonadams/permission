import { existsSync, readFileSync } from "node:fs";
import { normalize } from "node:path";
import { stripJsonComments } from "./config-json-comments";
import { normalizeUnifiedConfig, type UnifiedConfigLoadResult } from "./config-normalize";
import {
  getGlobalConfigPath,
  getLegacyExtensionConfigPath,
  getLegacyGlobalPolicyPath,
  getLegacyProjectPolicyPath,
  getProjectConfigPath,
} from "./config-paths";

type ConfigLoadStep = {
  path: string;
  warning: string;
};

export function collectLegacyConfigIssues(agentDir: string, cwd: string, extensionRoot: string): string[] {
  const paths = buildConfigPaths(agentDir, cwd, extensionRoot);
  return [
    ...buildLegacySteps(paths).flatMap(loadOptionalConfigIssues),
    ...loadOptionalConfigIssues({
      path: paths.legacyProjectPolicyPath,
      warning: legacyProjectWarning(paths.legacyProjectPolicyPath, paths.newProjectPath),
    }),
  ];
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

function loadOptionalConfigIssues(step: ConfigLoadStep): string[] {
  return existsSync(step.path) ? [step.warning, ...loadUnifiedConfig(step.path).issues] : [];
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
