import React, { useState } from 'react';
import { storage } from '../lib/storage';
import { tba } from '../lib/tba';
import { gemini } from '../lib/gemini';
import { showToast } from '../components/Toast';
import { TBATeam, TBAMatch } from '../types';

export function TeamLookup() {
  const [activeTab, setActiveTab] = useState<'tba' | 'gemini'>('tba');
  const [eventKey, setEventKey] = useState(storage.get<string>('eventKey') || '');
  const [csvData, setCsvData] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [teams, setTeams] = useState<TBATeam[]>(tba.getTeams());
  const [matches, setMatches] = useState<TBAMatch[]>(tba.getMatches());
  const [importLog, setImportLog] = useState<string | null>(null);

  const handleLoadTeams = async () => {
    const apiKey = storage.get<string>('tbaApiKey');
    if (!apiKey) {
      showToast('TBA API Key missing in Settings');
      return;
    }
    if (!eventKey) {
      showToast('Event Key required');
      return;
    }

    setIsLoading(true);
    try {
      const loadedTeams = await tba.fetchTeams(eventKey, apiKey);
      setTeams(loadedTeams);
      storage.set('eventKey', eventKey);
      showToast(`Loaded ${loadedTeams.length} teams`);
    } catch (error) {
      showToast('Failed to load teams');
    } finally {
      setIsLoading(false);
    }
  };

  const handleLoadMatches = async () => {
    const apiKey = storage.get<string>('tbaApiKey');
    if (!apiKey) {
      showToast('TBA API Key missing in Settings');
      return;
    }
    if (!eventKey) {
      showToast('Event Key required');
      return;
    }

    setIsLoading(true);
    try {
      const loadedMatches = await tba.fetchMatches(eventKey, apiKey);
      setMatches(loadedMatches);
      storage.set('eventKey', eventKey);
      showToast(`Loaded ${loadedMatches.length} matches`);
    } catch (error) {
      showToast('Failed to load matches');
    } finally {
      setIsLoading(false);
    }
  };

  const handleImportCSV = async () => {
    const apiKey = storage.get<string>('geminiApiKey');
    if (!apiKey) {
      showToast('Gemini API Key missing in Settings');
      return;
    }
    if (!csvData.trim()) {
      showToast('CSV data required');
      return;
    }

    setIsLoading(true);
    setImportLog(null);
    try {
      const records = await gemini.analyzeCSV(csvData, apiKey);
      
      let newCount = 0;
      let dupCount = 0;

      records.forEach(record => {
        if (!record.matchNumber || !record.teamNumber) return;
        const key = `matchScout:${record.matchNumber}:${record.teamNumber}`;
        const existing = storage.get(key);
        if (!existing) {
          storage.saveRecord('matchScout', key, record);
          newCount++;
        } else {
          dupCount++;
        }
      });

      setImportLog(`Parsed ${records.length} records. Added ${newCount} new, skipped ${dupCount} duplicates.`);
      showToast('Import complete');
      setCsvData('');
    } catch (error) {
      showToast('Failed to import CSV');
      setImportLog('Error parsing CSV. Please check the format and try again.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-8 pb-24">
      <div className="flex bg-slate-800/50 p-1 rounded-xl border border-slate-700">
        <button
          onClick={() => setActiveTab('tba')}
          className={`flex-1 py-3 px-4 text-sm font-medium rounded-lg transition-colors ${
            activeTab === 'tba'
              ? 'bg-blue-600 text-white shadow-sm'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-700/50'
          }`}
        >
          TBA Team Loader
        </button>
        <button
          onClick={() => setActiveTab('gemini')}
          className={`flex-1 py-3 px-4 text-sm font-medium rounded-lg transition-colors ${
            activeTab === 'gemini'
              ? 'bg-blue-600 text-white shadow-sm'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-700/50'
          }`}
        >
          Google Sheets Backload
        </button>
      </div>

      {activeTab === 'tba' && (
        <div className="space-y-6">
          <div className="bg-slate-800/50 p-6 rounded-2xl border border-slate-700 shadow-xl space-y-6">
            <div className="space-y-2">
              <label className="block text-sm font-medium text-slate-300">Event Key</label>
              <div className="flex gap-4">
                <input
                  type="text"
                  value={eventKey}
                  onChange={(e) => setEventKey(e.target.value)}
                  placeholder="e.g. 2026paphi"
                  className="flex-1 px-4 py-3 bg-slate-900 border border-slate-700 rounded-xl text-white focus:ring-2 focus:ring-blue-500 font-mono uppercase"
                />
                <button
                  onClick={handleLoadTeams}
                  disabled={isLoading}
                  className="px-6 py-3 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-medium rounded-xl transition-colors"
                >
                  Load Teams
                </button>
                <button
                  onClick={handleLoadMatches}
                  disabled={isLoading}
                  className="px-6 py-3 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-medium rounded-xl transition-colors"
                >
                  Load Matches
                </button>
              </div>
            </div>
          </div>

          {teams.length > 0 && (
            <div className="bg-slate-800/50 rounded-2xl border border-slate-700 shadow-xl overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm text-slate-300">
                  <thead className="bg-slate-900/50 text-slate-400 font-medium">
                    <tr>
                      <th className="px-6 py-4">Team</th>
                      <th className="px-6 py-4">Nickname</th>
                      <th className="px-6 py-4">Location</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-700">
                    {teams.map((team) => (
                      <tr key={team.key} className="hover:bg-slate-800/50 transition-colors">
                        <td className="px-6 py-4 font-mono font-bold text-white">{team.team_number}</td>
                        <td className="px-6 py-4">{team.nickname}</td>
                        <td className="px-6 py-4">{team.city}, {team.state_prov}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {activeTab === 'gemini' && (
        <div className="bg-slate-800/50 p-6 rounded-2xl border border-slate-700 shadow-xl space-y-6">
          <div className="space-y-2">
            <label className="block text-sm font-medium text-slate-300">Raw CSV Data</label>
            <textarea
              value={csvData}
              onChange={(e) => setCsvData(e.target.value)}
              placeholder="Paste raw CSV data exported from Google Sheets..."
              className="w-full px-4 py-3 bg-slate-900 border border-slate-700 rounded-xl text-white focus:ring-2 focus:ring-blue-500 min-h-[300px] font-mono text-sm"
            />
          </div>

          <div className="flex justify-between items-center">
            <div className="text-sm text-slate-400">
              Requires Gemini API Key in Settings
            </div>
            <button
              onClick={handleImportCSV}
              disabled={isLoading || !csvData.trim()}
              className="px-6 py-3 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-medium rounded-xl transition-colors"
            >
              {isLoading ? 'Analyzing...' : 'Analyze & Import'}
            </button>
          </div>

          {importLog && (
            <div className="p-4 bg-slate-900/50 border border-slate-700 rounded-xl text-sm font-mono text-emerald-400">
              {importLog}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
