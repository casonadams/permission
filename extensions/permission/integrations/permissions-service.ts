import { buildInputForSurface } from "../policy/input-normalizer";
import type { ScopedPermissionManager } from "../policy/permission-manager";
import type { SessionRules } from "../policy/session-rules";
import type { PermissionsService } from "../service";
import type {
  ToolAccessExtractor,
  ToolAccessExtractorRegistrar,
  ToolInputFormatter,
  ToolInputFormatterRegistrar,
} from "./tool-customizations";

export interface LocalPermissionsServiceDeps {
  permissionManager: ScopedPermissionManager;
  sessionRules: Pick<SessionRules, "getRuleset">;
  formatterRegistry: ToolInputFormatterRegistrar;
  accessExtractorRegistry: ToolAccessExtractorRegistrar;
}

export class LocalPermissionsService implements PermissionsService {
  constructor(private readonly deps: LocalPermissionsServiceDeps) {}

  checkPermission(
    surface: string,
    value?: string,
    agentName?: string,
  ): ReturnType<PermissionsService["checkPermission"]> {
    const input = buildInputForSurface(surface, value);
    return this.deps.permissionManager.checkPermission(surface, input, agentName, this.deps.sessionRules.getRuleset());
  }

  getToolPermission(toolName: string, agentName?: string): ReturnType<PermissionsService["getToolPermission"]> {
    return this.deps.permissionManager.getToolPermission(toolName, agentName);
  }

  registerToolInputFormatter(
    toolName: string,
    formatter: ToolInputFormatter,
  ): ReturnType<PermissionsService["registerToolInputFormatter"]> {
    return this.deps.formatterRegistry.register(toolName, formatter);
  }

  registerToolAccessExtractor(
    toolName: string,
    extractor: ToolAccessExtractor,
  ): ReturnType<PermissionsService["registerToolAccessExtractor"]> {
    return this.deps.accessExtractorRegistry.register(toolName, extractor);
  }
}
