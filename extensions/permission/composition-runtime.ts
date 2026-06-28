import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { getAgentDir, getPackageDir } from "@earendil-works/pi-coding-agent";
import { registerBuiltinToolInputFormatters } from "./builtin-tool-input-formatters";
import { registerPermissionSystemCommand } from "./config-modal";
import { getGlobalConfigPath } from "./config-paths";
import { ConfigStore } from "./config-store";
import { computeExtensionPaths, type ExtensionPaths } from "./extension-paths";
import { PermissionForwarder, type PermissionForwarderDeps } from "./forwarded-permissions/permission-forwarder";
import { ForwardingManager } from "./forwarding-manager";
import { requestPermissionDecisionFromUi } from "./permission-dialog";
import { PermissionManager } from "./permission-manager";
import { PermissionPrompter } from "./permission-prompter";
import { PermissionSession } from "./permission-session";
import { PromptingGateway } from "./prompting-gateway";
import { PermissionSessionLogger } from "./session-logger";
import { SessionRules } from "./session-rules";
import { getSubagentSessionRegistry, type SubagentSessionRegistry } from "./subagent-registry";
import { ToolAccessExtractorRegistry } from "./tool-access-extractor-registry";
import { ToolInputFormatterRegistry } from "./tool-input-formatter-registry";

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
  const gateway = createGateway(core, config, prompter);
  const session = createSession({ core, config, forwarder, gateway });
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

function createGateway(core: Core, config: ConfigStore, prompter: PermissionPrompter): PromptingGateway {
  return new PromptingGateway({
    config,
    subagentSessionsDir: core.paths.subagentSessionsDir,
    registry: core.registries.subagents,
    prompter,
  });
}

function createSession(args: {
  core: Core;
  config: ConfigStore;
  forwarder: PermissionForwarder;
  gateway: PromptingGateway;
}): PermissionSession {
  return new PermissionSession({
    paths: args.core.paths,
    forwarding: new ForwardingManager(
      args.core.paths.subagentSessionsDir,
      args.forwarder,
      args.core.registries.subagents,
    ),
    permissionManager: args.core.manager,
    sessionRules: args.core.rules,
    configStore: args.config,
    gateway: args.gateway,
  });
}

export function registerCommand(pi: ExtensionAPI, runtime: Runtime): void {
  registerPermissionSystemCommand(pi, {
    config: runtime.config,
    configPath: getGlobalConfigPath(runtime.agentDir),
    getActiveAgentConfigRules: () =>
      runtime.manager.getComposedConfigRules(runtime.session.lastKnownActiveAgentName ?? undefined),
  });
}
