import { useIsMutating, useMutationState } from "@tanstack/react-query";
import { cn } from "@/lib/utils";

/** "Saving… / Saved / Couldn't save", based on the most recent write. */
export function SaveStatus() {
  const saving = useIsMutating() > 0;
  const statuses = useMutationState({ select: (m) => m.state.status });
  const last = statuses.at(-1);

  const [text, tone] = saving
    ? ["Saving…", "bg-warm"]
    : last === "error"
      ? ["Couldn’t save", "bg-destructive"]
      : ["Saved", "bg-primary"];

  return (
    <span
      role="status"
      className={cn(
        "inline-flex items-center gap-1.5 text-xs whitespace-nowrap text-muted-foreground",
        last === "error" && !saving && "text-destructive",
      )}
    >
      <span className={cn("size-1.5 rounded-full", tone)} />
      {text}
    </span>
  );
}
