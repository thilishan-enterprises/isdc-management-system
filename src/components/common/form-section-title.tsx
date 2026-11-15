"use client";

type FormSectionTitleProps = {
  icon: React.ElementType;
  title: string;
  description?: string;
};

export function FormSectionTitle({
  icon: Icon,
  title,
  description,
}: FormSectionTitleProps) {
  return (
    <div className="flex items-center gap-2.5">
      <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
        <Icon className="size-4" />
      </div>

      <div className="min-w-0">
        <h2 className="text-sm font-semibold tracking-tight">{title}</h2>

        {description && (
          <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>
        )}
      </div>
    </div>
  );
}
