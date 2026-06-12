import {
  createElement,
  useEffect,
  useRef,
  useState,
  type ElementType,
  type ReactNode,
} from "react";
import clsx from "clsx";

/**
 * Tiny IntersectionObserver-based scroll reveal. Elements start hidden
 * (.reveal) and fade/slide in once (.reveal-visible). Honours
 * prefers-reduced-motion both here (revealed immediately) and in CSS.
 */
function usePrefersReducedMotion() {
  const [reduced, setReduced] = useState(
    () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  );
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const onChange = () => setReduced(mq.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);
  return reduced;
}

export default function Reveal({
  as = "div",
  className,
  delay = 0,
  children,
}: {
  as?: ElementType;
  className?: string;
  /** Stagger delay in milliseconds. */
  delay?: number;
  children: ReactNode;
}) {
  const ref = useRef<HTMLElement | null>(null);
  const reduced = usePrefersReducedMotion();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (reduced) {
      setVisible(true);
      return;
    }
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") {
      setVisible(true);
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setVisible(true);
          io.disconnect();
        }
      },
      { threshold: 0.12, rootMargin: "0px 0px -8% 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [reduced]);

  return createElement(
    as,
    {
      ref,
      className: clsx("reveal", visible && "reveal-visible", className),
      style: delay && !reduced ? { transitionDelay: `${delay}ms` } : undefined,
    },
    children,
  );
}
