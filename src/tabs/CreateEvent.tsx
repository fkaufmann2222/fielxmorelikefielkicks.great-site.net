import React, { useState } from 'react';
import { ArrowLeft, CalendarPlus } from 'lucide-react';

type CreateEventProps = {
  isCreating: boolean;
  onSubmit: (eventKey: string) => Promise<void>;
  onCancel: () => void;
};

export function CreateEvent({ isCreating, onSubmit, onCancel }: CreateEventProps) {
  const [eventKey, setEventKey] = useState('');

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!eventKey.trim() || isCreating) return;
    await onSubmit(eventKey);
  };

  return (
    <div className="max-w-2xl mx-auto">
      <button onClick={onCancel} className="mb-5 inline-flex items-center gap-2 text-sm text-slate-300 hover:text-white">
        <ArrowLeft className="w-4 h-4" />
        Back to competitions
      </button>
      <section className="rounded-3xl border border-slate-700 bg-slate-800/40 p-6 sm:p-8 shadow-xl">
        <div className="flex items-start gap-4">
          <div className="rounded-2xl bg-emerald-500/15 p-3 text-emerald-300">
            <CalendarPlus className="w-6 h-6" />
          </div>
          <div>
            <p className="text-sky-300 text-sm tracking-wide uppercase font-semibold">Competition Profiles</p>
            <h1 className="text-2xl sm:text-3xl font-black text-white mt-1">Add a competition</h1>
            <p className="text-slate-300 mt-2">Enter the event key to load teams and create a scouting workspace.</p>
          </div>
        </div>
        <form onSubmit={handleSubmit} className="mt-8 space-y-4">
          <label htmlFor="event-key" className="block text-sm font-semibold text-slate-200">TBA event key</label>
          <input
            id="event-key"
            value={eventKey}
            onChange={(event) => setEventKey(event.target.value)}
            placeholder="2026paphi"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            className="w-full rounded-2xl border border-slate-600 bg-slate-900/70 px-4 py-3 text-white outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-400/20"
          />
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={onCancel} className="rounded-2xl border border-slate-600 px-5 py-3 font-semibold text-slate-200 hover:border-slate-400">Cancel</button>
            <button type="submit" disabled={!eventKey.trim() || isCreating} className="rounded-2xl bg-emerald-600 px-5 py-3 font-semibold text-white shadow-lg shadow-emerald-500/20 hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-50">
              {isCreating ? 'Creating...' : 'Create competition'}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}

export default CreateEvent;
