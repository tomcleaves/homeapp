import { LogOut } from "lucide-react";
import { DAYS, localToday, weekDates } from "@shared/week";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { DayCard } from "@/components/day-card";
import { SaveStatus } from "@/components/save-status";
import { WeekNav } from "@/components/week-nav";
import { SignedOutError } from "@/lib/api";
import { useMe, useWeek } from "@/lib/queries";
import { useWeekParam } from "@/lib/use-week-param";

// Cloudflare Access's own sign-out endpoint, available on any Access-protected host.
const SIGN_OUT_URL = "/cdn-cgi/access/logout";

function Notice({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Card className="gap-3 border-warm/40 bg-accent">
      <CardHeader>
        <CardTitle className="font-serif text-lg">{title}</CardTitle>
        <CardDescription className="text-accent-foreground/80">{children}</CardDescription>
      </CardHeader>
    </Card>
  );
}

export default function App() {
  const [weekStart, goToWeek] = useWeekParam();
  const me = useMe();
  const week = useWeek(weekStart);
  const today = localToday();

  const signedOut = me.error instanceof SignedOutError || week.error instanceof SignedOutError;

  return (
    <div className="mx-auto flex min-h-svh w-full max-w-3xl flex-col gap-5 px-4 pt-8 pb-16 sm:px-5">
      <header className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <div>
          <h1 className="font-serif text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
            The Weekly Table
          </h1>
          <p className="mt-1 text-[13px] text-muted-foreground">
            Lunch &amp; dinner for the week, shared between the two of you.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <SaveStatus />
          {me.data && (
            <span className="hidden max-w-48 truncate text-xs text-muted-foreground sm:inline">
              {me.data.email}
            </span>
          )}
          <Button variant="ghost" size="sm" asChild>
            <a href={SIGN_OUT_URL}>
              <LogOut /> Sign out
            </a>
          </Button>
        </div>
      </header>

      <WeekNav weekStart={weekStart} onChange={goToWeek} />

      {signedOut ? (
        <Notice title="You’ve been signed out">
          Your session ended.{" "}
          <button className="font-medium underline" onClick={() => window.location.reload()}>
            Sign in again
          </button>{" "}
          to keep planning.
        </Notice>
      ) : week.isError ? (
        <Notice title="Couldn’t load this week">
          {week.error.message}.{" "}
          <button className="font-medium underline" onClick={() => void week.refetch()}>
            Try again
          </button>
        </Notice>
      ) : (
        <main className="flex flex-col gap-2.5" aria-busy={week.isPending}>
          {weekDates(weekStart).map((date, i) =>
            week.data ? (
              <DayCard
                key={date}
                date={date}
                dayIndex={i}
                isToday={date === today}
                meals={week.data.meals}
              />
            ) : (
              <Card key={date} className="h-28 animate-pulse py-0" aria-hidden>
                <CardContent className="pt-4 font-serif text-muted-foreground/60">
                  {DAYS[i]!.label}
                </CardContent>
              </Card>
            ),
          )}
        </main>
      )}

      <footer className="mt-4 text-center text-xs text-muted-foreground">
        One week at a time. Use the arrows for other weeks.
      </footer>
    </div>
  );
}
