"use client";

import GlideSelect from "@/components/ui/GlideSelect";

export type AdminSelectOption = { value: string; label: string };

// The animated dropdown, dressed in the portal/admin tokens so it follows the light and dark
// themes. Pass `name` (with defaultValue) inside a <form>, or `value` + `onChange` when controlled.
export function AdminSelect({
  options,
  value,
  defaultValue,
  onChange,
  name,
  ariaLabel,
  fullWidth = false,
  size = "md",
  menuWidth = 0,
  className = "",
}: {
  options: AdminSelectOption[];
  value?: string;
  defaultValue?: string;
  onChange?: (value: string) => void;
  name?: string;
  ariaLabel: string;
  fullWidth?: boolean;
  size?: "sm" | "md" | "lg";
  menuWidth?: number;
  className?: string;
}) {
  return (
    <GlideSelect
      options={options}
      value={value}
      defaultValue={defaultValue}
      onChange={onChange ? (next) => onChange(next) : undefined}
      name={name}
      ariaLabel={ariaLabel}
      fullWidth={fullWidth}
      size={size}
      radius={12}
      menuWidth={menuWidth}
      surfaceColor="var(--color-surface)"
      highlightColor="var(--color-mist)"
      textColor="var(--color-ink)"
      accentColor="var(--color-marigold)"
      borderColor="var(--color-line)"
      className={className}
    />
  );
}
