import React, { useState, useEffect } from 'react';
import { storage } from '../lib/storage';
import { MatchScoutData, AllianceColor, AutoClimbResult, EndGameClimbResult, HubScoringStrategy, CardReceived } from '../types';
import { Stepper } from '../components/Stepper';
import { Toggle, MultiToggle } from '../components/Toggle';
import { Slider } from '../components/Slider';
import { showToast } from '../components/Toast';
import { Save } from 'lucide-react';

const INITIAL_STATE: MatchScoutData = {
  matchNumber: '',
  teamNumber: '',
  allianceColor: '',
  leftStartingZone: false,
  autoFuelScored: 0,
  autoClimbAttempted: false,
  teleopFuelScored: 0,
  avgBps: 0,
  shootingConsistency: 3,
  intakeConsistency: 3,
  droveOverBump: false,
  droveUnderTrench: false,
  playedDefense: false,
  defendedAgainst: false,
  hubScoringStrategy: '',
  endGameClimbResult: '',
  climbTimeSeconds: '',
  foulsCaused: 0,
  cardReceived: '',
  notes: ''
};

export function MatchScouting() {
  const [data, setData] = useState<MatchScoutData>(INITIAL_STATE);

  useEffect(() => {
    if (data.matchNumber && data.teamNumber) {
      const saved = storage.get<any>(`matchScout:${data.matchNumber}:${data.teamNumber}`);
      if (saved && saved.data) {
        setData(saved.data);
      }
    }
  }, [data.matchNumber, data.teamNumber]);

  const updateField = <K extends keyof MatchScoutData>(field: K, value: MatchScoutData[K]) => {
    const newData = { ...data, [field]: value };
    setData(newData);
    if (newData.matchNumber && newData.teamNumber) {
      storage.saveRecord('matchScout', `matchScout:${newData.matchNumber}:${newData.teamNumber}`, newData);
    }
  };

  const handleSave = () => {
    if (!data.matchNumber || !data.teamNumber) {
      showToast('Please enter both match and team numbers');
      return;
    }
    // Data is already auto-saved to storage on every change.
    // Just reset the form for the next entry.
    setData(INITIAL_STATE);
    showToast(`Saved match ${data.matchNumber} for team ${data.teamNumber}`);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <div className="max-w-2xl mx-auto space-y-8 pb-24">
      <div className="bg-slate-800/50 p-6 rounded-2xl border border-slate-700 shadow-xl space-y-6">
        <h2 className="text-2xl font-bold text-white mb-4">Pre-Match Setup</h2>
        
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <label className="block text-sm font-medium text-slate-300">Match Number</label>
            <input
              type="number"
              value={data.matchNumber}
              onChange={(e) => updateField('matchNumber', e.target.value ? parseInt(e.target.value) : '')}
              className="w-full px-4 py-3 bg-slate-900 border border-slate-700 rounded-xl text-white focus:ring-2 focus:ring-blue-500 font-mono text-xl"
            />
          </div>
          <div className="space-y-2">
            <label className="block text-sm font-medium text-slate-300">Team Number</label>
            <input
              type="number"
              value={data.teamNumber}
              onChange={(e) => updateField('teamNumber', e.target.value ? parseInt(e.target.value) : '')}
              className="w-full px-4 py-3 bg-slate-900 border border-slate-700 rounded-xl text-white focus:ring-2 focus:ring-blue-500 font-mono text-xl"
            />
          </div>
        </div>

        <MultiToggle
          label="Alliance Color"
          options={['Red', 'Blue']}
          value={data.allianceColor}
          onChange={(v) => updateField('allianceColor', v)}
        />
      </div>

      <div className="bg-slate-800/50 p-6 rounded-2xl border border-slate-700 shadow-xl space-y-6">
        <h2 className="text-2xl font-bold text-white mb-4">Autonomous (0:00 - 0:20)</h2>

        <Toggle label="Left Starting Zone?" value={data.leftStartingZone} onChange={(v) => updateField('leftStartingZone', v)} />
        
        <Stepper
          label="Fuel Scored in Auto"
          value={data.autoFuelScored}
          onChange={(v) => updateField('autoFuelScored', v)}
          min={0}
          max={30}
        />

        <div className="space-y-4 p-4 bg-slate-900/50 rounded-xl border border-slate-700">
          <Toggle label="Tower Climb Attempted in Auto?" value={data.autoClimbAttempted} onChange={(v) => updateField('autoClimbAttempted', v)} />
          {data.autoClimbAttempted && (
            <MultiToggle
              label="Auto Climb Result"
              options={['Level 1 Successful', 'Attempted but Failed']}
              value={data.autoClimbResult || ''}
              onChange={(v) => updateField('autoClimbResult', v)}
            />
          )}
        </div>
      </div>

      <div className="bg-slate-800/50 p-6 rounded-2xl border border-slate-700 shadow-xl space-y-6">
        <h2 className="text-2xl font-bold text-white mb-4">Teleop (0:20 - 2:30)</h2>

        <Stepper
          label="Fuel Scored in Teleop"
          value={data.teleopFuelScored}
          onChange={(v) => updateField('teleopFuelScored', v)}
          min={0}
          max={200}
        />

        <Slider
          label="Avg Balls Per Second (estimated)"
          value={data.avgBps}
          onChange={(v) => updateField('avgBps', v)}
          min={0}
          max={5}
          step={0.5}
          formatValue={(v) => `${v.toFixed(1)} BPS`}
        />

        <Slider
          label="Shooting Consistency"
          value={data.shootingConsistency}
          onChange={(v) => updateField('shootingConsistency', v)}
          min={1}
          max={5}
        />

        <Slider
          label="Intake Consistency"
          value={data.intakeConsistency}
          onChange={(v) => updateField('intakeConsistency', v)}
          min={1}
          max={5}
        />

        <div className="space-y-4 p-4 bg-slate-900/50 rounded-xl border border-slate-700">
          <h3 className="text-sm font-medium text-slate-300">Traversal Used</h3>
          <Toggle label="Drove over Bump" value={data.droveOverBump} onChange={(v) => updateField('droveOverBump', v)} />
          <Toggle label="Drove under Trench" value={data.droveUnderTrench} onChange={(v) => updateField('droveUnderTrench', v)} />
        </div>

        <MultiToggle
          label="Hub Scoring Strategy"
          options={['Prioritized scoring when Hub active', 'Scored regardless of Hub state', 'Primarily collected/fed Human Player']}
          value={data.hubScoringStrategy}
          onChange={(v) => updateField('hubScoringStrategy', v)}
        />

        <div className="space-y-4 p-4 bg-slate-900/50 rounded-xl border border-slate-700">
          <Toggle label="Played Defense?" value={data.playedDefense} onChange={(v) => updateField('playedDefense', v)} />
          {data.playedDefense && (
            <Slider
              label="Defense Effectiveness"
              value={data.defenseEffectiveness || 3}
              onChange={(v) => updateField('defenseEffectiveness', v)}
              min={1}
              max={5}
            />
          )}
          <Toggle label="Defended Against?" value={data.defendedAgainst} onChange={(v) => updateField('defendedAgainst', v)} />
        </div>
      </div>

      <div className="bg-slate-800/50 p-6 rounded-2xl border border-slate-700 shadow-xl space-y-6">
        <h2 className="text-2xl font-bold text-white mb-4">End Game</h2>

        <MultiToggle
          label="Tower Climb Result"
          options={['Did Not Attempt', 'Parked near Tower', 'Level 1', 'Level 2', 'Level 3', 'Attempted but Failed']}
          value={data.endGameClimbResult}
          onChange={(v) => updateField('endGameClimbResult', v)}
        />

        <div className="space-y-2">
          <label className="block text-sm font-medium text-slate-300">Climb Time (seconds)</label>
          <input
            type="number"
            value={data.climbTimeSeconds}
            onChange={(e) => updateField('climbTimeSeconds', e.target.value ? parseFloat(e.target.value) : '')}
            className="w-full px-4 py-3 bg-slate-900 border border-slate-700 rounded-xl text-white focus:ring-2 focus:ring-blue-500"
          />
        </div>
      </div>

      <div className="bg-slate-800/50 p-6 rounded-2xl border border-slate-700 shadow-xl space-y-6">
        <h2 className="text-2xl font-bold text-white mb-4">Post-Match</h2>

        <Stepper
          label="Fouls Caused"
          value={data.foulsCaused}
          onChange={(v) => updateField('foulsCaused', v)}
          min={0}
        />

        <MultiToggle
          label="Card Received?"
          options={['None', 'Yellow', 'Red']}
          value={data.cardReceived}
          onChange={(v) => updateField('cardReceived', v)}
        />

        <div className="space-y-2">
          <label className="block text-sm font-medium text-slate-300">Notes</label>
          <textarea
            value={data.notes}
            onChange={(e) => updateField('notes', e.target.value)}
            className="w-full px-4 py-3 bg-slate-900 border border-slate-700 rounded-xl text-white focus:ring-2 focus:ring-blue-500 min-h-[120px]"
          />
        </div>
      </div>

      <div className="flex justify-end pt-4">
        <button
          onClick={handleSave}
          className="flex items-center gap-2 px-8 py-4 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl transition-colors shadow-lg shadow-emerald-600/20 w-full sm:w-auto justify-center text-lg"
        >
          <Save className="w-6 h-6" />
          Save & Next
        </button>
      </div>
    </div>
  );
}
