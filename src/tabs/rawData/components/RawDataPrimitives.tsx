import React from 'react';
import { displayBoolean } from '../utils';

type ValueRowProps = {
  label: string;
  value: string;
  mono?: boolean;
};

export function ValueRow({ label, value, mono = false }: ValueRowProps) {
  return (
    <div className="space-y-1">
      <p className="text-xs text-slate-400">{label}</p>
      <p className={`text-sm text-slate-100 ${mono ? 'font-mono' : ''}`}>{value}</p>
    </div>
  );
}

type BoolRowProps = {
  label: string;
  value: unknown;
};

export function BoolRow({ label, value }: BoolRowProps) {
  const state = displayBoolean(value);
  const badgeClass =
    state === 'Yes'
      ? 'bg-blue-600/25 border border-blue-500/40 text-blue-100'
      : state === 'No'
        ? 'bg-slate-800 border border-slate-700 text-slate-300'
        : 'bg-slate-800 border border-slate-700 text-slate-400';

  return (
    <div className="flex items-center justify-between gap-3 rounded-xl bg-slate-900/60 border border-slate-800 px-3 py-2">
      <span className="text-sm text-slate-200">{label}</span>
      <span className={`px-2.5 py-1 rounded-lg text-xs font-semibold uppercase tracking-wide ${badgeClass}`}>{state}</span>
    </div>
  );
}

type SectionCardProps = {
  title: string;
  children: React.ReactNode;
};

export function SectionCard({ title, children }: SectionCardProps) {
  return (
    <div className="bg-slate-900/70 border border-slate-700 rounded-xl p-4 space-y-4">
      <h4 className="text-sm font-semibold uppercase tracking-wide text-slate-200">{title}</h4>
      {children}
    </div>
  );
}
