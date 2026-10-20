import { cn } from "@/lib/utils";

/**
 * Page title. `title` is the plain part, `aside` the italic, muted second voice:
 * "Morning, Anthony. <em>Three people would love to hear from you.</em>"
 */
export function PageHeader({
  meta,
  title,
  aside,
  description,
  actions,
  className,
}: {
  meta?: React.ReactNode;
  title: React.ReactNode;
  aside?: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
}) {
  return (
    <header className={cn("flex flex-wrap items-end justify-between gap-6 pb-7", className)}>
      <div className="grid max-w-3xl gap-2">
        {meta && <p className="type-meta text-muted-foreground">{meta}</p>}
        <h1 className="type-display text-[3.25rem] leading-[1.02]">
          {title}
          {aside && (
            <>
              {" "}
              <em className="text-muted-foreground">{aside}</em>
            </>
          )}
        </h1>
        {description && <p className="max-w-xl pt-1 text-[15px] text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </header>
  );
}
