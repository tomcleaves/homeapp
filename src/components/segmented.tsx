import { cn } from "@/lib/utils";

interface Props<T extends string> {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
  /** Extra classes for the selected option, keyed by value (e.g. High in red). */
  activeClass?: Partial<Record<T, string>>;
  className?: string;
}

/** A small radio group drawn as joined buttons. */
export function Segmented<T extends string>({ label, value, options, onChange, activeClass, className }: Props<T>) {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className={cn("inline-flex rounded-md border border-input bg-card p-0.5 shadow-xs", className)}
    >
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(o.value)}
            className={cn(
              "flex-1 rounded-[5px] px-2.5 py-1 text-xs font-medium whitespace-nowrap transition-colors outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50",
              active
                ? (activeClass?.[o.value] ?? "bg-primary text-primary-foreground")
                : "text-muted-foreground hover:bg-secondary hover:text-foreground",
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
