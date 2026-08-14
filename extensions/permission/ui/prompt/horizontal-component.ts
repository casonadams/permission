import { Key, matchesKey } from "@earendil-works/pi-tui";
import { BodyScroller } from "./body-scroller.ts";
import { renderComponent, type ThemeLike } from "./horizontal-render.ts";

export type HorizontalOption<T extends string> = {
  label: string;
  value: T;
};

export type ConfirmStep<T extends string> = {
  resolveTo: T;
  body: string;
  options: HorizontalOption<T>[];
};

export type Step<T extends string> = {
  body: string;
  options: HorizontalOption<T>[];
  confirmStep?: { triggerValue: T; step: ConfirmStep<T> };
};

type TuiLike = { requestRender(): void };
type Component = {
  render(width: number): string[];
  invalidate(): void;
  handleInput(data: string): void;
};

export const CONFIRM_VALUE = "__confirm__" as const;
export const CANCEL_VALUE = "__cancel__" as const;

export function createHorizontalPickerComponent<T extends string>(args: {
  tui: TuiLike;
  theme: ThemeLike;
  title: string;
  step: Step<T>;
  cancelValue: T;
  done: (value: T) => void;
}): Component {
  let state = createInitialState<T>();
  const bodyScroller = new BodyScroller(args.tui);
  const currentOptions = (): HorizontalOption<T>[] =>
    state.confirmStep ? state.confirmStep.options : args.step.options;

  return {
    render: (width) => {
      const body = currentBody(args.step, state);
      return renderComponent({
        width,
        theme: args.theme,
        title: args.title,
        body,
        bodyOffset: bodyScroller.prepare(body, width),
        options: currentOptions(),
        selected: state.selected,
      });
    },
    invalidate(): void {},
    handleInput(data: string): void {
      if (bodyScroller.handleInput(data)) return;
      const previousBody = currentBody(args.step, state);
      state = handleHorizontalInput({
        data,
        state,
        options: currentOptions(),
        step: args.step,
        cancelValue: args.cancelValue,
        done: args.done,
        tui: args.tui,
      });
      if (currentBody(args.step, state) !== previousBody) bodyScroller.reset();
    },
  };
}

type PickerState<T extends string> = { confirmStep: ConfirmStep<T> | null; selected: number };

const createInitialState = <T extends string>(): PickerState<T> => ({ confirmStep: null, selected: 0 });

function currentBody<T extends string>(step: Step<T>, state: PickerState<T>): string {
  return state.confirmStep ? state.confirmStep.body : step.body;
}

function handleHorizontalInput<T extends string>(args: {
  data: string;
  state: PickerState<T>;
  options: HorizontalOption<T>[];
  step: Step<T>;
  cancelValue: T;
  done: (value: T) => void;
  tui: TuiLike;
}): PickerState<T> {
  if (isPreviousKey(args.data))
    return moveSelection({ state: args.state, optionCount: args.options.length, delta: -1, tui: args.tui });
  if (isNextKey(args.data))
    return moveSelection({ state: args.state, optionCount: args.options.length, delta: 1, tui: args.tui });
  if (matchesKey(args.data, Key.enter)) return handleEnterKey(args);
  if (matchesKey(args.data, Key.escape)) return handleEscapeKey(args);
  return args.state;
}

const isPreviousKey = (data: string): boolean => matchesKey(data, Key.left) || matchesKey(data, Key.shift("tab"));
const isNextKey = (data: string): boolean => matchesKey(data, Key.right) || matchesKey(data, Key.tab);

function moveSelection<T extends string>(args: {
  state: PickerState<T>;
  optionCount: number;
  delta: number;
  tui: TuiLike;
}): PickerState<T> {
  args.tui.requestRender();
  return { ...args.state, selected: (args.state.selected + args.optionCount + args.delta) % args.optionCount };
}

function handleEnterKey<T extends string>(args: {
  state: PickerState<T>;
  options: HorizontalOption<T>[];
  step: Step<T>;
  cancelValue: T;
  done: (value: T) => void;
  tui: TuiLike;
}): PickerState<T> {
  const picked = args.options[args.state.selected]?.value ?? args.cancelValue;
  if (args.state.confirmStep)
    return handleConfirmStepPick({ confirmStep: args.state.confirmStep, picked, done: args.done, tui: args.tui });
  return handlePrimaryStepPick(args, picked);
}

function handlePrimaryStepPick<T extends string>(
  args: { state: PickerState<T>; step: Step<T>; done: (value: T) => void; tui: TuiLike },
  picked: T,
): PickerState<T> {
  if (picked === args.step.confirmStep?.triggerValue) return enterConfirmStep(args.step.confirmStep.step, args.tui);
  args.done(picked);
  return args.state;
}

function handleConfirmStepPick<T extends string>(args: {
  confirmStep: ConfirmStep<T>;
  picked: T;
  done: (value: T) => void;
  tui: TuiLike;
}): PickerState<T> {
  if (args.picked === CANCEL_VALUE) return clearConfirmStep(args.tui);
  args.done(args.confirmStep.resolveTo);
  return { confirmStep: args.confirmStep, selected: 0 };
}

function enterConfirmStep<T extends string>(confirmStep: ConfirmStep<T>, tui: TuiLike): PickerState<T> {
  tui.requestRender();
  return { confirmStep, selected: 0 };
}

function handleEscapeKey<T extends string>(args: {
  state: PickerState<T>;
  cancelValue: T;
  done: (value: T) => void;
  tui: TuiLike;
}): PickerState<T> {
  if (args.state.confirmStep) return clearConfirmStep(args.tui);
  args.done(args.cancelValue);
  return args.state;
}

function clearConfirmStep<T extends string>(tui: TuiLike): PickerState<T> {
  tui.requestRender();
  return { confirmStep: null, selected: 0 };
}
