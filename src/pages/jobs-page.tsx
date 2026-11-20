import { useMemo, useRef, useState } from "react";
import { ChevronDown, ChevronUp, Plus, Search } from "lucide-react";
import type { Doer, Job, Severity } from "@shared/types";
import { formatPence, parsePounds } from "@shared/money";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { JobItem, SEVERITY_TONE } from "@/components/job-item";
import { NativeSelect } from "@/components/native-select";
import { LoadError, Notice } from "@/components/notice";
import { Segmented } from "@/components/segmented";
import {
  DOER_OPTIONS,
  JOB_SORTS,
  jobMatches,
  jobSorters,
  ROOMS_DATALIST_ID,
  roomsOf,
  SEVERITIES,
  type JobSort,
} from "@/lib/jobs";
import { useCreateJob, useJobs } from "@/lib/queries";
import { fold } from "@/lib/search";
import { cn } from "@/lib/utils";

const labelClass = "text-xs font-medium text-muted-foreground";

function Stat({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="flex min-w-0 flex-col rounded-xl border bg-card px-3 py-2.5 shadow-sm sm:px-3.5 sm:py-3">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="font-serif text-xl font-semibold tabular-nums sm:text-2xl">{value}</span>
      {note && <span className="text-[11px] leading-tight text-muted-foreground">{note}</span>}
    </div>
  );
}

function Summary({ jobs }: { jobs: Job[] }) {
  const open = jobs.filter((j) => j.doneAt === null);
  const done = jobs.filter((j) => j.doneAt !== null);
  const high = open.filter((j) => j.severity === "high").length;
  const unestimated = open.filter((j) => j.estimatePence === null).length;
  const uncosted = done.filter((j) => j.actualPence === null).length;
  const toSpend = open.reduce((sum, j) => sum + (j.estimatePence ?? 0), 0);
  const spent = done.reduce((sum, j) => sum + (j.actualPence ?? 0), 0);

  return (
    <div className="grid grid-cols-3 gap-2">
      <Stat label="To do" value={String(open.length)} note={high ? `${high} high` : undefined} />
      <Stat
        label="Estimated"
        value={formatPence(toSpend)}
        note={unestimated ? `${unestimated} not estimated` : undefined}
      />
      <Stat label="Spent" value={formatPence(spent)} note={uncosted ? `${uncosted} with no cost` : undefined} />
    </div>
  );
}

function AddJobForm() {
  const [title, setTitle] = useState("");
  const [severity, setSeverity] = useState<Severity>("med");
  const [details, setDetails] = useState(false);
  const [room, setRoom] = useState("");
  const [doer, setDoer] = useState<Doer | "none">("none");
  const [estimate, setEstimate] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const titleRef = useRef<HTMLInputElement>(null);
  const create = useCreateJob();

  async function submit() {
    if (!title.trim()) return setError("What needs doing?");
    let estimatePence: number | null = null;
    if (estimate.trim()) {
      estimatePence = parsePounds(estimate);
      if (estimatePence === null) return setError("Enter the estimate like 25 or 12.50");
    }
    try {
      await create.mutateAsync({
        title: title.trim(),
        severity,
        room: room || null,
        doer: doer === "none" ? null : doer,
        notes,
        estimatePence,
      });
      setTitle("");
      setSeverity("med");
      setRoom("");
      setDoer("none");
      setEstimate("");
      setNotes("");
      setError(null);
      titleRef.current?.focus();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn’t add that job");
    }
  }

  return (
    <Card className="gap-0 p-3.5">
      <form
        className="flex flex-col gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <div className="flex gap-2">
          <Input
            ref={titleRef}
            aria-label="New job"
            placeholder="Add a job, e.g. Fix the dripping tap"
            maxLength={200}
            value={title}
            aria-invalid={error ? true : undefined}
            onChange={(e) => {
              setTitle(e.target.value);
              setError(null);
            }}
          />
          <Button type="submit" disabled={create.isPending}>
            <Plus /> Add
          </Button>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Segmented label="Severity" value={severity} options={SEVERITIES} onChange={setSeverity} activeClass={SEVERITY_TONE} />
          <button
            type="button"
            aria-expanded={details}
            onClick={() => setDetails((v) => !v)}
            className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
          >
            {details ? <ChevronUp className="size-3.5" /> : <ChevronDown className="size-3.5" />}
            {details ? "Fewer details" : "More details"}
          </button>
        </div>

        {details && (
          <div className="flex flex-col gap-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="flex flex-col gap-1">
                <label htmlFor="new-job-room" className={labelClass}>
                  Room
                </label>
                <Input
                  id="new-job-room"
                  list={ROOMS_DATALIST_ID}
                  placeholder="e.g. Kitchen"
                  maxLength={60}
                  value={room}
                  onChange={(e) => setRoom(e.target.value)}
                />
              </div>
              <div className="flex flex-col gap-1">
                <label htmlFor="new-job-estimate" className={labelClass}>
                  Estimate (£)
                </label>
                <Input
                  id="new-job-estimate"
                  inputMode="decimal"
                  placeholder="0"
                  value={estimate}
                  onChange={(e) => {
                    setEstimate(e.target.value);
                    setError(null);
                  }}
                />
              </div>
            </div>
            <div className="flex flex-col gap-1">
              <span className={labelClass}>Who’ll do it</span>
              <Segmented label="Who’ll do it" value={doer} options={DOER_OPTIONS} onChange={setDoer} className="self-start" />
            </div>
            <div className="flex flex-col gap-1">
              <label htmlFor="new-job-notes" className={labelClass}>
                Notes
              </label>
              <Textarea
                id="new-job-notes"
                maxLength={2000}
                placeholder="Measurements, part numbers, a tradesperson’s number…"
                className="min-h-16"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </div>
          </div>
        )}
        {error && <p className="text-xs text-destructive">{error}</p>}
      </form>
    </Card>
  );
}

type SeverityFilter = Severity | "all";
type DoerFilter = Doer | "none" | "all";

export function JobsPage() {
  const jobs = useJobs();
  const [query, setQuery] = useState("");
  const [severity, setSeverity] = useState<SeverityFilter>("all");
  const [room, setRoom] = useState("all");
  const [doer, setDoer] = useState<DoerFilter>("all");
  const [sort, setSort] = useState<JobSort>("urgent");
  const [showDone, setShowDone] = useState(false);
  // Jobs ticked off on this visit stay where they are (struck through), so the
  // "what did it cost?" prompt can be answered and a mis-tap undone.
  const [justDone, setJustDone] = useState<Set<number>>(new Set());

  const all = jobs.data?.jobs;
  const rooms = useMemo(() => roomsOf(all ?? []), [all]);

  const filtered = useMemo(() => {
    const q = query.trim();
    return (all ?? []).filter(
      (j) =>
        (!q || jobMatches(j, q)) &&
        (severity === "all" || j.severity === severity) &&
        (room === "all" || (j.room !== null && fold(j.room) === fold(room))) &&
        (doer === "all" || (j.doer ?? "none") === doer),
    );
  }, [all, query, severity, room, doer]);

  const toDo = filtered.filter((j) => j.doneAt === null || justDone.has(j.id)).sort(jobSorters[sort]);
  const done = filtered
    .filter((j) => j.doneAt !== null && !justDone.has(j.id))
    .sort((a, b) => (b.doneAt ?? 0) - (a.doneAt ?? 0));
  const filtering = Boolean(query.trim()) || severity !== "all" || room !== "all" || doer !== "all";

  function onToggle(id: number, isDone: boolean) {
    setJustDone((prev) => {
      const next = new Set(prev);
      if (isDone) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  function clearFilters() {
    setQuery("");
    setSeverity("all");
    setRoom("all");
    setDoer("all");
  }

  return (
    <main className="flex flex-col gap-4" aria-busy={jobs.isPending}>
      <div>
        <h2 className="font-serif text-2xl font-semibold">House jobs</h2>
        <p className="text-[13px] text-muted-foreground">
          Everything that needs doing around the house. Tick jobs off as you go.
        </p>
      </div>

      <datalist id={ROOMS_DATALIST_ID}>
        {rooms.map((r) => (
          <option key={r} value={r} />
        ))}
      </datalist>

      {jobs.isError ? (
        <LoadError error={jobs.error} what="your jobs" retry={() => void jobs.refetch()} />
      ) : !all ? (
        <div className="flex flex-col gap-2.5" aria-hidden>
          {[0, 1, 2].map((i) => (
            <Card key={i} className="h-16 animate-pulse py-0" />
          ))}
        </div>
      ) : (
        <>
          <Summary jobs={all} />
          <AddJobForm />

          {all.length > 0 && (
            <div className="flex flex-col gap-2">
              <div className="relative">
                <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  type="search"
                  placeholder="Search jobs, rooms or notes…"
                  aria-label="Search jobs"
                  className="bg-card pl-9"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
              </div>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <Segmented
                  label="Filter by severity"
                  value={severity}
                  options={[{ value: "all", label: "All" }, ...[...SEVERITIES].reverse()]}
                  onChange={setSeverity}
                />
                <div className="grid grid-cols-3 gap-2 sm:flex sm:flex-1">
                <NativeSelect aria-label="Filter by room" value={room} onChange={(e) => setRoom(e.target.value)} className="h-8 text-xs">
                  <option value="all">All rooms</option>
                  {rooms.map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </NativeSelect>
                <NativeSelect
                  aria-label="Filter by who’ll do it"
                  value={doer}
                  onChange={(e) => setDoer(e.target.value as DoerFilter)}
                  className="h-8 text-xs"
                >
                  <option value="all">DIY & trade</option>
                  {DOER_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </NativeSelect>
                <NativeSelect
                  aria-label="Sort jobs"
                  value={sort}
                  onChange={(e) => setSort(e.target.value as JobSort)}
                  className="h-8 text-xs sm:ml-auto"
                >
                  {JOB_SORTS.map((s) => (
                    <option key={s.value} value={s.value}>
                      {s.label}
                    </option>
                  ))}
                </NativeSelect>
                </div>
              </div>
            </div>
          )}

          {all.length === 0 ? (
            <Notice title="Nothing on the list yet">
              Add the first job above. Give it a severity, and open “More details” for the room, who’ll do it and a
              rough cost.
            </Notice>
          ) : toDo.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              {filtering ? (
                <>
                  No jobs to do match these filters.{" "}
                  <button className="font-medium text-primary underline" onClick={clearFilters}>
                    Clear filters
                  </button>
                </>
              ) : (
                "All done. Nothing left on the list."
              )}
            </p>
          ) : (
            <ul aria-label="Jobs to do" className="flex flex-col gap-2">
              {toDo.map((j) => (
                <li key={j.id}>
                  <JobItem job={j} onToggle={onToggle} />
                </li>
              ))}
            </ul>
          )}

          {done.length > 0 && (
            <section className="flex flex-col gap-2">
              <button
                type="button"
                aria-expanded={showDone}
                onClick={() => setShowDone((v) => !v)}
                className={cn(
                  "inline-flex items-center gap-1.5 self-start text-sm font-medium text-muted-foreground hover:text-foreground",
                )}
              >
                {showDone ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
                Done ({done.length})
              </button>
              {showDone && (
                <ul aria-label="Done jobs" className="flex flex-col gap-2">
                  {done.map((j) => (
                    <li key={j.id}>
                      <JobItem job={j} onToggle={onToggle} />
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}
        </>
      )}
    </main>
  );
}
