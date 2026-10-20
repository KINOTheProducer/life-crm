"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { authClient } from "@/lib/auth-client";

export function AuthForm({ mode }: { mode: "sign-in" | "sign-up" }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const isSignUp = mode === "sign-up";

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const email = String(form.get("email"));
    const password = String(form.get("password"));
    setPending(true);
    setError(null);

    const { error } = isSignUp
      ? await authClient.signUp.email({
          email,
          password,
          name: String(form.get("name")),
          timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        })
      : await authClient.signIn.email({ email, password });

    setPending(false);
    if (error) {
      setError(error.message ?? "Something went wrong");
      return;
    }
    router.push("/dashboard");
    router.refresh();
  }

  return (
    <div className="grid gap-6">
      <div className="grid gap-2">
        <h1 className="type-display text-[2.5rem] leading-none">{isSignUp ? "Create your account." : "Welcome back."}</h1>
        <p className="text-muted-foreground">
          {isSignUp ? "Start keeping track of the people who matter." : "Sign in to see your people."}
        </p>
      </div>
      <form onSubmit={onSubmit} className="grid gap-4">
        {isSignUp && (
          <div className="grid gap-2">
            <Label htmlFor="name">Name</Label>
            <Input id="name" name="name" required autoComplete="name" />
          </div>
        )}
        <div className="grid gap-2">
          <Label htmlFor="email">Email</Label>
          <Input id="email" name="email" type="email" required autoComplete="email" />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="password">Password</Label>
          <Input
            id="password"
            name="password"
            type="password"
            required
            minLength={10}
            autoComplete={isSignUp ? "new-password" : "current-password"}
          />
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <Button type="submit" size="lg" disabled={pending}>
          {pending ? "Please wait…" : isSignUp ? "Create account" : "Sign in"}
        </Button>
        <p className="text-center text-sm text-muted-foreground">
          {isSignUp ? "Already have an account? " : "New here? "}
          <Link href={isSignUp ? "/sign-in" : "/sign-up"} className="text-foreground underline underline-offset-4">
            {isSignUp ? "Sign in" : "Create an account"}
          </Link>
        </p>
      </form>
    </div>
  );
}
