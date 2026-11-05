import { DAYS, localToday, weekDates } from "@shared/week";
import { Card, CardContent } from "@/components/ui/card";
import { DayCard } from "@/components/day-card";
import { LoadError } from "@/components/notice";
import { WeekNav } from "@/components/week-nav";
import { useWeek } from "@/lib/queries";
import { useWeekParam } from "@/lib/use-week-param";

export function WeekPage() {
  const [weekStart, goToWeek] = useWeekParam();
  const week = useWeek(weekStart);
  const today = localToday();

  return (
    <>
      <WeekNav weekStart={weekStart} onChange={goToWeek} />

      {week.isError ? (
        <LoadError error={week.error} what="this week" retry={() => void week.refetch()} />
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
    </>
  );
}
