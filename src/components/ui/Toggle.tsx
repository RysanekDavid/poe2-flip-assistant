"use client";

import { useId } from "react";

interface ToggleProps {
  checked: boolean;
  onChange: (next: boolean) => void;
  /** Required: a switch with no name is unusable with a screen reader. */
  label: string;
  /** Keep the label for assistive tech only (e.g. inside a table under a column header). */
  hideLabel?: boolean;
  disabled?: boolean;
  /** Why the switch is disabled — shown as the native title so a greyed switch is never a mystery. */
  disabledReason?: string;
}

/** On/off switch (role="switch"); clicking the visible label toggles it too. */
export function Toggle({ checked, onChange, label, hideLabel = false, disabled = false, disabledReason }: ToggleProps) {
  const labelId = useId();
  return (
    <span className="inline-flex items-center gap-2" title={disabled ? disabledReason : undefined}>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-labelledby={labelId}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full border transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
          checked ? "border-amber-400/70 bg-amber-400/80" : "border-neutral-600 bg-neutral-800"
        }`}
      >
        <span
          aria-hidden
          className={`inline-block h-3.5 w-3.5 rounded-full bg-neutral-100 shadow transition-transform ${
            checked ? "translate-x-[18px]" : "translate-x-[2px]"
          }`}
        />
      </button>
      <span
        id={labelId}
        className={hideLabel ? "sr-only" : "cursor-pointer select-none text-sm text-neutral-300"}
        onClick={disabled ? undefined : () => onChange(!checked)}
      >
        {label}
      </span>
    </span>
  );
}
