export interface ExternalDirectoryPromptArgs {
  toolName: string;
  pathValue: string;
  cwd: string;
  agentName?: string;
}

export function formatExternalDirectoryAskPrompt(args: ExternalDirectoryPromptArgs): string {
  const subject = args.agentName ? `Agent '${args.agentName}'` : "Current agent";
  return `${subject} requested tool '${args.toolName}' for path '${args.pathValue}' outside working directory '${args.cwd}'. Allow this external directory access?`;
}

export interface BashExternalDirectoryPromptArgs {
  command: string;
  externalPaths: string[];
  cwd: string;
  agentName?: string;
}

export function formatBashExternalDirectoryAskPrompt(args: BashExternalDirectoryPromptArgs): string {
  const subject = args.agentName ? `Agent '${args.agentName}'` : "Current agent";
  const pathList = args.externalPaths.join(", ");
  return `${subject} requested bash command '${args.command}' which references path(s) outside working directory '${args.cwd}': ${pathList}. Allow this external directory access?`;
}
