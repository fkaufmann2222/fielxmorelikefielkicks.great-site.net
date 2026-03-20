import { GoogleGenAI } from '@google/genai';
import { MatchScoutData } from '../types';

export const gemini = {
  async analyzeCSV(csvData: string, apiKey: string): Promise<MatchScoutData[]> {
    const ai = new GoogleGenAI({ apiKey });
    
    const prompt = `
      Parse the following raw CSV data exported from a historical scouting Google Sheet for the 2026 FRC game REBUILT.
      Normalize it into a JSON array of match records matching this TypeScript schema:
      
      interface MatchScoutData {
        matchNumber: number | '';
        teamNumber: number | '';
        allianceColor: 'Red' | 'Blue' | '';
        leftStartingZone: boolean;
        autoFuelScored: number;
        autoClimbAttempted: boolean;
        autoClimbResult?: 'Level 1 Successful' | 'Attempted but Failed';
        teleopFuelScored: number;
        avgBps: number;
        shootingConsistency: number;
        intakeConsistency: number;
        droveOverBump: boolean;
        droveUnderTrench: boolean;
        playedDefense: boolean;
        defenseEffectiveness?: number;
        defendedAgainst: boolean;
        hubScoringStrategy: 'Prioritized scoring when Hub active' | 'Scored regardless of Hub state' | 'Primarily collected/fed Human Player' | '';
        endGameClimbResult: 'Did Not Attempt' | 'Parked near Tower' | 'Level 1' | 'Level 2' | 'Level 3' | 'Attempted but Failed' | '';
        climbTimeSeconds: number | '';
        foulsCaused: number;
        cardReceived: 'None' | 'Yellow' | 'Red' | '';
        notes: string;
      }

      Return ONLY a JSON array of match records with no preamble or markdown.
      
      CSV Data:
      ${csvData}
    `;

    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: prompt,
      config: {
        responseMimeType: 'application/json',
      }
    });

    const text = response.text || '[]';
    const cleanedText = text.replace(/```json/g, '').replace(/```/g, '').trim();
    
    try {
      return JSON.parse(cleanedText) as MatchScoutData[];
    } catch (e) {
      console.error('Failed to parse Gemini response', e);
      throw new Error('Failed to parse Gemini response');
    }
  }
};
