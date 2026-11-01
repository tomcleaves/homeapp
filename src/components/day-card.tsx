import type { Meal } from "@shared/types";
import { DAYS, SLOTS } from "@shared/week";
import { cn } from "@/lib/utils";
import { MealSlot } from "./meal-slot";

const dateFmt = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });

interface Props {
  date: string;
  dayIndex: number;
  isToday: boolean;
  meals: Meal[];
}

export function DayCard({ date, dayIndex, isToday, meals }: Props) {
  const day = DAYS[dayIndex]!;
  const nextDay = DAYS[(dayIndex + 1) % 7]!;

  return (
    <section
      aria-label={`${day.label} ${dateFmt.format(new Date(date + "T00:00:00Z"))}`}
      className={cn(
        "grid gap-3 rounded-xl border border-l-[3px] border-l-transparent bg-card p-4 shadow-sm",
        "sm:grid-cols-[7rem_1fr_1fr] sm:gap-4",
        isToday && "border-l-warm",
      )}
    >
      <div className="flex items-baseline gap-2 sm:flex-col sm:gap-0.5 sm:pt-6">
        <h2 className={cn("font-serif text-[16.5px] font-semibold", isToday && "text-warm")}>
          {day.label}
        </h2>
        <span className="text-xs text-muted-foreground tabular-nums">
          {dateFmt.format(new Date(date + "T00:00:00Z"))}
          {isToday && " · Today"}
        </span>
      </div>

      {SLOTS.map((slot) => (
        <MealSlot
          key={`${date}-${slot}`}
          date={date}
          slot={slot}
          dayLabel={day.label}
          nextDayLabel={nextDay.label}
          meal={meals.find((m) => m.date === date && m.slot === slot)}
        />
      ))}
    </section>
  );
}
