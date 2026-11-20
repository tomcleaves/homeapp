import { BookOpen, CalendarDays, Hammer, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SaveStatus } from "@/components/save-status";
import { useMe } from "@/lib/queries";
import { linkProps, usePathname } from "@/lib/router";
import { cn } from "@/lib/utils";
import { JobsPage } from "@/pages/jobs-page";
import { RecipesPage } from "@/pages/recipes-page";
import { WeekPage } from "@/pages/week-page";

// Cloudflare Access's own sign-out endpoint, available on any Access-protected host.
const SIGN_OUT_URL = "/cdn-cgi/access/logout";

const PAGES = [
  { path: "/", label: "Week plan", short: "Week", icon: CalendarDays, Page: WeekPage },
  { path: "/recipes", label: "Recipe library", short: "Recipes", icon: BookOpen, Page: RecipesPage },
  { path: "/jobs", label: "House jobs", short: "Jobs", icon: Hammer, Page: JobsPage },
] as const;

export default function App() {
  const me = useMe();
  const pathname = usePathname();
  const path = pathname.replace(/\/+$/, "") || "/";
  const current = PAGES.find((p) => p.path === path) ?? PAGES[0];

  return (
    <div className="mx-auto flex min-h-svh w-full max-w-3xl flex-col gap-5 px-4 pt-8 pb-16 sm:px-5">
      <header className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <div>
          <h1 className="font-serif text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
            The Weekly Table
          </h1>
          <p className="mt-1 text-[13px] text-muted-foreground">
            Meals, recipes and house jobs, shared between the two of you.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <SaveStatus />
          {me.data && (
            <span className="hidden max-w-48 truncate text-xs text-muted-foreground sm:inline">
              {me.data.email}
            </span>
          )}
          <Button variant="ghost" size="sm" asChild>
            <a href={SIGN_OUT_URL}>
              <LogOut /> Sign out
            </a>
          </Button>
        </div>
      </header>

      <nav aria-label="Pages" className="flex gap-1 rounded-xl border bg-card p-1 shadow-sm">
        {PAGES.map(({ path, label, short, icon: Icon }) => {
          const active = path === current.path;
          return (
            <a
              key={path}
              {...linkProps(path)}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex flex-1 items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                active
                  ? "bg-primary text-primary-foreground shadow-xs"
                  : "text-muted-foreground hover:bg-secondary hover:text-foreground",
              )}
            >
              <Icon className="size-4 shrink-0" />
              <span className="sm:hidden">{short}</span>
              <span className="hidden sm:inline">{label}</span>
            </a>
          );
        })}
      </nav>

      <current.Page />
    </div>
  );
}
