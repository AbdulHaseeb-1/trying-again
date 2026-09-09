import { useSyncExternalStore } from 'react';

let openCount = 0;
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((listener) => listener());
}

/** Tracks one mounted-visible sheet. Returns an untrack cleanup. */
export function trackSheetOpen(): () => void {
  openCount += 1;
  emit();
  return () => {
    openCount = Math.max(0, openCount - 1);
    emit();
  };
}

function subscribe(callback: () => void): () => void {
  listeners.add(callback);
  return () => {
    listeners.delete(callback);
  };
}

function getSnapshot(): boolean {
  return openCount > 0;
}

/** True while any BottomSheet is open. Used to hide the tab bar under sheets. */
export function useAnySheetOpen(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot);
}
