import { startTransition, type FormEvent } from "react";

/**
 * onSubmit handler that runs a form action without React's automatic form reset, so a
 * validation error doesn't wipe what the person typed. Keeps the submitter's name/value.
 */
export function submitKeepingValues(action: (form: FormData) => void) {
  return (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const submitter = (e.nativeEvent as SubmitEvent).submitter;
    const form = new FormData(e.currentTarget, submitter);
    startTransition(() => action(form));
  };
}
