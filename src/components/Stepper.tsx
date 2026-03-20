import React from 'react';
import { Minus, Plus } from 'lucide-react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

interface StepperProps {
  label: string;
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  className?: string;
}

export function Stepper({ label, value, onChange, min = 0, max = Infinity, className }: StepperProps) {
  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <label className="text-sm font-medium text-slate-300">{label}</label>
      <div className="flex items-center gap-4 bg-slate-800/50 p-2 rounded-xl border border-slate-700">
        <button
          type="button"
          onClick={() => onChange(Math.max(min, value - 1))}
          className="w-14 h-14 flex items-center justify-center bg-slate-700 hover:bg-slate-600 active:bg-slate-500 rounded-lg transition-colors"
          disabled={value <= min}
        >
          <Minus className="w-8 h-8 text-white" />
        </button>
        <div className="flex-1 text-center text-3xl font-mono font-bold text-white">
          {value}
        </div>
        <button
          type="button"
          onClick={() => onChange(Math.min(max, value + 1))}
          className="w-14 h-14 flex items-center justify-center bg-blue-600 hover:bg-blue-500 active:bg-blue-400 rounded-lg transition-colors"
          disabled={value >= max}
        >
          <Plus className="w-8 h-8 text-white" />
        </button>
      </div>
    </div>
  );
}
