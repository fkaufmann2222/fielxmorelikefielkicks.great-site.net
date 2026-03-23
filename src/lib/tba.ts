import { storage } from './storage';
import { TBATeam, TBAMatch, TBAEvent } from '../types';

export const tba = {
  async fetchEvent(eventKey: string): Promise<TBAEvent> {
    const response = await fetch(`/api/tba/event/${encodeURIComponent(eventKey)}`);
    if (!response.ok) throw new Error('Failed to fetch event info');
    return response.json();
  },

  async fetchTeams(eventKey: string): Promise<TBATeam[]> {
    const response = await fetch(`/api/tba/teams/${encodeURIComponent(eventKey)}`);
    if (!response.ok) throw new Error('Failed to fetch teams');
    const teams = await response.json();
    storage.set('tbaTeams', teams);
    return teams;
  },

  async fetchMatches(eventKey: string): Promise<TBAMatch[]> {
    const response = await fetch(`/api/tba/matches/${encodeURIComponent(eventKey)}`);
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
