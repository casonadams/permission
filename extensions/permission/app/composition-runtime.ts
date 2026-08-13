import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { getAgentDir, getPackageDir } from "@earendil-works/pi-coding-agent";
import { registerPermissionSystemCommand } from "../config/config-modal";
import { getGlobalConfigPath } from "../config/config-paths";
import { ConfigStore } from "../config/config-store";
import { ForwardingManager } from "../forwarding/forwarding-manager";
import { PermissionForwarder, type PermissionForwarderDeps } from "../forwarding/permission-forwarder";
import { getSubagentSessionRegistry, type SubagentSessionRegistry } from "../forwarding/subagents/subagent-registry";
import { PermissionSessionLogger } from "../integrations/session-logger";
import { ToolAccessExtractorRegistry } from "../integrations/tool-access-extractor-registry";
import { ToolInputFormatterRegistry } from "../integrations/tool-input-formatter-registry";
import { PermissionManager } from "../policy/permission-manager";
import { SessionRules } from "../policy/session-rules";
import { registerBuiltinToolInputFormatters } from "../prompting/builtin-tool-input-formatters";
import { requestPermissionDecisionFromUi } from "../prompting/permission-dialog";
import { PermissionPrompter } from "../prompting/permission-prompter";
import { PromptingGateway } from "../prompting/prompting-gateway";
import { computeExtensionPaths, type ExtensionPaths } from "./extension-paths";
import { PermissionSession } from "./permission-session";

type Registries = {
  subagents: SubagentSessionRegistry;
  formatters: ToolInputFormatterRegistry;
  extractors: ToolAccessExtractorRegistry;
};

type Core = {
  agentDir: string;
  paths: ExtensionPaths;
  manager: PermissionManager;
  rules: SessionRules;
  registries: Registries;
};

export type Runtime = Core & {
  config: ConfigStore;
  session: PermissionSession;
  logger: PermissionSessionLogger;
  forwarder: PermissionForwarder;
  prompter: PermissionPrompter;
  gateway: PromptingGateway;
};

export function createRuntime(pi: ExtensionAPI): Runtime {
  const core = createCore();
  const state: { config?: ConfigStore; session?: PermissionSession } = {};
  const logger = createLogger(core, state);
  const config = new ConfigStore({ agentDir: core.agentDir, policyPaths: core.manager, logger });
  state.config = config;
  const forwarder = createForwarder({ pi, core, config, logger });
  const prompter = new PermissionPrompter({ config, logger, events: pi.events, forwarder });
  const gateway = new PromptingGateway({
    config,
    subagentSessionsDir: core.paths.subagentSessionsDir,
    registry: core.registries.subagents,
    prompter,
  });
  const session = new PermissionSession({
    paths: core.paths,
    forwarding: new ForwardingManager(core.paths.subagentSessionsDir, forwarder, core.registries.subagents),
    permissionManager: core.manager,
    sessionRules: core.rules,
    configStore: config,
    gateway,
  });
  state.session = session;
  return { ...core, config, session, logger, forwarder, prompter, gateway };
}

function createCore(): Core {
  const agentDir = getAgentDir();
  const formatters = new ToolInputFormatterRegistry();
  registerBuiltinToolInputFormatters(formatters);
  return {
    agentDir,
    paths: computeExtensionPaths(agentDir, getPackageDir()),
    manager: new PermissionManager({ agentDir }),
    rules: new SessionRules(),
    registries: { subagents: getSubagentSessionRegistry(), formatters, extractors: new ToolAccessExtractorRegistry() },
  };
}

function createLogger(
  core: Core,
  state: { config?: ConfigStore; session?: PermissionSession },
): PermissionSessionLogger {
  return new PermissionSessionLogger({
    globalLogsDir: core.paths.globalLogsDir,
    getConfig: () => readConfig(state),
    notify: (message) => state.session?.notify(message),
  });
}

function readConfig(state: { config?: ConfigStore }) {
  return state.config?.current() ?? { debugLog: false, permissionReviewLog: false, yoloMode: false };
}

function createForwarder(args: {
  pi: ExtensionAPI;
  core: Core;
  config: ConfigStore;
  logger: PermissionSessionLogger;
}): PermissionForwarder {
  const deps: PermissionForwarderDeps = {
    forwardingDir: args.core.paths.forwardingDir,
    subagentSessionsDir: args.core.paths.subagentSessionsDir,
    registry: args.core.registries.subagents,
    events: args.pi.events,
    logger: args.logger,
    requestPermissionDecisionFromUi: (params) =>
      requestPermissionDecisionFromUi(params.ui, params.title, params.message, params.options),
    config: args.config,
  };
  return new PermissionForwarder(deps);
}

export function registerCommand(pi: ExtensionAPI, runtime: Runtime): void {
  registerPermissionSystemCommand(pi, {
    config: runtime.config,
    configPath: getGlobalConfigPath(runtime.agentDir),
    getActiveAgentConfigRules: () =>
      runtime.manager.getComposedConfigRules(runtime.session.lastKnownActiveAgentName ?? undefined),
  });
}
