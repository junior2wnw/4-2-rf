import { UiApi, UiCommand, UiEvent, UiState } from "./contracts.js";

export interface HeadlessUiBridge extends UiApi {
  setState(state: UiState): void;
  emit(event: UiEvent): void;
}

export function createHeadlessUiBridge(initialState: UiState): HeadlessUiBridge {
  let state = initialState;
  const listeners = new Set<(event: UiEvent) => void>();
  const commandHandlers = new Set<(command: UiCommand) => Promise<void> | void>();

  return {
    getState: () => state,
    async dispatch(command: UiCommand): Promise<void> {
      for (const handler of commandHandlers) {
        await handler(command);
      }
    },
    subscribe(listener: (event: UiEvent) => void): () => void {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    setState(nextState: UiState): void {
      state = nextState;
      for (const listener of listeners) {
        listener({ type: "state.changed", state });
      }
    },
    emit(event: UiEvent): void {
      for (const listener of listeners) {
        listener(event);
      }
    }
  };
}
