import { Film } from "lucide-react";

import { cn } from "@/lib/utils";

const SIZE_STYLES = {
  sm: {
    gap: "gap-2",
    mark: "h-9 w-9 rounded-xl",
    icon: "h-[18px] w-[18px]",
    label: "text-lg",
  },
  md: {
    gap: "gap-2.5",
    mark: "h-10 w-10 rounded-[1rem]",
    icon: "h-5 w-5",
    label: "text-xl",
  },
  lg: {
    gap: "gap-3",
    mark: "h-12 w-12 rounded-[1.1rem]",
    icon: "h-6 w-6",
    label: "text-[1.7rem]",
  },
  xl: {
    gap: "gap-3.5",
    mark: "h-16 w-16 rounded-[1.35rem]",
    icon: "h-8 w-8",
    label: "text-[2.45rem]",
  },
} as const;

type BrandLogoProps = {
  className?: string;
  compact?: boolean;
  labelClassName?: string;
  markClassName?: string;
  size?: keyof typeof SIZE_STYLES;
};

export default function BrandLogo({
  className,
  compact = false,
  labelClassName,
  markClassName,
  size = "md",
}: BrandLogoProps) {
  const styles = SIZE_STYLES[size];

  return (
    <div
      className={cn(
        "inline-flex select-none items-center whitespace-nowrap",
        styles.gap,
        className,
      )}
    >
      <span
        data-brand-mark="true"
        className={cn(
          "flex shrink-0 items-center justify-center border border-white/12 bg-gradient-to-br from-primary via-primary to-orange-500 text-primary-foreground shadow-[0_18px_44px_-24px_hsl(var(--primary)/0.95)]",
          styles.mark,
          markClassName,
        )}
      >
        <Film className={cn("shrink-0", styles.icon)} />
      </span>
      {!compact ? (
        <span
          data-brand-label="true"
          className={cn(
            "text-gradient font-black tracking-[-0.05em]",
            styles.label,
            labelClassName,
          )}
        >
          MovieReckon
        </span>
      ) : null}
    </div>
  );
}
