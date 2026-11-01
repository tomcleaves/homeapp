import { useState } from "react";
import { Link2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "Recipe";
  }
}

interface Props {
  url: string | null;
  label: string;
  onChange: (url: string | null) => Promise<unknown>;
}

/** Shows a meal's recipe link, or lets you paste one in. */
export function RecipeLink({ url, label, onChange }: Props) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function commit() {
    let next = value.trim();
    if (!next) return setEditing(false);
    if (!/^[a-z][a-z0-9+.-]*:/i.test(next)) next = `https://${next}`;
    try {
      await onChange(next);
      setEditing(false);
      setValue("");
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't save that link");
    }
  }

  if (url) {
    return (
      <div className="flex min-h-6 items-center gap-1">
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          title={url}
          className="inline-flex max-w-full items-center gap-1 truncate rounded-full bg-accent px-2.5 py-0.5 text-xs font-medium text-primary hover:underline"
        >
          <Link2 className="size-3 shrink-0" />
          <span className="truncate">{hostOf(url)}</span>
        </a>
        <Button
          variant="ghost"
          size="icon-sm"
          className="size-6 text-muted-foreground"
          aria-label={`Remove recipe link for ${label}`}
          onClick={() => onChange(null)}
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
        <Link2 className="size-3" /> Add recipe link
      </button>
    );
  }

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-1.5">
        <Input
          autoFocus
          type="url"
          inputMode="url"
          placeholder="Paste a recipe link…"
          aria-label={`Recipe link for ${label}`}
          aria-invalid={error ? true : undefined}
          className="h-8 text-xs md:text-xs"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              void commit();
            } else if (e.key === "Escape") {
              setEditing(false);
              setError(null);
            }
          }}
        />
        <Button size="sm" className="h-8" onClick={() => void commit()}>
          Add
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Cancel"
          onClick={() => {
            setEditing(false);
            setError(null);
          }}
        >
          <X />
        </Button>
      </div>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
