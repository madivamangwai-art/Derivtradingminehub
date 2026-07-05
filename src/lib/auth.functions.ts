export function getFriendlyAuthMessage(error: unknown) {
  const message = error instanceof Error ? error.message : "";
  const code = typeof error === "object" && error !== null && "code" in error ? String((error as { code?: unknown }).code ?? "") : "";
  const text = `${code} ${message}`.toLowerCase();

  if (text.includes("missing supabase environment variable") || text.includes("missing supabase") || text.includes("service role key")) {
    return "Signup is temporarily unavailable because the authentication service is not configured. Please contact support.";
  }

  if (text.includes("email") && text.includes("already") && text.includes("registered")) {
    return "An account with this email already exists. Please sign in instead.";
  }

  if (text.includes("weak_password") || (text.includes("password") && text.includes("least 6"))) {
    return "Please choose a stronger password with at least 6 characters.";
  }

  if (text.includes("invalid_credentials") || text.includes("invalid login") || text.includes("wrong password")) {
    return "The email or password you entered is incorrect.";
  }

  if (text.includes("network") || text.includes("fetch") || text.includes("timed out")) {
    return "We couldn’t reach the service right now. Please check your connection and try again.";
  }

  if (text.includes("rate limit") || text.includes("too many requests")) {
    return "Too many attempts were made. Please wait a moment and try again.";
  }

  return "We couldn’t complete that request. Please try again in a moment.";
}

