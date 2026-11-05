import { useEffect, useRef, useState } from "react";
import { CornerDownRight, X } from "lucide-react";
import type { Meal } from "@shared/types";
import type { Slot } from "@shared/week";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useSendLeftovers, useUpdateMeal } from "@/lib/queries";
import { RecipeLink } from "./recipe-link";

const SAVE_DELAY_MS = 600;

interface Props {
  date: string;
  slot: Slot;
  dayLabel: string;
  nextDayLabel: string;
  meal: Meal | undefined;
}

export function MealSlot({ date, slot, dayLabel, nextDayLabel, meal }: Props) {
  const update = useUpdateMeal();
  const leftovers = useSendLeftovers();

  const serverTitle = meal?.title ?? "";
  const [draft, setDraft] = useState(serverTitle);
  const [focused, setFocused] = useState(false);
  const [sentNote, setSentNote] = useState(false);

  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const dirty = useRef(false);
  const draftRef = useRef(draft);
  draftRef.current = draft;

  // Take the server's value (e.g. the other person's edit) unless we're mid-edit.
  useEffect(() => {
    if (!focused && !dirty.current && !update.isPending) setDraft(serverTitle);
  }, [serverTitle, focused, update.isPending]);

  function save(title: string) {
    clearTimeout(timer.current);
    dirty.current = false;
    return update.mutateAsync({ date, slot, update: { title } });
  }

  // Don't lose a pending edit when the week changes and this slot unmounts.
  useEffect(
    () => () => {
      if (dirty.current) void save(draftRef.current);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  function onChange(value: string) {
    setDraft(value);
    dirty.current = true;
    clearTimeout(timer.current);
    timer.current = setTimeout(() => void save(value), SAVE_DELAY_MS);
  }

  async function sendLeftovers() {
    if (dirty.current) await save(draftRef.current);
    await leftovers.mutateAsync(date);
    setSentNote(true);
    setTimeout(() => setSentNote(false), 2500);
  }

  const label = `${dayLabel} ${slot}`;
  const id = `meal-${date}-${slot}`;
  const hasText = draft.trim().length > 0;

  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <label
        htmlFor={id}
        className="text-[10.5px] font-semibold tracking-[0.08em] text-muted-foreground uppercase"
      >
        {slot === "lunch" ? "Lunch" : "Dinner"}
      </label>

      <div className="relative">
        <Textarea
          id={id}
          rows={1}
          value={draft}
          placeholder={slot === "lunch" ? "Add a lunch idea…" : "Add a dinner idea…"}
          className="min-h-10 resize-none bg-secondary pr-8 text-[14.5px] md:text-[14.5px] border-input"
          onChange={(e) => onChange(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => {
            setFocused(false);
            if (dirty.current) void save(draftRef.current);
          }}
        />
        {hasText && (
          <Button
            variant="ghost"
            size="icon-sm"
            className="absolute top-1.5 right-1.5 size-6 rounded-full text-muted-foreground"
            aria-label={`Clear ${label}`}
            onClick={() => {
              setDraft("");
              void save("");
            }}
          >
            <X className="size-3" />
          </Button>
        )}
      </div>

      <RecipeLink
        recipe={meal?.recipe ?? null}
        label={label}
        onChange={(change) => update.mutateAsync({ date, slot, update: change })}
      />

      {slot === "dinner" && (
        <button
          type="button"
          disabled={!hasText || leftovers.isPending}
          onClick={() => void sendLeftovers()}
          className="inline-flex items-center gap-1 self-start text-xs font-medium text-primary hover:underline disabled:cursor-not-allowed disabled:text-muted-foreground disabled:no-underline disabled:opacity-60"
        >
          <CornerDownRight className="size-3" />
          {sentNote ? `Sent to ${nextDayLabel}’s lunch` : "Leftovers for tomorrow’s lunch"}
        </button>
      )}
    </div>
  );
}
