import { cn } from "@/lib/utils";

/** Page title block: mono eyebrow, large serif title, optional description and actions. */
export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
  className,
}: {
  eyebrow?: string;
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
}) {
  return (
    <header className={cn("flex flex-wrap items-end justify-between gap-6 pb-8", className)}>
      <div className="grid gap-3">
        {eyebrow && <p className="type-label text-muted-foreground">{eyebrow}</p>}
        <h1 className="type-display text-5xl lg:text-6xl">{title}</h1>
        {description && <p className="max-w-xl text-base text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </header>
  );
}
