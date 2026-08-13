import { ToolRegistrationRegistry } from "./tool-registration-registry";

export type ToolAccessExtractor = (input: Record<string, unknown>) => string | undefined;

export interface ToolAccessExtractorLookup {
  get(toolName: string): ToolAccessExtractor | undefined;
}

export interface ToolAccessExtractorRegistrar {
  register(toolName: string, extractor: ToolAccessExtractor): () => void;
}

export class ToolAccessExtractorRegistry
  extends ToolRegistrationRegistry<ToolAccessExtractor>
  implements ToolAccessExtractorLookup, ToolAccessExtractorRegistrar
{
  constructor() {
    super((toolName) => `A tool access extractor is already registered for '${toolName}'.`);
  }
}
