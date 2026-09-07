import { useLayoutEffect, useRef, useState } from "react";

declare global {
  interface Window {
    MathJax?: { typesetPromise?: (elements?: Element[]) => Promise<void> };
  }
}

/** Owns one DOM node's content OUTSIDE React's reconciliation, so MathJax's
 * in-place mutation (raw "$x$" -> <mjx-container>) can never be undone by a
 * later React re-render that recomputes an identical dangerouslySetInnerHTML
 * string. (React only compares that string against its own last-set value,
 * not against the live DOM -- it has no idea MathJax already replaced the
 * node's children, so a same-string re-render was silently reverting the
 * typeset math back to source text.)
 *
 * Returns a ref to attach to an *empty* element (no dangerouslySetInnerHTML,
 * no children in JSX) and whether the current html has finished typesetting.
 * A safety timeout guarantees `ready` flips back on even if MathJax's
 * promise never settles, so content can't stay invisible forever. */
export function useTypesetHtml(html: string): { ref: React.RefObject<HTMLDivElement | null>; ready: boolean } {
  const ref = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    setReady(false);
    el.innerHTML = html;

    let cancelled = false;
    const finish = () => {
      if (!cancelled) setReady(true);
    };
    const safety = setTimeout(() => {
      console.warn("MathJax typeset did not settle in time; showing content anyway");
      finish();
    }, 1500);

    try {
      if (window.MathJax?.typesetPromise) {
        window.MathJax.typesetPromise([el])
          .then(() => {
            clearTimeout(safety);
            finish();
          })
          .catch((err) => {
            clearTimeout(safety);
            console.error("MathJax typeset failed", err);
            finish();
          });
      } else {
        clearTimeout(safety);
        finish();
      }
    } catch (err) {
      clearTimeout(safety);
      console.error("MathJax typeset threw synchronously", err);
      finish();
    }

    return () => {
      cancelled = true;
      clearTimeout(safety);
    };
  }, [html]);

  return { ref, ready };
}
