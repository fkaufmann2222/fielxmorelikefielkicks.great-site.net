import React from 'react';
import { cn } from './Stepper';

interface ToggleProps {
  label: string;
  value: boolean;
  onChange: (value: boolean) => void;
  className?: string;
}

export function Toggle({ label, value, onChange, className }: ToggleProps) {
  return (
    <div className={cn("flex items-center justify-between p-4 bg-slate-800/50 rounded-xl border border-slate-700", className)}>
      <span className="text-sm font-medium text-slate-300">{label}</span>
      <button
        type="button"
        onClick={() => onChange(!value)}
        className={cn(
          "relative inline-flex h-8 w-14 items-center rounded-full transition-colors",
          value ? "bg-blue-600" : "bg-slate-600"
        )}
      >
        <span
          className={cn(
            "inline-block h-6 w-6 transform rounded-full bg-white transition-transform",
            value ? "translate-x-7" : "translate-x-1"
          )}
        />
      </button>
    </div>
  );
}

interface MultiToggleProps<T extends string> {
  label: string;
  options: T[];
  value: T | '';
  onChange: (value: T) => void;
  className?: string;
}

export function MultiToggle<T extends string>({ label, options, value, onChange, className }: MultiToggleProps<T>) {
  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <label className="text-sm font-medium text-slate-300">{label}</label>
      <div className="flex bg-slate-800/50 p-1 rounded-xl border border-slate-700">
        {options.map((option) => (
          <button
            key={option}
            type="button"
            onClick={() => onChange(option)}
            className={cn(
              "flex-1 py-3 px-4 text-sm font-medium rounded-lg transition-colors",
              value === option
                ? "bg-blue-600 text-white shadow-sm"
                : "text-slate-400 hover:text-slate-200 hover:bg-slate-700/50"
            )}
          >
            {option}
          </button>
        ))}
      </div>
    </div>
  );
}
