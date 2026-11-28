import { useMemo, useState } from "react";
import { Plus, Search } from "lucide-react";
import type { Recipe } from "@shared/types";
import { normaliseRecipeUrl } from "@shared/recipes";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/native-select";
import { LoadError, Notice } from "@/components/notice";
import { RecipeCard } from "@/components/recipe-card";
import { useCreateRecipe, useRecipes } from "@/lib/queries";
import { linkProps } from "@/lib/router";
import { fold, matchesSearch } from "@shared/search";

type Sort = "recent" | "most" | "name";

const SORTS: { value: Sort; label: string }[] = [
  { value: "recent", label: "Recently planned" },
  { value: "most", label: "Most planned" },
  { value: "name", label: "A–Z" },
];

/** Latest plan date, or when it was added for recipes never planned. */
const recency = (r: Recipe) => r.uses[0]?.date ?? new Date(r.createdAt).toISOString().slice(0, 10);

const sorters: Record<Sort, (a: Recipe, b: Recipe) => number> = {
  recent: (a, b) => recency(b).localeCompare(recency(a)) || b.id - a.id,
  most: (a, b) => b.uses.length - a.uses.length || recency(b).localeCompare(recency(a)),
  name: (a, b) => fold(a.displayName).localeCompare(fold(b.displayName)),
};

function AddRecipeForm({ existing, onDone }: { existing: Recipe[]; onDone: (message: string) => void }) {
  const [url, setUrl] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const create = useCreateRecipe();

  async function submit() {
    const raw = url.trim();
    if (!raw) return setError("Paste the recipe’s link");
    const full = /^[a-z][a-z0-9+.-]*:/i.test(raw) ? raw : `https://${raw}`;
    const already = existing.find((r) => r.url === normaliseRecipeUrl(full));
    try {
      const { recipe } = await create.mutateAsync({ url: full, title: name.trim() || null });
      onDone(already ? `“${recipe.displayName}” was already in the library` : `Added “${recipe.displayName}”`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn’t add that recipe");
    }
  }

  return (
    <Card className="gap-3 p-4">
      <form
        className="flex flex-col gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <h3 className="font-serif text-base font-semibold">Add a recipe</h3>
        <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
          Link
          <Input
            autoFocus
            inputMode="url"
            placeholder="https://…"
            value={url}
            aria-invalid={error ? true : undefined}
            onChange={(e) => {
              setUrl(e.target.value);
              setError(null);
            }}
          />
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
          Name <span className="font-normal">(optional)</span>
          <Input placeholder="e.g. Sunday roast chicken" value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        {error && <p className="text-xs text-destructive">{error}</p>}
        <div className="flex gap-2">
          <Button type="submit" size="sm" disabled={create.isPending}>
            Add to library
          </Button>
          <Button type="button" size="sm" variant="ghost" onClick={() => onDone("")}>
            Cancel
          </Button>
        </div>
      </form>
    </Card>
  );
}

export function RecipesPage() {
  const recipes = useRecipes();
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<Sort>("recent");
  const [adding, setAdding] = useState(false);
  const [flash, setFlash] = useState("");

  const all = recipes.data?.recipes;
  const shown = useMemo(() => {
    if (!all) return [];
    const q = query.trim();
    return all.filter((r) => !q || matchesSearch(r, q)).sort(sorters[sort]);
  }, [all, query, sort]);

  return (
    <main className="flex flex-col gap-4" aria-busy={recipes.isPending}>
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="font-serif text-2xl font-semibold">Recipe library</h2>
          <p className="text-[13px] text-muted-foreground">
            Every recipe you’ve put on the plan, kept even after the week has gone.
            {all && ` ${all.length} ${all.length === 1 ? "recipe" : "recipes"}.`}
          </p>
        </div>
        {!adding && (
          <Button
            size="sm"
            onClick={() => {
              setAdding(true);
              setFlash("");
            }}
          >
            <Plus /> Add recipe
          </Button>
        )}
      </div>

      {adding && (
        <AddRecipeForm
          existing={all ?? []}
          onDone={(message) => {
            setAdding(false);
            setFlash(message);
          }}
        />
      )}
      {flash && (
        <p role="status" className="rounded-lg bg-accent px-3 py-2 text-xs">
          {flash}
        </p>
      )}

      <div className="flex flex-col gap-2 sm:flex-row">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            placeholder="Search by name, site or meal…"
            aria-label="Search recipes"
            className="bg-card pl-9"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <NativeSelect aria-label="Sort recipes" value={sort} onChange={(e) => setSort(e.target.value as Sort)}>
          {SORTS.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </NativeSelect>
      </div>

      {recipes.isError ? (
        <LoadError error={recipes.error} what="your recipes" retry={() => void recipes.refetch()} />
      ) : !all ? (
        <div className="flex flex-col gap-2.5" aria-hidden>
          {[0, 1, 2].map((i) => (
            <Card key={i} className="h-24 animate-pulse py-0" />
          ))}
        </div>
      ) : all.length === 0 ? (
        <Notice title="No recipes yet">
          Add a recipe to any meal on the{" "}
          <a {...linkProps("/")} className="font-medium underline">
            week plan
          </a>{" "}
          and it’ll be kept here, or add one directly with “Add recipe”.
        </Notice>
      ) : shown.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">
          Nothing matches “{query.trim()}”.{" "}
          <button className="font-medium text-primary underline" onClick={() => setQuery("")}>
            Clear search
          </button>
        </p>
      ) : (
        <ul className="flex flex-col gap-2.5">
          {shown.map((r) => (
            <li key={r.id}>
              <RecipeCard recipe={r} />
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
