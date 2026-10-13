import { TBATeam } from '../types';

export function getTeamDisplayName(team: Pick<TBATeam, 'team_number' | 'name' | 'nickname'>): string {
  const candidates = [team.nickname, team.name]
    .filter((value): value is string => typeof value === 'string')
    .map((value) => value.trim())
    .filter(Boolean);

  const placeholderPattern = new RegExp(
    `^(?:${team.team_number}\\s*[-–—:]\\s*)?team\\s*${team.team_number}$`,
    'i',
  );

  return candidates.find((value) => !placeholderPattern.test(value)) || `Team ${team.team_number}`;
}

export function formatTeamLabel(team: Pick<TBATeam, 'team_number' | 'name' | 'nickname'>): string {
  return `${team.team_number} – ${getTeamDisplayName(team)}`;
}
