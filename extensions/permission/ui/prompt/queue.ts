let promptTail: Promise<void> = Promise.resolve();

export function resetPromptQueue(): void {
  promptTail = Promise.resolve();
}

export function queueDialog<T>(show: () => Promise<T>, fallback: T): Promise<T> {
  return new Promise<T>((resolve) => {
    const run = () =>
      show()
        .then(resolve)
        .catch(() => {
          // A prompt failure is treated like the user selecting the fallback
          // value (usually "deny") so the guard stays fail-closed.
          resolve(fallback);
        });
    promptTail = promptTail.then(run, run).then(
      () => undefined,
      () => undefined,
    );
  });
}
