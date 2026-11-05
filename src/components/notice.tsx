import type { ReactNode } from "react";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { SignedOutError } from "@/lib/api";

export function Notice({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Card className="gap-3 border-warm/40 bg-accent">
      <CardHeader>
        <CardTitle className="font-serif text-lg">{title}</CardTitle>
        <CardDescription className="text-accent-foreground/80">{children}</CardDescription>
      </CardHeader>
    </Card>
  );
}

/** The right message for a failed load: signed out, or something else with a retry. */
export function LoadError({ error, what, retry }: { error: Error; what: string; retry: () => void }) {
  if (error instanceof SignedOutError) {
    return (
      <Notice title="You’ve been signed out">
        Your session ended.{" "}
        <button className="font-medium underline" onClick={() => window.location.reload()}>
          Sign in again
        </button>{" "}
        to carry on.
      </Notice>
    );
  }
  return (
    <Notice title={`Couldn’t load ${what}`}>
      {error.message}.{" "}
      <button className="font-medium underline" onClick={retry}>
        Try again
      </button>
    </Notice>
  );
}
