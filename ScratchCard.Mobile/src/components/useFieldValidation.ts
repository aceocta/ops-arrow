import { useCallback, useState } from "react";

/**
 * Shared field-level form-validation timing for mobile forms.
 *
 * The caller derives an `errors` map from current form state each render (a message string when a
 * field is invalid, else null). This hook owns only the *timing*: an error is surfaced for a field
 * once that field has been blurred (`touch`) OR the user has attempted to submit (`attemptSubmit`),
 * and then clears live because `errors` is recomputed every render. This is the standard mobile
 * pattern — don't nag while the user is still typing a fresh value; reveal on blur, then live.
 *
 * Usage:
 *   const errors = { name: name.trim() ? null : "Enter a name.", qty: qty > 0 ? null : "Min 1." };
 *   const v = useFieldValidation(errors);
 *   // FloatingLabelInput: error={v.showError("name")} onBlur={() => v.touch("name")}
 *   // raw TextInput:      onBlur={() => v.touch("name")} + <FieldError error={v.showError("name")} />
 *   // chip/date (no blur): <FieldError error={v.showError("kind")} />  (reveals on submit only)
 *   // submit:  if (!v.attemptSubmit()) return;  else mutate();
 *
 * Fields that have no blur event (chip selectors, date pickers) simply never call touch(), so their
 * error reveals on submit only — which is the correct behaviour for those controls.
 */
export function useFieldValidation<T extends string>(errors: Record<T, string | null>) {
  const [touched, setTouched] = useState<Partial<Record<T, boolean>>>({});
  const [submitAttempted, setSubmitAttempted] = useState(false);

  const touch = useCallback((field: T) => {
    setTouched((prev) => (prev[field] ? prev : { ...prev, [field]: true }));
  }, []);

  // The visible error for a field: null until it's been touched or a submit was attempted.
  const showError = (field: T): string | null =>
    touched[field] || submitAttempted ? errors[field] : null;

  const hasErrors = Object.values(errors).some(Boolean);

  // Call from the submit handler: reveals every field's error and returns whether the form is valid.
  const attemptSubmit = useCallback(() => {
    setSubmitAttempted(true);
    return !Object.values(errors).some(Boolean);
  }, [errors]);

  // Clear all reveal state so nothing shows until the user interacts again. Call this when a modal
  // form re-opens (or after a successful submit on a form that stays mounted) — otherwise a prior
  // submit's revealed errors would linger on the freshly-reset fields. Full-screen forms that
  // navigate away on success don't need it.
  const reset = useCallback(() => {
    setTouched({});
    setSubmitAttempted(false);
  }, []);

  return { touch, showError, hasErrors, submitAttempted, attemptSubmit, reset };
}
