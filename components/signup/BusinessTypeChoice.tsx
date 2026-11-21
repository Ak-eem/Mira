"use client";

import { SIGNUP_BUSINESS_TYPES, type BusinessType } from "@/lib/businessTypes";

// "What do you sell?" at signup. Picking Tech store tunes the AI for phones, laptops and gadgets.
export function BusinessTypeChoice({ value, onChange }: { value: BusinessType; onChange: (next: BusinessType) => void }) {
  return (
    <fieldset>
      <legend className="ui-label">What kind of business is it?</legend>
      <div className="mt-1 grid gap-2 sm:grid-cols-2">
        {SIGNUP_BUSINESS_TYPES.map((option) => {
          const selected = value === option.value;
          return (
            <label
              key={option.value}
              className={`flex cursor-pointer flex-col rounded-xl px-3 py-2.5 text-sm transition focus-within:outline focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-accent ${
                selected ? "bg-ink text-white" : "bg-mist text-ink hover:bg-line"
              }`}
            >
              <input type="radio" name="businessType" value={option.value} checked={selected} onChange={() => onChange(option.value)} className="sr-only" />
              <span className="font-medium">{option.label}</span>
              <span className={`text-xs ${selected ? "text-white/70" : "text-muted"}`}>{option.hint}</span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
