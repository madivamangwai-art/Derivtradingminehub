const pendingPatterns = [
  "pending",
  "processing",
  "still processing",
  "request cancelled",
  "cancelled by user",
  "user cancelled",
  "timeout",
  "timed out",
  "1032",
  "1037",
  "500.001.1001",
  "100.001.1001",
  "2001",
  "2002",
  "2003",
];

const terminalFailurePatterns = [
  "failed",
  "declined",
  "rejected",
  "invalid",
  "expired",
  "not completed",
  "insufficient",
  "account not found",
  "not found",
  "authorization",
  "cancelled",
];

export function isMpesaPendingStatus(resultCode?: unknown, errorCode?: unknown, resultDesc?: unknown) {
  const combined = [resultCode, errorCode, resultDesc].filter((value) => value != null && value !== "").map((value) => String(value));
  if (combined.length === 0) return true;

  const normalized = combined.map((value) => value.toLowerCase());
  const codes = combined.filter((value) => /^-?\d+(\.\d+)?$/.test(value));
  if (codes.some((value) => value === "0" || value === "0.0")) return false;

  if (normalized.some((value) => pendingPatterns.some((pattern) => value.includes(pattern)))) return true;
  if (normalized.some((value) => terminalFailurePatterns.some((pattern) => value.includes(pattern)))) return false;

  return true;
}

export function isMpesaTerminalFailure(resultCode?: unknown, errorCode?: unknown, resultDesc?: unknown) {
  if (resultCode == null && errorCode == null) return false;
  return !isMpesaPendingStatus(resultCode, errorCode, resultDesc);
}
