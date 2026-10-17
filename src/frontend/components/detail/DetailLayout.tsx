import { useEffect, useState, type ElementType, type ReactNode } from "react";
import { cn } from "@/shared/lib/utils";

export type DetailSectionLink = { id: string; label: string };

/** Sticky in-page navigation that highlights the section currently in view. */
export function DetailSectionNav({ sections }: { sections: DetailSectionLink[] }) {
  const [active, setActive] = useState(sections[0]?.id);
  const ids = sections.map((section) => section.id).join("|");

  useEffect(() => {
    if (typeof IntersectionObserver === "undefined") return;
    const nodes = ids.split("|").map((id) => document.getElementById(id)).filter((node): node is HTMLElement => Boolean(node));
    const observer = new IntersectionObserver((entries) => {
      const visible = entries.filter((entry) => entry.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
      if (visible[0]) setActive(visible[0].target.id);
    }, { rootMargin: "-140px 0px -55% 0px" });
    nodes.forEach((node) => observer.observe(node));
    return () => observer.disconnect();
  }, [ids]);

  if (sections.length < 2) return null;
  return (
    <nav className="detail-section-nav" aria-label="On this page">
      <ul className="filter-row">
        {sections.map((section) => (
          <li key={section.id}>
            <a href={`#${section.id}`} aria-current={active === section.id ? "location" : undefined}
              className={cn("detail-section-link", active === section.id && "detail-section-link-active")}>
              {section.label}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}

export function DetailSection({ id, title, icon: Icon, action, children, className }: {
  id: string;
  title: string;
  icon?: ElementType;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section id={id} aria-labelledby={`${id}-heading`} className={cn("detail-section", className)}>
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 id={`${id}-heading`} className="flex items-center gap-2 text-xl font-bold tracking-tight md:text-2xl">
          {Icon && <Icon className="size-5 text-primary" aria-hidden="true" />}
          {title}
        </h2>
        {action}
      </div>
      {children}
    </section>
  );
}

export function MetaChip({ icon: Icon, children, tone = "default" }: { icon?: ElementType; children: ReactNode; tone?: "default" | "rating" | "accent" }) {
  return (
    <span className={cn("detail-meta-chip", tone === "rating" && "detail-meta-chip-rating", tone === "accent" && "detail-meta-chip-accent")}>
      {Icon && <Icon className="size-3.5" aria-hidden="true" />}
      {children}
    </span>
  );
}

export function FactsPanel({ title = "Details", rows }: { title?: string; rows: { label: string; value: ReactNode; icon?: ElementType }[] }) {
  const visible = rows.filter((row) => row.value !== null && row.value !== undefined && row.value !== "" && row.value !== "N/A");
  if (!visible.length) return null;
  return (
    <aside className="surface-panel h-fit p-5" aria-label={title}>
      <h3 className="mb-4 text-sm font-bold uppercase tracking-[0.14em] text-muted-foreground">{title}</h3>
      <dl className="grid gap-3.5">
        {visible.map((row) => (
          <div key={row.label} className="grid gap-0.5">
            <dt className="flex items-center gap-2 text-xs text-muted-foreground">
              {row.icon && <row.icon className="size-3.5" aria-hidden="true" />}{row.label}
            </dt>
            <dd className="break-words text-sm font-medium text-foreground">{row.value}</dd>
          </div>
        ))}
      </dl>
    </aside>
  );
}
