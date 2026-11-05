import { useSyncExternalStore } from "react";

// A deliberately tiny router: the app has two pages, so a library isn't worth it.
// Workers Assets serves index.html for unknown paths, so deep links work.

const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  window.addEventListener("popstate", listener);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("popstate", listener);
  };
}

export function navigate(to: string) {
  window.history.pushState(null, "", to);
  listeners.forEach((l) => l());
  window.scrollTo({ top: 0 });
}

export function usePathname(): string {
  return useSyncExternalStore(subscribe, () => window.location.pathname);
}

/** Props for an <a> that navigates in-app, still openable in a new tab. */
export function linkProps(to: string) {
  return {
    href: to,
    onClick: (e: React.MouseEvent<HTMLAnchorElement>) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      e.preventDefault();
      navigate(to);
    },
  };
}
