import { useEffect, useState } from "react";

// Reactively tracks whether <html class="dark"> is set, so components (e.g. charts that
// can't use CSS) can pick theme-aware colours and update when the toggle flips.
export function useIsDark() {
  const [dark, setDark] = useState(() =>
    typeof document !== "undefined" && document.documentElement.classList.contains("dark"),
  );
  useEffect(() => {
    const el = document.documentElement;
    const obs = new MutationObserver(() => setDark(el.classList.contains("dark")));
    obs.observe(el, { attributes: true, attributeFilter: ["class"] });
    return () => obs.disconnect();
  }, []);
  return dark;
}
