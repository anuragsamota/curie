import { useEffect, useState } from "react";

export function useMediaQuery(query: string) {
  const [matches, setMatches] = useState(() => window.matchMedia(query).matches);
  useEffect(() => {
    const list = window.matchMedia(query);
    const update = () => setMatches(list.matches);
    update();
    list.addEventListener("change", update);
    return () => list.removeEventListener("change", update);
  }, [query]);
  return matches;
}

/** Wide enough for side panels next to the content. */
export const useIsDesktop = () => useMediaQuery("(min-width: 1024px)");

/** Phone-sized: menus and pickers open as bottom sheets. */
export const useIsPhone = () => useMediaQuery("(max-width: 639px)");
