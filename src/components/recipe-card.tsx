import { useState } from "react";
import { ChevronDown, ChevronUp, ExternalLink, Pencil, Trash2 } from "lucide-react";
import type { Recipe } from "@shared/types";
import { mondayOf } from "@shared/week";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useDeleteRecipe, useUpdateRecipe } from "@/lib/queries";
import { linkProps } from "@/lib/router";

const longDate = new Intl.DateTimeFormat("en-GB", {
  weekday: "short",
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});
const shortDate = new Intl.DateTimeFormat("en-GB", {
  weekday: "short",
  day: "numeric",
  month: "short",
  timeZone: "UTC",
});

const asDate = (iso: string) => new Date(iso + "T00:00:00Z");

function summary(recipe: Recipe, thisYear: number): string {
  const n = recipe.uses.length;
  if (n === 0) return "Not on the plan yet";
  const latest = asDate(recipe.uses[0]!.date);
  const when = latest.getUTCFullYear() === thisYear ? shortDate.format(latest) : longDate.format(latest);
  return `Planned ${n === 1 ? "once" : `${n} times`} · most recent ${when}`;
}

export function RecipeCard({ recipe }: { recipe: Recipe }) {
  const [mode, setMode] = useState<"view" | "edit" | "confirm-delete">("view");
  const [showHistory, setShowHistory] = useState(false);
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [error, setError] = useState<string | null>(null);
  const update = useUpdateRecipe();
  const remove = useDeleteRecipe();

  function startEdit() {
    setName(recipe.title ?? "");
    setUrl(recipe.url);
    setError(null);
    setMode("edit");
  }

  async function save() {
    const patch: { title?: string | null; url?: string } = {};
    if (name.trim() !== (recipe.title ?? "")) patch.title = name.trim() || null;
    if (url.trim() !== recipe.url) patch.url = url.trim();
    if (!Object.keys(patch).length) return setMode("view");
    try {
      await update.mutateAsync({ id: recipe.id, patch });
      setMode("view");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn’t save");
    }
  }

  const headingId = `recipe-${recipe.id}`;
  const historyId = `recipe-${recipe.id}-history`;

  return (
    <article aria-labelledby={headingId} className="rounded-xl border bg-card p-4 shadow-sm">
      {mode === "edit" ? (
        <form
          className="flex flex-col gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void save();
          }}
        >
          <h3 id={headingId} className="sr-only">
            Edit {recipe.displayName}
          </h3>
          <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
            Name
            <Input
              autoFocus
              value={name}
              placeholder={recipe.displayName}
              onChange={(e) => setName(e.target.value)}
            />
          </label>
          <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
            Link
            <Input type="url" value={url} onChange={(e) => setUrl(e.target.value)} />
          </label>
          {error && <p className="text-xs text-destructive">{error}</p>}
          <div className="flex gap-2">
            <Button type="submit" size="sm" disabled={update.isPending}>
              Save
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => setMode("view")}>
              Cancel
            </Button>
          </div>
        </form>
      ) : (
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <h3 id={headingId} className="font-serif text-[17px] leading-snug font-semibold text-pretty">
              {recipe.displayName}
            </h3>
            <a
              href={recipe.url}
              target="_blank"
              rel="noopener noreferrer"
              title={recipe.url}
              className="mt-0.5 inline-flex max-w-full items-center gap-1 text-xs text-muted-foreground hover:text-primary hover:underline"
            >
              <span className="truncate">{recipe.host}</span>
              <ExternalLink className="size-3 shrink-0" />
            </a>
            <p className="mt-2 text-xs text-muted-foreground">{summary(recipe, new Date().getFullYear())}</p>
          </div>
          {mode === "view" && (
            <div className="flex shrink-0 gap-0.5">
              <Button variant="ghost" size="icon-sm" aria-label={`Edit ${recipe.displayName}`} onClick={startEdit}>
                <Pencil />
              </Button>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={`Delete ${recipe.displayName}`}
                onClick={() => setMode("confirm-delete")}
              >
                <Trash2 />
              </Button>
            </div>
          )}
        </div>
      )}

      {mode === "confirm-delete" && (
        <div role="alert" className="mt-3 flex flex-wrap items-center gap-2 rounded-lg bg-accent px-3 py-2 text-xs">
          <span className="flex-1">
            Remove from the library?{" "}
            {recipe.uses.length > 0 && "Meals keep their names but lose the link."}
          </span>
          <Button
            size="sm"
            variant="destructive"
            className="h-7"
            disabled={remove.isPending}
            onClick={() => remove.mutate(recipe.id)}
          >
            Delete
          </Button>
          <Button size="sm" variant="ghost" className="h-7" onClick={() => setMode("view")}>
            Cancel
          </Button>
        </div>
      )}

      {recipe.uses.length > 0 && mode !== "edit" && (
        <div className="mt-2">
          <button
            type="button"
            aria-expanded={showHistory}
            aria-controls={historyId}
            onClick={() => setShowHistory((v) => !v)}
            className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
          >
            {showHistory ? <ChevronUp className="size-3.5" /> : <ChevronDown className="size-3.5" />}
            {showHistory ? "Hide history" : "Show history"}
          </button>
          {showHistory && (
            <ul id={historyId} className="mt-2 flex flex-col divide-y rounded-lg border">
              {recipe.uses.map((use) => (
                <li key={`${use.date}-${use.slot}`}>
                  <a
                    {...linkProps(`/?week=${mondayOf(use.date)}`)}
                    className="flex items-baseline gap-2 px-3 py-2 text-xs hover:bg-secondary"
                  >
                    <span className="w-28 shrink-0 tabular-nums text-muted-foreground">
                      {longDate.format(asDate(use.date))}
                    </span>
                    <span className="w-12 shrink-0 text-muted-foreground capitalize">{use.slot}</span>
                    <span className="min-w-0 flex-1 truncate">{use.title.split("\n")[0] || "—"}</span>
                  </a>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </article>
  );
}
