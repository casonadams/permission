import { buildInputForSurface } from "../policy/input-normalizer";
import type { ScopedPermissionManager } from "../policy/permission-manager";
import type { SessionRules } from "../policy/session-rules";
import type { PermissionsService } from "../service";
import type { ToolAccessExtractor, ToolAccessExtractorRegistrar } from "./tool-access-extractor-registry";
import type { ToolInputFormatter, ToolInputFormatterRegistrar } from "./tool-input-formatter-registry";

export interface LocalPermissionsServiceDeps {
  permissionManager: ScopedPermissionManager;
  sessionRules: Pick<SessionRules, "getRuleset">;
  formatterRegistry: ToolInputFormatterRegistrar;
  accessExtractorRegistry: ToolAccessExtractorRegistrar;
}

/**
 * In-process implementation of the cross-extension {@link PermissionsService}.
 *
 * Constructed once in the composition root and backed by the single shared
 * `PermissionManager` and `SessionRules` instances that `PermissionSession`
 * also uses — so service queries and gate-path approvals see the same state.
 */
export class LocalPermissionsService implements PermissionsService {
  private readonly permissionManager: ScopedPermissionManager;
  private readonly sessionRules: Pick<SessionRules, "getRuleset">;
  private readonly formatterRegistry: ToolInputFormatterRegistrar;
  private readonly accessExtractorRegistry: ToolAccessExtractorRegistrar;

  constructor(deps: LocalPermissionsServiceDeps) {
    this.permissionManager = deps.permissionManager;
    this.sessionRules = deps.sessionRules;
    this.formatterRegistry = deps.formatterRegistry;
    this.accessExtractorRegistry = deps.accessExtractorRegistry;
  }

  checkPermission(
    surface: string,
    value?: string,
    agentName?: string,
  ): ReturnType<PermissionsService["checkPermission"]> {
    const input = buildInputForSurface(surface, value);
    return this.permissionManager.checkPermission(surface, input, agentName, this.sessionRules.getRuleset());
  }

  getToolPermission(toolName: string, agentName?: string): ReturnType<PermissionsService["getToolPermission"]> {
    return this.permissionManager.getToolPermission(toolName, agentName);
  }

  registerToolInputFormatter(
    toolName: string,
    formatter: ToolInputFormatter,
  ): ReturnType<PermissionsService["registerToolInputFormatter"]> {
    return this.formatterRegistry.register(toolName, formatter);
  }

  registerToolAccessExtractor(
    toolName: string,
    extractor: ToolAccessExtractor,
  ): ReturnType<PermissionsService["registerToolAccessExtractor"]> {
    return this.accessExtractorRegistry.register(toolName, extractor);
  }
}
