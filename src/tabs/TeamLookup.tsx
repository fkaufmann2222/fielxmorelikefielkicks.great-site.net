import React, { useState } from 'react';
import { gemini } from '../lib/gemini';
import { showToast } from '../components/Toast';
import { TeamImportData } from '../types';

export function TeamLookup() {
  const [csvData, setCsvData] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isSubmittingImport, setIsSubmittingImport] = useState(false);
  const [parsedTeams, setParsedTeams] = useState<TeamImportData[]>([]);
  const [importLog, setImportLog] = useState<string | null>(null);

  const normalizeParsedTeam = (record: TeamImportData): TeamImportData | null => {
    const teamNumber = Number(record.teamNumber);
    if (!Number.isInteger(teamNumber) || teamNumber <= 0) {
      return null;
    }

    return {
      teamNumber,
      previousCompRank: record.previousCompRank?.toString().trim() || 'N/A',
      autoFuelCount:
        typeof record.autoFuelCount === 'number' && Number.isFinite(record.autoFuelCount)
          ? record.autoFuelCount
          : null,
      autoNotes: record.autoNotes?.toString() || '',
    };
  };

  const handleAnalyzeCSV = async () => {
    if (!csvData.trim()) {
      showToast('CSV data required');
      return;
    }

    setIsLoading(true);
    setImportLog(null);
    setParsedTeams([]);

    try {
      const records = await gemini.analyzeCSV(csvData);
      const dedupedByTeam = new Map<number, TeamImportData>();

      records.forEach((record) => {
        const normalized = normalizeParsedTeam(record);
        if (!normalized) return;
        dedupedByTeam.set(normalized.teamNumber, normalized);
      });

      const parsed = Array.from(dedupedByTeam.values()).sort((a, b) => a.teamNumber - b.teamNumber);
      setParsedTeams(parsed);

      const skipped = records.length - parsed.length;
      setImportLog(
        `Parsed ${records.length} rows. Ready to submit ${parsed.length} teams${
          skipped > 0 ? `, skipped ${skipped} invalid/duplicate rows` : ''
        }.`
      );
      showToast('CSV analyzed. Review and submit when ready.');
    } catch (error) {
      showToast('Failed to import CSV');
      setImportLog('Error parsing CSV. Please check the format and try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const updateParsedTeam = <K extends keyof TeamImportData>(index: number, field: K, value: TeamImportData[K]) => {
    setParsedTeams((current) => {
      const updated = [...current];
      updated[index] = { ...updated[index], [field]: value };
      return updated;
    });
  };

  const handleSubmitTeamImport = async () => {
    if (parsedTeams.length === 0) {
      showToast('No parsed teams to submit');
      return;
    }

    const normalized = parsedTeams
      .map(normalizeParsedTeam)
      .filter((record): record is TeamImportData => Boolean(record));

    if (normalized.length === 0) {
      showToast('No valid team rows to submit');
      return;
    }

    setIsSubmittingImport(true);
    try {
      const result = await gemini.importTeams(normalized);
      setImportLog(
        `Parsed ${result.parsed} rows. Submitted ${normalized.length} rows into match scouts. Added ${result.added} new, updated ${result.updated}, skipped ${result.skipped}.`
      );
      showToast('Rows submitted to match scouts');
      window.dispatchEvent(new CustomEvent('team-import-success'));
      setCsvData('');
      setParsedTeams([]);
    } catch (error) {
      showToast('Failed to submit team import');
      setImportLog('Submit failed. Confirm your Supabase env vars and match_scouts schema columns exist, then try again.');
    } finally {
      setIsSubmittingImport(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-8 pb-24">
      <div className="bg-slate-800/50 p-4 rounded-xl border border-slate-700">
        <h2 className="text-white font-semibold">Google Sheets Backload</h2>
        <p className="text-sm text-slate-400 mt-1">
          Team loading via TBA event key has moved to competition profile creation on Home.
        </p>
      </div>

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
            Analyze CSV first, then review/edit parsed rows before submitting to Supabase.
          </div>
          <div className="flex gap-3">
            <button
              onClick={handleAnalyzeCSV}
              disabled={isLoading || isSubmittingImport || !csvData.trim()}
              className="px-6 py-3 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-medium rounded-xl transition-colors"
            >
              {isLoading ? 'Analyzing...' : 'Analyze CSV'}
            </button>
            <button
              onClick={handleSubmitTeamImport}
              disabled={isLoading || isSubmittingImport || parsedTeams.length === 0}
              className="px-6 py-3 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-medium rounded-xl transition-colors"
            >
              {isSubmittingImport ? 'Submitting...' : 'Submit to Supabase'}
            </button>
          </div>
        </div>

        {parsedTeams.length > 0 && (
          <div className="space-y-3">
            <h3 className="text-sm font-semibold text-slate-300">Parsed Team Preview (Editable)</h3>
            <div className="overflow-x-auto border border-slate-700 rounded-xl">
              <table className="w-full text-left text-sm text-slate-300">
                <thead className="bg-slate-900/70 text-slate-400">
                  <tr>
                    <th className="px-4 py-3 min-w-[120px]">Team</th>
                    <th className="px-4 py-3 min-w-[180px]">Prev Comp Rank</th>
                    <th className="px-4 py-3 min-w-[160px]">Auto Fuel Count</th>
                    <th className="px-4 py-3 min-w-[360px]">Auto Notes</th>
                    <th className="px-4 py-3 min-w-[100px]">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-700 bg-slate-900/30">
                  {parsedTeams.map((team, index) => (
                    <tr key={`${team.teamNumber}-${index}`} className="hover:bg-slate-800/40">
                      <td className="px-4 py-3">
                        <input
                          type="number"
                          value={team.teamNumber}
                          onChange={(e) => {
                            const value = Number.parseInt(e.target.value, 10);
                            updateParsedTeam(index, 'teamNumber', Number.isInteger(value) ? value : 0);
                          }}
                          className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white font-mono"
                        />
                      </td>
                      <td className="px-4 py-3">
                        <input
                          type="text"
                          value={team.previousCompRank}
                          onChange={(e) => updateParsedTeam(index, 'previousCompRank', e.target.value)}
                          className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white"
                        />
                      </td>
                      <td className="px-4 py-3">
                        <input
                          type="text"
                          value={team.autoFuelCount ?? ''}
                          onChange={(e) => {
                            const raw = e.target.value.trim();
                            if (!raw) {
                              updateParsedTeam(index, 'autoFuelCount', null);
                              return;
                            }
                            const value = Number(raw);
                            updateParsedTeam(index, 'autoFuelCount', Number.isFinite(value) ? value : null);
                          }}
                          placeholder="N/A"
                          className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white"
                        />
                      </td>
                      <td className="px-4 py-3">
                        <textarea
                          value={team.autoNotes}
                          onChange={(e) => updateParsedTeam(index, 'autoNotes', e.target.value)}
                          className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white min-h-[72px]"
                        />
                      </td>
                      <td className="px-4 py-3">
                        <button
                          onClick={() => setParsedTeams((current) => current.filter((_, i) => i !== index))}
                          className="px-3 py-2 bg-rose-600/80 hover:bg-rose-500 text-white rounded-lg transition-colors"
                        >
                          Remove
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {importLog && (
          <div className="p-4 bg-slate-900/50 border border-slate-700 rounded-xl text-sm font-mono text-emerald-400">
            {importLog}
          </div>
        )}
      </div>
    </div>
  );
}
