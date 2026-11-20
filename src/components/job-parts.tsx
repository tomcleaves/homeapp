import { useState } from "react";
import { ExternalLink, Plus, X } from "lucide-react";
import type { Job, Part } from "@shared/types";
import { recipeHost } from "@shared/recipes";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { useAddPart, useDeletePart, useUpdatePart } from "@/lib/queries";
import { cn } from "@/lib/utils";

/** One part: bought tick-box, name, shop link, and (optionally) remove. */
export function PartRow({ part, removable = true }: { part: Part; removable?: boolean }) {
  const update = useUpdatePart();
  const remove = useDeletePart();
  const bought = part.boughtAt !== null;

  return (
    <li className="flex items-center gap-2.5 py-1.5">
      <Checkbox
        checked={bought}
        onCheckedChange={(v) => update.mutate({ id: part.id, patch: { bought: v === true } })}
        aria-label={bought ? `Mark “${part.name}” as not bought` : `Mark “${part.name}” as bought`}
      />
      <span className={cn("min-w-0 flex-1 text-sm text-pretty", bought && "text-muted-foreground line-through")}>
        {part.name}
      </span>
      {part.url && (
        <a
          href={part.url}
          target="_blank"
          rel="noopener noreferrer"
          title={part.url}
          className="inline-flex max-w-[45%] shrink-0 items-center gap-1 rounded-full bg-accent px-2 py-0.5 text-xs font-medium text-primary hover:underline"
        >
          <span className="truncate">{recipeHost(part.url)}</span>
          <ExternalLink className="size-3 shrink-0" />
        </a>
      )}
      {removable && (
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          className="size-6 shrink-0 text-muted-foreground"
          aria-label={`Remove “${part.name}”`}
          disabled={remove.isPending}
          onClick={() => remove.mutate(part.id)}
        >
          <X className="size-3" />
        </Button>
      )}
    </li>
  );
}

function AddPartForm({ jobId }: { jobId: number }) {
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [error, setError] = useState<string | null>(null);
  const add = useAddPart();

  async function submit() {
    if (!name.trim()) return setError("Name the part");
    const link = url.trim();
    try {
      await add.mutateAsync({
        jobId,
        input: { name: name.trim(), url: link ? (/^[a-z][a-z0-9+.-]*:/i.test(link) ? link : `https://${link}`) : null },
      });
      setName("");
      setUrl("");
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn’t add that part");
    }
  }

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex flex-col gap-1.5 sm:flex-row">
        <Input
          aria-label="Part to buy"
          placeholder="Part to buy, e.g. 15mm tap washer"
          maxLength={200}
          className="h-8 text-xs sm:flex-[3] md:text-xs"
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            setError(null);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              void submit();
            }
          }}
        />
        <div className="flex gap-1.5 sm:flex-[2]">
          <Input
            aria-label="Shop link (optional)"
            inputMode="url"
            placeholder="Shop link (optional)"
            className="h-8 text-xs md:text-xs"
            value={url}
            onChange={(e) => {
              setUrl(e.target.value);
              setError(null);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                void submit();
              }
            }}
          />
          <Button type="button" size="sm" className="h-8" disabled={add.isPending} onClick={() => void submit()}>
            <Plus /> Add
          </Button>
        </div>
      </div>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}

/** A job's parts to buy, edited in place (each change saves straight away). */
export function JobParts({ job }: { job: Job }) {
  return (
    <section aria-label={`Parts to buy for ${job.title}`} className="flex flex-col gap-1.5 border-t px-3.5 py-3">
      <h4 className="text-xs font-medium text-muted-foreground">Parts to buy</h4>
      {job.parts.length > 0 && (
        <ul className="flex flex-col divide-y">
          {job.parts.map((p) => (
            <PartRow key={p.id} part={p} />
          ))}
        </ul>
      )}
      <AddPartForm jobId={job.id} />
    </section>
  );
}
