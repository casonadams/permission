export class ToolRegistrationRegistry<TRegistration> {
  private readonly registrations = new Map<string, TRegistration>();

  constructor(private readonly duplicateMessage: (toolName: string) => string) {}

  register(toolName: string, registration: TRegistration): () => void {
    if (this.registrations.has(toolName)) {
      throw new Error(this.duplicateMessage(toolName));
    }

    this.registrations.set(toolName, registration);
    return () => {
      if (this.registrations.get(toolName) === registration) {
        this.registrations.delete(toolName);
      }
    };
  }

  get(toolName: string): TRegistration | undefined {
    return this.registrations.get(toolName);
  }
}
