import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import { CANCEL_VALUE, CONFIRM_VALUE, createHorizontalPickerComponent, type Step } from "./horizontal-component.ts";
import { renderPromptBody } from "./render.ts";

export { CANCEL_VALUE, CONFIRM_VALUE };

export async function chooseHorizontalApproval<T extends string>(
  ...args: [ctx: ExtensionContext, title: string, step: Step<T>, cancelValue: T]
): Promise<T> {
  const [ctx, title, step, cancelValue] = args;
  return ctx.ui.custom<T>(
    (...factoryArgs) => {
      const [tui, theme, , done] = factoryArgs;
      return createHorizontalPickerComponent({ tui, theme, title, step, cancelValue, done });
    },
    {
      overlay: true,
      overlayOptions: {
        width: "100%",
        minWidth: 40,
        anchor: "bottom-center",
      },
    },
  );
}

export { renderPromptBody };
