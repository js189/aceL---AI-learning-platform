/** Progress event system: dispatch when progress changes so UI can refresh immediately */

const EVENT_NAME = "progress-updated";

export function dispatchProgressUpdate() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(EVENT_NAME));
  }
}

export function useProgressUpdate(callback: () => void): void | (() => void) {
  if (typeof window === "undefined") return;
  const handler = () => callback();
  window.addEventListener(EVENT_NAME, handler);
  return () => window.removeEventListener(EVENT_NAME, handler);
}
