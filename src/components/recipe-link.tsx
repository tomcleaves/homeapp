import { useMemo, useState } from "react";
import { BookOpen, Link2, X } from "lucide-react";
import type { MealRecipe, MealUpdate, Recipe } from "@shared/types";
import { recipeHost } from "@shared/recipes";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useRecipes } from "@/lib/queries";
import { matchesSearch } from "@shared/search";

type RecipeChange = Pick<MealUpdate, "recipeUrl" | "recipeId">;

interface Props {
  recipe: MealRecipe | null;
  label: string;
  onChange: (change: RecipeChange) => Promise<unknown>;
}

const looksLikeUrl = (v: string) => /^(https?:\/\/|www\.)|\.[a-z]{2,}(\/|$)/i.test(v.trim());

/** Shows a meal's recipe, or lets you pick one from the library or paste a link. */
export function RecipeLink({ recipe, label, onChange }: Props) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const library = useRecipes();

  const suggestions = useMemo(() => {
    const all = library.data?.recipes ?? [];
    const q = value.trim();
    if (!q || looksLikeUrl(q)) return [];
    return all.filter((r) => matchesSearch(r, q)).slice(0, 5);
  }, [library.data, value]);

  function close() {
    setEditing(false);
    setValue("");
    setError(null);
  }

  async function apply(change: RecipeChange) {
    try {
      await onChange(change);
      close();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't save that recipe");
    }
  }

  function commitTyped() {
    const v = value.trim();
    if (!v) return close();
    const first = suggestions[0];
    if (!looksLikeUrl(v) && first) return void apply({ recipeId: first.id });
    if (!looksLikeUrl(v)) return setError("Paste a link, or pick a recipe from your library");
    const url = /^[a-z][a-z0-9+.-]*:/i.test(v) ? v : `https://${v}`;
    void apply({ recipeUrl: url });
  }

  if (recipe) {
    return (
      <div className="flex min-h-6 items-center gap-1">
        <a
          href={recipe.url}
          target="_blank"
          rel="noopener noreferrer"
          title={recipe.url}
          className="inline-flex max-w-full items-center gap-1 truncate rounded-full bg-accent px-2.5 py-0.5 text-xs font-medium text-primary hover:underline"
        >
          <Link2 className="size-3 shrink-0" />
          <span className="truncate">{recipe.title?.trim() || recipeHost(recipe.url)}</span>
        </a>
        <Button
          variant="ghost"
          size="icon-sm"
          className="size-6 text-muted-foreground"
          aria-label={`Remove recipe from ${label}`}
          onClick={() => void onChange({ recipeId: null })}
        >
          <X className="size-3" />
        </Button>
      </div>
    );
  }

  if (!editing) {
    return (
      <button
        type="button"
        onClick={() => setEditing(true)}
        className="inline-flex min-h-6 items-center gap-1 self-start text-xs text-muted-foreground hover:text-primary hover:underline"
      >
        <Link2 className="size-3" /> Add recipe
      </button>
    );
  }

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-1.5">
        <Input
          autoFocus
          inputMode="url"
          placeholder="Paste a link or search your recipes…"
          aria-label={`Recipe for ${label}`}
          aria-invalid={error ? true : undefined}
          className="h-8 text-xs md:text-xs"
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            setError(null);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              commitTyped();
            } else if (e.key === "Escape") {
              close();
            }
          }}
        />
        <Button size="sm" className="h-8" onClick={commitTyped}>
          Add
        </Button>
        <Button variant="ghost" size="icon-sm" aria-label="Cancel" onClick={close}>
          <X />
        </Button>
      </div>

      {suggestions.length > 0 && (
        <ul
          aria-label="Matching recipes from your library"
          className="flex flex-col overflow-hidden rounded-md border bg-popover text-xs shadow-sm"
        >
          {suggestions.map((r: Recipe) => (
            <li key={r.id}>
              <button
                type="button"
                onClick={() => void apply({ recipeId: r.id })}
                className="flex w-full items-start gap-2 px-2.5 py-1.5 text-left hover:bg-secondary focus-visible:bg-secondary focus-visible:outline-none"
              >
                <BookOpen className="mt-0.5 size-3 shrink-0 text-muted-foreground" />
                <span className="flex min-w-0 flex-col">
                  <span className="font-medium text-pretty">{r.displayName}</span>
                  <span className="truncate text-muted-foreground">{r.host}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
