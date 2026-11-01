import { useCallback, useEffect, useState } from "react";
import { isIsoDate, localToday, mondayOf } from "@shared/week";

function readWeek(): string {
  const param = new URLSearchParams(window.location.search).get("week");
  return mondayOf(param && isIsoDate(param) ? param : localToday());
}

/** The week being viewed, kept in the URL (?week=YYYY-MM-DD) so it survives reloads. */
export function useWeekParam() {
  const [weekStart, setWeekStart] = useState(readWeek);

  useEffect(() => {
    const onPop = () => setWeekStart(readWeek());
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  const goTo = useCallback((date: string) => {
    const monday = mondayOf(date);
    const url = new URL(window.location.href);
    if (monday === mondayOf(localToday())) url.searchParams.delete("week");
    else url.searchParams.set("week", monday);
    window.history.pushState(null, "", url);
    setWeekStart(monday);
  }, []);

  return [weekStart, goTo] as const;
}
