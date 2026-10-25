import type { ReactNode } from "react";

/**
 * A single on/off setting as a list row: the label (and what it does) on the left, the switch on the right.
 * Use inside a `.ui-group`. For choosing between modes use <Segmented>; for independent picks use checkboxes.
 */
export function SwitchRow({ id, checked, onChange, label, description, disabled }: { id: string; checked: boolean; onChange: (checked: boolean) => void; label: ReactNode; description?: ReactNode; disabled?: boolean }) {
  return (
    <label htmlFor={id} className="ui-row justify-between">
      <span className="min-w-0">
        <span className="block text-[15px] font-medium text-slate-900">{label}</span>
        {description && <span className="ui-hint mt-0.5 block">{description}</span>}
      </span>
      <input id={id} type="checkbox" role="switch" className="ui-switch" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} aria-checked={checked} />
    </label>
  );
}
