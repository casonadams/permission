import { ToolRegistrationRegistry } from "./tool-registration-registry";

export type ToolInputFormatter = (input: Record<string, unknown>) => string | undefined;

export interface ToolInputFormatterLookup {
  get(toolName: string): ToolInputFormatter | undefined;
}

export interface ToolInputFormatterRegistrar {
  register(toolName: string, formatter: ToolInputFormatter): () => void;
}

export class ToolInputFormatterRegistry
  extends ToolRegistrationRegistry<ToolInputFormatter>
  implements ToolInputFormatterLookup, ToolInputFormatterRegistrar
{
  constructor() {
    super((toolName) => `A tool input formatter is already registered for '${toolName}'.`);
  }
}
