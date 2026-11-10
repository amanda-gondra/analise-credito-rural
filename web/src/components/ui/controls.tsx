/**
 * Form controls built on native elements: radio inputs for segmented choices and <select>
 * for lists, so keyboard, screen readers and phone pickers work without extra code.
 */
import { type ButtonHTMLAttributes, type ReactNode, useId } from "react";

import { cn } from "../../lib/cn";
import { Icon, type IconName } from "./Icon";

interface SegmentedProps<T extends string> {
  label: string;
  value: T;
  options: ReadonlyArray<{ value: T; label: string; swatch?: string }>;
  onChange: (value: T) => void;
  hideLabel?: boolean;
  size?: "sm" | "md";
}

export function Segmented<T extends string>({ label, value, options, onChange, hideLabel, size = "md" }: SegmentedProps<T>) {
  const name = useId();
  return (
    <fieldset className="min-w-0">
      <legend className={cn("mb-1.5 text-sm font-medium text-ink", hideLabel && "sr-only")}>{label}</legend>
      <div className="inline-flex max-w-full flex-wrap gap-1 rounded-full border border-line bg-sunken p-1">
        {options.map((option) => (
          <label
            key={option.value}
            className={cn(
              "relative inline-flex cursor-pointer items-center gap-2 rounded-full font-medium transition-colors",
              size === "sm" ? "min-h-8 px-3 text-sm" : "min-h-10 px-4 text-sm",
              "has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-forest",
              value === option.value ? "bg-forest text-white shadow-sm" : "text-ink hover:bg-forest-100",
            )}
          >
            <input
              type="radio"
              name={name}
              value={option.value}
              checked={value === option.value}
              onChange={() => onChange(option.value)}
              className="sr-only"
            />
            {option.swatch && (
              <span
                aria-hidden="true"
                className="size-2.5 rounded-full ring-1 ring-white/70"
                style={{ backgroundColor: option.swatch }}
              />
            )}
            {option.label}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

interface SelectProps<T extends string> {
  label: string;
  value: T;
  options: ReadonlyArray<{ value: T; label: string }>;
  onChange: (value: T) => void;
  hideLabel?: boolean;
  className?: string;
}

export function Select<T extends string>({ label, value, options, onChange, hideLabel, className }: SelectProps<T>) {
  const id = useId();
  return (
    <div className={cn("min-w-0", className)}>
      <label htmlFor={id} className={cn("mb-1.5 block text-sm font-medium text-ink", hideLabel && "sr-only")}>
        {label}
      </label>
      <div className="relative">
        <select
          id={id}
          value={value}
          onChange={(event) => onChange(event.target.value as T)}
          className="min-h-10 w-full appearance-none truncate rounded-xl border border-control bg-surface py-2 pl-3 pr-9 text-sm text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-forest"
        >
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <Icon
          name="chevron-down"
          size={16}
          className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-ink-2"
        />
      </div>
    </div>
  );
}

type Variant = "primary" | "secondary" | "ghost";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  icon?: IconName;
  iconAfter?: IconName;
  children?: ReactNode;
}

export const buttonClass = (variant: Variant = "secondary", extra?: string) =>
  cn(
    "inline-flex min-h-10 items-center justify-center gap-2 rounded-full px-4 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50",
    variant === "primary" && "bg-forest text-white hover:bg-forest-hover active:bg-forest-active",
    variant === "secondary" && "border border-control bg-surface text-forest hover:bg-forest-50",
    variant === "ghost" && "text-forest hover:bg-forest-50",
    extra,
  );

export function Button({ variant = "secondary", icon, iconAfter, children, className, type = "button", ...rest }: ButtonProps) {
  return (
    <button type={type} className={buttonClass(variant, className)} {...rest}>
      {icon && <Icon name={icon} size={18} />}
      {children}
      {iconAfter && <Icon name={iconAfter} size={18} />}
    </button>
  );
}
