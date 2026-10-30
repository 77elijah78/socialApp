import { useEffect, useRef, useState } from "react";
import { router } from "expo-router";

import { authService } from "@/services/AuthService";
import { useAppDispatch } from "@/store/hooks";
import {
  authErrorMessage,
  usernameFromName,
  validateAuthForm,
  type AuthFieldErrors,
  type AuthFieldName,
  type AuthFormValues,
  type AuthMode,
} from "@/utils/authForm";

// Form state/orchestration is kept out of the visual components. Authentication
// still goes through the same AuthService methods and Redux dispatch contract.
export function useAuthForm(mode: AuthMode) {
  const dispatch = useAppDispatch();
  const [values, setValues] = useState<AuthFormValues>({
    fullName: "",
    email: "",
    password: "",
  });
  const [touched, setTouched] = useState<
    Partial<Record<AuthFieldName, boolean>>
  >({});
  const [submitted, setSubmitted] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef(false);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const validation = validateAuthForm(mode, values);
  const errors: AuthFieldErrors = {};
  for (const field of ["fullName", "email", "password"] as const) {
    if (submitted || touched[field]) errors[field] = validation[field];
  }

  const change = (field: AuthFieldName, value: string) => {
    setValues((previous) => ({ ...previous, [field]: value }));
    setError(null);
  };
  const blur = (field: AuthFieldName) => {
    setTouched((previous) => ({ ...previous, [field]: true }));
  };

  // Returning an invalid field lets the view focus it without putting refs or
  // scroll/keyboard behavior into this hook. The ref guard also covers rapid taps
  // before the loading state commits, not just the visible disabled button.
  const submit = async (): Promise<AuthFieldName | undefined> => {
    if (inFlight.current) return;
    setSubmitted(true);
    setError(null);
    const invalid = (["fullName", "email", "password"] as const).find(
      (field) => validation[field],
    );
    if (invalid) return invalid;

    inFlight.current = true;
    setIsSubmitting(true);
    try {
      if (mode === "login") {
        await authService.login(values.email.trim(), values.password, dispatch);
      } else {
        await authService.register(
          values.email.trim(),
          values.password,
          usernameFromName(values.fullName),
          values.fullName || undefined,
          dispatch,
        );
      }
      if (mounted.current) router.replace("/(tabs)/home");
    } catch (failure: unknown) {
      if (mounted.current) setError(authErrorMessage(failure, mode));
    } finally {
      inFlight.current = false;
      if (mounted.current) setIsSubmitting(false);
    }
  };

  return { values, errors, error, isSubmitting, change, blur, submit };
}
