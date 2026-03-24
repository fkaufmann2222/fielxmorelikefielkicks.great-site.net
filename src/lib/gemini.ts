import { TeamImportData } from '../types';

export type MatchNoteSummary = {
  offense: string;
  defense: string;
  general: string;
};

export const gemini = {
  async analyzeCSV(csvData: string): Promise<TeamImportData[]> {
    const response = await fetch('/api/gemini/analyze-csv', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ csvData }),
    });

    if (!response.ok) {
      throw new Error('Failed to analyze CSV');
    }

    return response.json() as Promise<TeamImportData[]>;
  },

  async importTeams(records: TeamImportData[]): Promise<{ parsed: number; added: number; updated: number; skipped: number; }> {
    const response = await fetch('/api/gemini/import-teams', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ records }),
    });

    if (!response.ok) {
      throw new Error('Failed to import teams');
    }

    return response.json() as Promise<{ parsed: number; added: number; updated: number; skipped: number; }>;
  },

  async summarizeMatchNotes(payload: {
    eventKey: string;
    teamNumber: number;
    offenseNotes: string[];
    defenseNotes: string[];
    generalNotes: string[];
  }): Promise<MatchNoteSummary> {
    const response = await fetch('/api/gemini/summarize-match-notes', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      throw new Error('Failed to summarize match notes');
    }

    return response.json() as Promise<MatchNoteSummary>;
  },
};
