import React from 'react';
import { cn } from './Stepper';

interface SliderProps {
  label: string;
  value: number;
  onChange: (value: number) => void;
  min: number;
  max: number;
  step?: number;
  className?: string;
  formatValue?: (val: number) => string;
}

export function Slider({ label, value, onChange, min, max, step = 1, className, formatValue }: SliderProps) {
  return (
    <div className={cn("flex flex-col gap-4 p-4 bg-slate-800/50 rounded-xl border border-slate-700", className)}>
      <div className="flex justify-between items-center">
        <label className="text-sm font-medium text-slate-300">{label}</label>
        <span className="text-lg font-mono font-bold text-blue-400">
          {formatValue ? formatValue(value) : value}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="w-full h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-blue-500"
      />
      <div className="flex justify-between text-xs text-slate-500 font-mono">
        <span>{min}</span>
        <span>{max}</span>
      </div>
    </div>
  );
}
