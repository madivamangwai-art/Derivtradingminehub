type AppErrorContext = Record<string, unknown>;

declare global {
  interface Window {
    __appErrorEvents?: {
      captureException?: (error: unknown, context?: AppErrorContext) => void;
    };
  }
}

export function reportAppError(error: unknown, context: AppErrorContext = {}) {
  if (typeof window === "undefined") return;
  window.__appErrorEvents?.captureException?.(error, context);
}
