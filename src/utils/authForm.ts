// Presentation-level validation only. AuthService remains the authority for
// requests, server validation, credentials, token persistence and account setup.
export type AuthMode = "login" | "register";
export type AuthFieldName = "fullName" | "email" | "password";

export interface AuthFormValues {
  fullName: string;
  email: string;
  password: string;
}

export type AuthFieldErrors = Partial<Record<AuthFieldName, string>>;

// Preserve the existing registration contract; usernames are generated from
// the full name, not sent through a new or changed API field.
export function usernameFromName(fullName: string): string {
  return fullName
    .toLowerCase()
    .replace(/\s+/g, "_")
    .replace(/[^a-z0-9_]/g, "");
}

export function validateAuthForm(
  mode: AuthMode,
  values: AuthFormValues,
): AuthFieldErrors {
  const errors: AuthFieldErrors = {};
  if (mode === "register") {
    if (!values.fullName.trim()) {
      errors.fullName = "Enter your full name.";
    } else if (!usernameFromName(values.fullName)) {
      errors.fullName =
        "Include a letter from a–z or a number to create your username.";
    }
  }

  if (!values.email.trim()) {
    errors.email =
      mode === "login"
        ? "Enter your email or username."
        : "Enter your email address.";
  } else if (
    mode === "register" &&
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.email.trim())
  ) {
    errors.email = "Enter a valid email address.";
  }

  // Do not impose an undocumented length/complexity policy or trim passwords.
  // Strength hints are advisory; server rejection messages are displayed as-is.
  if (!values.password) errors.password = "Enter your password.";
  return errors;
}

export function passwordStrength(password: string): {
  score: number;
  label: string;
} {
  if (!password) return { score: 0, label: "Not set" };
  const score = Math.max(
    1,
    Number(password.length >= 8) +
      Number(password.length >= 12) +
      Number(/[a-z]/i.test(password) && /[^a-z]/i.test(password)),
  );
  return {
    score,
    label: score === 3 ? "Strong" : score === 2 ? "Good" : "Weak",
  };
}

export function authErrorMessage(error: unknown, mode: AuthMode): string {
  if (
    error &&
    typeof error === "object" &&
    "message" in error &&
    typeof error.message === "string" &&
    error.message
  ) {
    return error.message;
  }
  return mode === "login"
    ? "Please check your credentials and try again."
    : "Something went wrong. Please try again.";
}
