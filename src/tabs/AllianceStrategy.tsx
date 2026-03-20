import React, { useState, useMemo } from 'react';
import { storage } from '../lib/storage';
import { MatchScoutData, SyncRecord, TBATeam } from '../types';
import { scoring } from '../lib/scoring';
import { tba } from '../lib/tba';

export function AllianceStrategy() {
  const [blueTeams, setBlueTeams] = useState<number[]>([]);
  const [redTeams, setRedTeams] = useState<number[]>([]);
  const [selectedTeam, setSelectedTeam] = useState<number | ''>('');
  const [selectedAlliance, setSelectedAlliance] = useState<'Blue' | 'Red'>('Blue');

  const allMatches = useMemo(() => {
    const keys = storage.getAllKeys().filter(k => k.startsWith('matchScout:'));
    return keys.map(k => storage.get<SyncRecord<MatchScoutData>>(k)?.data).filter(Boolean) as MatchScoutData[];
  }, []);

  const tbaTeams = useMemo(() => tba.getTeams(), []);

  const getTeamStats = (teamNumber: number) => {
    const matches = allMatches.filter(m => m.teamNumber === teamNumber);
    const count = matches.length;
    
    if (count === 0) return null;

    const totalFuel = matches.reduce((sum, m) => sum + scoring.getFuelPoints(m.autoFuelScored, m.teleopFuelScored), 0);
    const totalAutoFuel = matches.reduce((sum, m) => sum + m.autoFuelScored, 0);
    const totalBps = matches.reduce((sum, m) => sum + m.avgBps, 0);
    const totalShootingConsistency = matches.reduce((sum, m) => sum + m.shootingConsistency, 0);
    
    const climbSuccesses = matches.filter(m => ['Level 1', 'Level 2', 'Level 3'].includes(m.endGameClimbResult)).length;
    const totalTowerPoints = matches.reduce((sum, m) => sum + scoring.getTowerPoints(m.endGameClimbResult, m.autoClimbResult), 0);
    
    const climbLevels = matches.map(m => m.endGameClimbResult).filter(r => ['Level 1', 'Level 2', 'Level 3'].includes(r));
    const preferredClimbLevel = climbLevels.length > 0 
      ? climbLevels.sort((a,b) => climbLevels.filter(v => v===a).length - climbLevels.filter(v => v===b).length).pop() 
      : 'None';

    const droveOverBump = matches.some(m => m.droveOverBump);
    const droveUnderTrench = matches.some(m => m.droveUnderTrench);
    let traversal = 'Neither';
    if (droveOverBump && droveUnderTrench) traversal = 'Both';
    else if (droveOverBump) traversal = 'Bump';
    else if (droveUnderTrench) traversal = 'Trench';

    const defensePlayed = matches.filter(m => m.playedDefense);
    const defenseRate = defensePlayed.length / count;
    const avgDefenseEffectiveness = defensePlayed.length > 0 
      ? defensePlayed.reduce((sum, m) => sum + (m.defenseEffectiveness || 0), 0) / defensePlayed.length 
      : 0;

    const totalFouls = matches.reduce((sum, m) => sum + m.foulsCaused, 0);

    return {
      teamNumber,
      nickname: tbaTeams.find(t => t.team_number === teamNumber)?.nickname || 'Unknown',
      avgFuel: totalFuel / count,
      avgAutoFuel: totalAutoFuel / count,
      avgBps: totalBps / count,
      avgShootingConsistency: totalShootingConsistency / count,
      climbSuccessRate: climbSuccesses / count,
      avgTowerPoints: totalTowerPoints / count,
      preferredClimbLevel,
      traversal,
      defenseRate,
      avgDefenseEffectiveness,
      avgFouls: totalFouls / count,
      notes: matches.filter(m => m.notes).map(m => ({ match: m.matchNumber, note: m.notes }))
    };
  };

  const handleAddTeam = () => {
    if (!selectedTeam) return;
    if (selectedAlliance === 'Blue' && blueTeams.length < 3 && !blueTeams.includes(selectedTeam)) {
      setBlueTeams([...blueTeams, selectedTeam]);
    } else if (selectedAlliance === 'Red' && redTeams.length < 3 && !redTeams.includes(selectedTeam)) {
      setRedTeams([...redTeams, selectedTeam]);
    }
    setSelectedTeam('');
  };

  const renderTeamCard = (teamNumber: number, alliance: 'Blue' | 'Red') => {
    const stats = getTeamStats(teamNumber);
    if (!stats) return (
      <div className="bg-slate-800/50 p-6 rounded-2xl border border-slate-700 shadow-xl flex items-center justify-center min-h-[400px]">
        <span className="text-slate-500">No data for {teamNumber}</span>
      </div>
    );

    return (
      <div className={`bg-slate-800/50 p-6 rounded-2xl border shadow-xl space-y-4 ${alliance === 'Blue' ? 'border-blue-500/30' : 'border-red-500/30'}`}>
        <div className="flex justify-between items-start">
          <div>
            <h3 className="text-2xl font-bold font-mono text-white">{stats.teamNumber}</h3>
            <p className="text-sm text-slate-400">{stats.nickname}</p>
          </div>
          <button 
            onClick={() => alliance === 'Blue' ? setBlueTeams(blueTeams.filter(t => t !== teamNumber)) : setRedTeams(redTeams.filter(t => t !== teamNumber))}
            className="text-slate-500 hover:text-white transition-colors"
          >
            Remove
          </button>
        </div>

        <div className="grid grid-cols-2 gap-4 text-sm">
          <div className="space-y-1">
            <span className="text-slate-400 block">Avg Fuel</span>
            <span className="font-mono text-lg text-white">{stats.avgFuel.toFixed(1)}</span>
          </div>
          <div className="space-y-1">
            <span className="text-slate-400 block">Avg Auto Fuel</span>
            <span className="font-mono text-lg text-white">{stats.avgAutoFuel.toFixed(1)}</span>
          </div>
          <div className="space-y-1">
            <span className="text-slate-400 block">Avg BPS</span>
            <span className="font-mono text-lg text-white">{stats.avgBps.toFixed(1)}</span>
          </div>
          <div className="space-y-1">
            <span className="text-slate-400 block">Shooting Cons.</span>
            <span className="font-mono text-lg text-white">{stats.avgShootingConsistency.toFixed(1)}/5</span>
          </div>
          <div className="space-y-1">
            <span className="text-slate-400 block">Climb Rate</span>
            <span className="font-mono text-lg text-white">{(stats.climbSuccessRate * 100).toFixed(0)}%</span>
          </div>
          <div className="space-y-1">
            <span className="text-slate-400 block">Avg Tower Pts</span>
            <span className="font-mono text-lg text-white">{stats.avgTowerPoints.toFixed(1)}</span>
          </div>
          <div className="space-y-1">
            <span className="text-slate-400 block">Pref. Climb</span>
            <span className="font-mono text-white">{stats.preferredClimbLevel}</span>
          </div>
          <div className="space-y-1">
            <span className="text-slate-400 block">Traversal</span>
            <span className="font-mono text-white">{stats.traversal}</span>
          </div>
          <div className="space-y-1">
            <span className="text-slate-400 block">Defense Rate</span>
            <span className="font-mono text-white">{(stats.defenseRate * 100).toFixed(0)}%</span>
          </div>
          <div className="space-y-1">
            <span className="text-slate-400 block">Def. Effect.</span>
            <span className="font-mono text-white">{stats.avgDefenseEffectiveness.toFixed(1)}/5</span>
          </div>
        </div>

        {stats.notes.length > 0 && (
          <div className="mt-4 pt-4 border-t border-slate-700">
            <h4 className="text-sm font-medium text-slate-300 mb-2">Notes</h4>
            <div className="space-y-2 max-h-40 overflow-y-auto pr-2">
              {stats.notes.map((n, i) => (
                <div key={i} className="text-xs text-slate-400 bg-slate-900/50 p-2 rounded">
                  <span className="font-mono text-blue-400 mr-2">Qm{n.match}</span>
                  {n.note}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  };

  const renderAllianceSummary = (teams: number[], alliance: 'Blue' | 'Red') => {
    if (teams.length === 0) return null;

    const statsList = teams.map(getTeamStats).filter(Boolean) as NonNullable<ReturnType<typeof getTeamStats>>[];
    if (statsList.length === 0) return null;

    const combinedFuel = statsList.reduce((sum, s) => sum + s.avgFuel, 0);
    const combinedTowerPts = statsList.reduce((sum, s) => sum + s.avgTowerPoints, 0);
    const anyL2L3 = statsList.some(s => s.preferredClimbLevel === 'Level 2' || s.preferredClimbLevel === 'Level 3');
    const anyDefense = statsList.some(s => s.defenseRate > 0.3);

    let recommendation = '';
    if (combinedFuel > 200 && !anyL2L3) {
      recommendation = "Focus on maximizing shooter output and getting one robot to L2 for Traversal RP.";
    } else if (combinedFuel < 100 && anyL2L3) {
      recommendation = "Tower-heavy strategy — prioritize climb timing and position.";
    } else if (anyDefense && combinedFuel > 150) {
      recommendation = "Strong balanced alliance. Assign one dedicated defender to disrupt opponents while two score.";
    } else {
      recommendation = "Focus on consistent fuel scoring to reach Energized RP.";
    }

    return (
      <div className={`col-span-full mt-8 bg-slate-800/50 p-6 rounded-2xl border shadow-xl ${alliance === 'Blue' ? 'border-blue-500/50' : 'border-red-500/50'}`}>
        <h3 className={`text-xl font-bold mb-4 ${alliance === 'Blue' ? 'text-blue-400' : 'text-red-400'}`}>
          {alliance} Alliance Summary
        </h3>
        
        <div className="grid grid-cols-2 md:grid-cols-4 gap-6 mb-6">
          <div className="space-y-1">
            <span className="text-sm text-slate-400 block">Combined Avg Fuel</span>
            <span className="text-2xl font-mono font-bold text-white">{combinedFuel.toFixed(1)}</span>
          </div>
          <div className="space-y-1">
            <span className="text-sm text-slate-400 block">Energized RP (&gt;100)</span>
            <span className={`text-xl font-bold ${combinedFuel >= 100 ? 'text-emerald-400' : 'text-amber-400'}`}>
              {combinedFuel >= 100 ? 'Likely' : 'Unlikely'}
            </span>
          </div>
          <div className="space-y-1">
            <span className="text-sm text-slate-400 block">Supercharged RP (&gt;360)</span>
            <span className={`text-xl font-bold ${combinedFuel >= 360 ? 'text-emerald-400' : 'text-slate-500'}`}>
              {combinedFuel >= 360 ? 'Likely' : 'Unlikely'}
            </span>
          </div>
          <div className="space-y-1">
            <span className="text-sm text-slate-400 block">Traversal RP (&gt;50)</span>
            <span className={`text-xl font-bold ${combinedTowerPts >= 50 ? 'text-emerald-400' : 'text-amber-400'}`}>
              {combinedTowerPts >= 50 ? 'Likely' : 'Unlikely'}
            </span>
          </div>
        </div>

        <div className="p-4 bg-slate-900/50 rounded-xl border border-slate-700">
          <h4 className="text-sm font-medium text-slate-300 mb-2">Strategy Recommendation</h4>
          <p className="text-white">{recommendation}</p>
        </div>
      </div>
    );
  };

  return (
    <div className="max-w-7xl mx-auto space-y-8 pb-24 px-4">
      <div className="bg-slate-800/50 p-6 rounded-2xl border border-slate-700 shadow-xl flex flex-col md:flex-row gap-4 items-end">
        <div className="flex-1 space-y-2 w-full">
          <label className="block text-sm font-medium text-slate-300">Select Team</label>
          <input
            type="number"
            value={selectedTeam}
            onChange={(e) => setSelectedTeam(e.target.value ? parseInt(e.target.value) : '')}
            className="w-full px-4 py-3 bg-slate-900 border border-slate-700 rounded-xl text-white focus:ring-2 focus:ring-blue-500 font-mono text-xl"
            placeholder="Team Number"
          />
        </div>
        <div className="flex-1 space-y-2 w-full">
          <label className="block text-sm font-medium text-slate-300">Alliance</label>
          <div className="flex bg-slate-900 p-1 rounded-xl border border-slate-700">
            <button
              onClick={() => setSelectedAlliance('Blue')}
              className={`flex-1 py-2 px-4 text-sm font-medium rounded-lg transition-colors ${
                selectedAlliance === 'Blue' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Blue
            </button>
            <button
              onClick={() => setSelectedAlliance('Red')}
              className={`flex-1 py-2 px-4 text-sm font-medium rounded-lg transition-colors ${
                selectedAlliance === 'Red' ? 'bg-red-600 text-white' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Red
            </button>
          </div>
        </div>
        <button
          onClick={handleAddTeam}
          disabled={!selectedTeam}
          className="w-full md:w-auto px-8 py-3 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-medium rounded-xl transition-colors h-[52px]"
        >
          Add Team
        </button>
      </div>

      {blueTeams.length > 0 && (
        <div className="space-y-6">
          <h2 className="text-2xl font-bold text-blue-400">Blue Alliance</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {blueTeams.map(t => renderTeamCard(t, 'Blue'))}
            {renderAllianceSummary(blueTeams, 'Blue')}
          </div>
        </div>
      )}

      {redTeams.length > 0 && (
        <div className="space-y-6">
          <h2 className="text-2xl font-bold text-red-400">Red Alliance</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {redTeams.map(t => renderTeamCard(t, 'Red'))}
            {renderAllianceSummary(redTeams, 'Red')}
          </div>
        </div>
      )}
    </div>
  );
}
