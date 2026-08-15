export type ToolAccessExtractor = (input: Record<string, unknown>) => string | undefined;
export type ToolInputFormatter = (input: Record<string, unknown>) => string | undefined;

export interface ToolAccessExtractorLookup {
  get(toolName: string): ToolAccessExtractor | undefined;
}

export interface ToolAccessExtractorRegistrar {
  register(toolName: string, extractor: ToolAccessExtractor): () => void;
}

export interface ToolInputFormatterLookup {
  get(toolName: string): ToolInputFormatter | undefined;
}

export interface ToolInputFormatterRegistrar {
  register(toolName: string, formatter: ToolInputFormatter): () => void;
}

class ToolRegistrationRegistry<TRegistration> {
  private readonly registrations = new Map<string, TRegistration>();

  constructor(private readonly duplicateMessage: (toolName: string) => string) {}

  register(toolName: string, registration: TRegistration): () => void {
    if (this.registrations.has(toolName)) throw new Error(this.duplicateMessage(toolName));
    this.registrations.set(toolName, registration);
    return () => {
      if (this.registrations.get(toolName) === registration) this.registrations.delete(toolName);
    };
  }

  get(toolName: string): TRegistration | undefined {
    return this.registrations.get(toolName);
  }
}

export class ToolCustomizations {
  readonly formatters: ToolInputFormatterLookup & ToolInputFormatterRegistrar = new ToolRegistrationRegistry(
    (toolName) => `A tool input formatter is already registered for '${toolName}'.`,
  );

  readonly extractors: ToolAccessExtractorLookup & ToolAccessExtractorRegistrar = new ToolRegistrationRegistry(
    (toolName) => `A tool access extractor is already registered for '${toolName}'.`,
  );
}
