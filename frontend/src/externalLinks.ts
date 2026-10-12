import type { ExternalLink } from "./types";
import { SOURCE_LABEL } from "./markdown";

/** A term that has several outside pages (rendered by mdBody as
 *  [data-ext]) opens a small menu of them where it was clicked. One
 *  document-level listener serves every card, the trainer and the project
 *  pages; the menu lives on <body>, outside the canvas, so neither a card's
 *  clipping nor the canvas zoom touches it. Returns the uninstaller. */
export function installExternalLinkMenu(): () => void {
  let menu: HTMLDivElement | null = null;
  const close = () => {
    menu?.remove();
    menu = null;
  };

  function open(el: HTMLElement, x: number, y: number) {
    close();
    let links: ExternalLink[];
    try {
      links = JSON.parse(el.dataset.ext ?? "[]");
    } catch {
      return;
    }
    links = links.filter((l) => typeof l.url === "string" && l.url.startsWith("https://"));
    if (!links.length) return;
    const m = document.createElement("div");
    m.className = "ext-menu";
    m.setAttribute("role", "menu");
    const head = document.createElement("div");
    head.className = "ext-menu-title";
    head.textContent = "Подробнее";
    m.appendChild(head);
    for (const l of links) {
      const a = document.createElement("a");
      a.href = l.url;
      a.target = "_blank";
      a.rel = "noopener noreferrer";
      a.setAttribute("role", "menuitem");
      a.textContent = SOURCE_LABEL[l.source] ?? l.source;
      a.addEventListener("click", close);
      m.appendChild(a);
    }
    document.body.appendChild(m);
    // Keep the menu on screen.
    const r = m.getBoundingClientRect();
    m.style.left = Math.max(8, Math.min(x, window.innerWidth - r.width - 8)) + "px";
    m.style.top = Math.max(8, Math.min(y + 10, window.innerHeight - r.height - 8)) + "px";
    menu = m;
    (m.querySelector("a") as HTMLElement).focus({ preventScroll: true });
  }

  const onClick = (e: MouseEvent) => {
    const target = e.target as HTMLElement;
    if (menu && menu.contains(target)) return;
    const el = target.closest<HTMLElement>("[data-ext]");
    if (el) {
      e.preventDefault();
      open(el, e.clientX, e.clientY);
    } else {
      close();
    }
  };
  const onKey = (e: KeyboardEvent) => {
    if (e.key === "Escape") return close();
    const el = (e.target as HTMLElement).closest?.<HTMLElement>("[data-ext]");
    if (el && (e.key === "Enter" || e.key === " ")) {
      e.preventDefault();
      const r = el.getBoundingClientRect();
      open(el, r.left, r.bottom);
    }
  };
  document.addEventListener("click", onClick);
  document.addEventListener("keydown", onKey);
  window.addEventListener("resize", close);
  window.addEventListener("wheel", close, { passive: true });
  return () => {
    close();
    document.removeEventListener("click", onClick);
    document.removeEventListener("keydown", onKey);
    window.removeEventListener("resize", close);
    window.removeEventListener("wheel", close);
  };
}
