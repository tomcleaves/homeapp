import { ChevronLeft, ChevronRight } from "lucide-react";
import { addDays, localToday, mondayOf } from "@shared/week";
import { Button } from "@/components/ui/button";

const short = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
const dayOnly = new Intl.DateTimeFormat("en-GB", { day: "numeric", timeZone: "UTC" });
const withYear = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});

export function formatWeekRange(monday: string): string {
  const start = new Date(monday + "T00:00:00Z");
  const end = new Date(addDays(monday, 6) + "T00:00:00Z");
  const sameYear = start.getUTCFullYear() === end.getUTCFullYear();
  const sameMonth = sameYear && start.getUTCMonth() === end.getUTCMonth();
  if (sameMonth) return `${dayOnly.format(start)}–${withYear.format(end)}`;
  if (sameYear) return `${short.format(start)} – ${withYear.format(end)}`;
  return `${withYear.format(start)} – ${withYear.format(end)}`;
}

interface Props {
  weekStart: string;
  onChange: (date: string) => void;
}

export function WeekNav({ weekStart, onChange }: Props) {
  const isThisWeek = weekStart === mondayOf(localToday());
  return (
    <nav
      aria-label="Week"
      className="flex items-center gap-2 rounded-xl border bg-card px-3 py-2.5 shadow-sm"
    >
      <Button
        variant="outline"
        size="icon"
        aria-label="Previous week"
        onClick={() => onChange(addDays(weekStart, -7))}
      >
        <ChevronLeft />
      </Button>
      <span className="flex-1 text-center text-[15px] font-medium tabular-nums">
        {formatWeekRange(weekStart)}
      </span>
      {!isThisWeek && (
        <Button
          variant="outline"
          size="sm"
          className="text-primary"
          onClick={() => onChange(localToday())}
        >
          This week
        </Button>
      )}
      <Button
        variant="outline"
        size="icon"
        aria-label="Next week"
        onClick={() => onChange(addDays(weekStart, 7))}
      >
        <ChevronRight />
      </Button>
    </nav>
  );
}
