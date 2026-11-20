import { useState } from "react";
import { ChevronDown, ChevronUp, HardHat, MapPin, NotebookPen, Wrench } from "lucide-react";
import type { Doer, Job, JobPatch, Severity } from "@shared/types";
import { formatPence, parsePounds, penceToInput } from "@shared/money";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Segmented } from "@/components/segmented";
import { DOER_LABEL, DOER_OPTIONS, ROOMS_DATALIST_ID, SEVERITIES, SEVERITY_LABEL } from "@/lib/jobs";
import { useDeleteJob, useUpdateJob } from "@/lib/queries";
import { cn } from "@/lib/utils";

const doneDate = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric" });

/** Classes for the severity badge and the selected severity option. */
export const SEVERITY_TONE: Record<Severity, string> = {
  high: "bg-destructive text-white dark:bg-destructive/70",
  med: "bg-warm text-white dark:text-background",
  low: "bg-secondary text-muted-foreground",
};

export function SeverityBadge({ severity }: { severity: Severity }) {
  return (
    <Badge className={cn("border-transparent", SEVERITY_TONE[severity])}>
      {SEVERITY_LABEL[severity]}
    </Badge>
  );
}

function Chip({ icon: Icon, children }: { icon: typeof MapPin; children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
      <Icon className="size-3 shrink-0" />
      {children}
    </span>
  );
}

/** Reads a £ field: "" is no amount; anything unreadable is an error. */
function readMoney(value: string): { pence: number | null } | { error: string } {
  if (!value.trim()) return { pence: null };
  const pence = parsePounds(value);
  return pence === null ? { error: "Enter an amount like 25 or 12.50" } : { pence };
}

function CostPrompt({ job, onClose }: { job: Job; onClose: () => void }) {
  const [value, setValue] = useState(penceToInput(job.actualPence ?? job.estimatePence));
  const [error, setError] = useState<string | null>(null);
  const update = useUpdateJob();

  function save() {
    const money = readMoney(value);
    if ("error" in money) return setError(money.error);
    update.mutate({ id: job.id, patch: { actualPence: money.pence } });
    onClose();
  }

  return (
    <form
      className="flex flex-wrap items-center gap-2 border-t bg-accent/60 px-3.5 py-2.5 text-xs"
      onSubmit={(e) => {
        e.preventDefault();
        save();
      }}
    >
      <label htmlFor={`cost-${job.id}`} className="font-medium">
        Done! What did it cost?
      </label>
      <div className="relative">
        <span className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-muted-foreground">£</span>
        <Input
          id={`cost-${job.id}`}
          autoFocus
          inputMode="decimal"
          className="h-8 w-28 bg-card pl-6 text-xs md:text-xs"
          value={value}
          aria-invalid={error ? true : undefined}
          onChange={(e) => {
            setValue(e.target.value);
            setError(null);
          }}
        />
      </div>
      <Button type="submit" size="sm" className="h-8">
        Save
      </Button>
      <Button type="button" size="sm" variant="ghost" className="h-8" onClick={onClose}>
        Skip
      </Button>
      {error && <p className="w-full text-destructive">{error}</p>}
    </form>
  );
}

function JobEditor({ job, onClose }: { job: Job; onClose: () => void }) {
  const [title, setTitle] = useState(job.title);
  const [severity, setSeverity] = useState<Severity>(job.severity);
  const [room, setRoom] = useState(job.room ?? "");
  const [doer, setDoer] = useState<Doer | "none">(job.doer ?? "none");
  const [estimate, setEstimate] = useState(penceToInput(job.estimatePence));
  const [actual, setActual] = useState(penceToInput(job.actualPence));
  const [notes, setNotes] = useState(job.notes);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const update = useUpdateJob();
  const remove = useDeleteJob();
  const done = job.doneAt !== null;

  async function save() {
    if (!title.trim()) return setError("Give the job a name");
    const est = readMoney(estimate);
    const act = readMoney(actual);
    if ("error" in est) return setError(`Estimate: ${est.error}`);
    if ("error" in act) return setError(`Actual cost: ${act.error}`);

    const patch: JobPatch = {};
    if (title.trim() !== job.title) patch.title = title.trim();
    if (severity !== job.severity) patch.severity = severity;
    if ((room.trim() || null) !== job.room) patch.room = room;
    if ((doer === "none" ? null : doer) !== job.doer) patch.doer = doer === "none" ? null : doer;
    if (est.pence !== job.estimatePence) patch.estimatePence = est.pence;
    if (done && act.pence !== job.actualPence) patch.actualPence = act.pence;
    if (notes !== job.notes) patch.notes = notes;
    if (!Object.keys(patch).length) return onClose();
    try {
      await update.mutateAsync({ id: job.id, patch });
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn’t save");
    }
  }

  const id = (field: string) => `job-${job.id}-${field}`;
  const labelClass = "text-xs font-medium text-muted-foreground";

  return (
    <form
      className="flex flex-col gap-3 border-t px-3.5 py-3"
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
    >
      <div className="flex flex-col gap-1">
        <label htmlFor={id("title")} className={labelClass}>
          Job
        </label>
        <Input id={id("title")} value={title} maxLength={200} onChange={(e) => setTitle(e.target.value)} />
      </div>

      <div className="flex flex-wrap gap-x-4 gap-y-3">
        <div className="flex flex-col gap-1">
          <span className={labelClass}>Severity</span>
          <Segmented label="Severity" value={severity} options={SEVERITIES} onChange={setSeverity} activeClass={SEVERITY_TONE} />
        </div>
        <div className="flex flex-col gap-1">
          <span className={labelClass}>Who’ll do it</span>
          <Segmented label="Who’ll do it" value={doer} options={DOER_OPTIONS} onChange={setDoer} />
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="flex flex-col gap-1">
          <label htmlFor={id("room")} className={labelClass}>
            Room
          </label>
          <Input
            id={id("room")}
            list={ROOMS_DATALIST_ID}
            placeholder="e.g. Kitchen"
            maxLength={60}
            value={room}
            onChange={(e) => setRoom(e.target.value)}
          />
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor={id("estimate")} className={labelClass}>
            Estimate (£)
          </label>
          <Input id={id("estimate")} inputMode="decimal" placeholder="0" value={estimate} onChange={(e) => setEstimate(e.target.value)} />
        </div>
        {done && (
          <div className="flex flex-col gap-1">
            <label htmlFor={id("actual")} className={labelClass}>
              Actual cost (£)
            </label>
            <Input id={id("actual")} inputMode="decimal" placeholder="0" value={actual} onChange={(e) => setActual(e.target.value)} />
          </div>
        )}
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor={id("notes")} className={labelClass}>
          Notes
        </label>
        <Textarea
          id={id("notes")}
          maxLength={2000}
          placeholder="Measurements, part numbers, a tradesperson’s number…"
          className="min-h-16"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />
      </div>

      {error && <p className="text-xs text-destructive">{error}</p>}

      {confirmDelete ? (
        <div role="alert" className="flex flex-wrap items-center gap-2 rounded-lg bg-accent px-3 py-2 text-xs">
          <span className="flex-1">Delete this job for good?</span>
          <Button
            type="button"
            size="sm"
            variant="destructive"
            className="h-7"
            disabled={remove.isPending}
            onClick={() => remove.mutate(job.id)}
          >
            Delete
          </Button>
          <Button type="button" size="sm" variant="ghost" className="h-7" onClick={() => setConfirmDelete(false)}>
            Cancel
          </Button>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          <Button type="submit" size="sm" disabled={update.isPending}>
            Save
          </Button>
          <Button type="button" size="sm" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="ml-auto text-destructive hover:text-destructive"
            onClick={() => setConfirmDelete(true)}
          >
            Delete
          </Button>
        </div>
      )}
    </form>
  );
}

export function JobItem({ job, onToggle }: { job: Job; onToggle?: (id: number, done: boolean) => void }) {
  const [editing, setEditing] = useState(false);
  const [askCost, setAskCost] = useState(false);
  const update = useUpdateJob();
  const done = job.doneAt !== null;

  function toggle(checked: boolean) {
    update.mutate({ id: job.id, patch: { done: checked } });
    setAskCost(checked);
    onToggle?.(job.id, checked);
  }

  const cost =
    done && job.actualPence !== null
      ? `Cost ${formatPence(job.actualPence)}`
      : job.estimatePence !== null
        ? `Est. ${formatPence(job.estimatePence)}`
        : null;

  return (
    <article
      aria-label={job.title}
      className={cn("overflow-hidden rounded-xl border bg-card shadow-sm", done && "bg-card/60")}
    >
      <div className="flex items-start gap-3 px-3.5 py-3">
        <Checkbox
          checked={done}
          onCheckedChange={(v) => toggle(v === true)}
          aria-label={done ? `Mark “${job.title}” as not done` : `Mark “${job.title}” as done`}
          className="mt-0.5 size-5 rounded-full [&_svg]:size-3.5"
        />
        <div className="min-w-0 flex-1">
          <button
            type="button"
            onClick={() => setEditing((v) => !v)}
            className={cn(
              "text-left text-[15px] leading-snug font-medium text-pretty hover:underline",
              done && "text-muted-foreground line-through",
            )}
          >
            {job.title}
          </button>
          <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1">
            {!done && <SeverityBadge severity={job.severity} />}
            {job.room && <Chip icon={MapPin}>{job.room}</Chip>}
            {job.doer && <Chip icon={job.doer === "trade" ? HardHat : Wrench}>{DOER_LABEL[job.doer]}</Chip>}
            {cost && <span className="text-xs font-medium tabular-nums">{cost}</span>}
            {done && <span className="text-xs text-muted-foreground">Done {doneDate.format(job.doneAt!)}</span>}
            {job.notes.trim() && !editing && (
              <Chip icon={NotebookPen}>
                <span className="sr-only">Has notes</span>
              </Chip>
            )}
          </div>
        </div>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-expanded={editing}
          aria-label={editing ? `Close “${job.title}”` : `Edit “${job.title}”`}
          onClick={() => setEditing((v) => !v)}
          className="text-muted-foreground"
        >
          {editing ? <ChevronUp /> : <ChevronDown />}
        </Button>
      </div>

      {askCost && done && !editing && <CostPrompt job={job} onClose={() => setAskCost(false)} />}
      {editing && <JobEditor job={job} onClose={() => setEditing(false)} />}
    </article>
  );
}
