import { storage } from './storage';
import { TBATeam, TBAMatch } from '../types';

export const tba = {
  async fetchTeams(eventKey: string, apiKey: string): Promise<TBATeam[]> {
    const response = await fetch(`https://www.thebluealliance.com/api/v3/event/${eventKey}/teams/simple`, {
      headers: { 'X-TBA-Auth-Key': apiKey }
    });
    if (!response.ok) throw new Error('Failed to fetch teams');
    const teams = await response.json();
    storage.set('tbaTeams', teams);
    return teams;
  },

  async fetchMatches(eventKey: string, apiKey: string): Promise<TBAMatch[]> {
    const response = await fetch(`https://www.thebluealliance.com/api/v3/event/${eventKey}/matches/simple`, {
      headers: { 'X-TBA-Auth-Key': apiKey }
    });
    if (!response.ok) throw new Error('Failed to fetch matches');
    const matches = await response.json();
    storage.set('tbaMatches', matches);
    return matches;
  },

  getTeams(): TBATeam[] {
    return storage.get<TBATeam[]>('tbaTeams') || [];
  },

  getMatches(): TBAMatch[] {
    return storage.get<TBAMatch[]>('tbaMatches') || [];
  }
};
