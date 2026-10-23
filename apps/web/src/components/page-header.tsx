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
    <header className={cn("flex flex-wrap items-end justify-between gap-x-6 gap-y-4 pb-5 md:pb-7", className)}>
      <div className="grid max-w-3xl gap-2">
        {meta && <p className="type-meta text-muted-foreground">{meta}</p>}
        <h1 className="type-display text-[2.25rem] leading-[1.04] md:text-[3.25rem] md:leading-[1.02]">
          {title}
          {aside && (
            <>
              {" "}
              <em className="text-muted-foreground">{aside}</em>
            </>
          )}
        </h1>
        {description && <p className="max-w-xl pt-1 text-[15px] leading-relaxed text-muted-foreground">{description}</p>}
      </div>
      {/* Phones: actions share the row evenly and grow to a comfortable tap height. */}
      {actions && (
        <div className="flex w-full flex-wrap items-center gap-2 max-md:[&>*]:h-11 max-md:[&>*]:flex-auto md:w-auto">{actions}</div>
      )}
    </header>
  );
}
