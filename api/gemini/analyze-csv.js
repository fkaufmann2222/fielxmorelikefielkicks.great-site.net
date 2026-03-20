import { GoogleGenAI } from '@google/genai';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const csvData = req.body?.csvData;
  if (typeof csvData !== 'string' || !csvData.trim()) {
    return res.status(400).json({ error: 'csvData must be a non-empty string' });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'GEMINI_API_KEY is not configured' });
  }

  const ai = new GoogleGenAI({ apiKey });

  const prompt = `
Parse the following raw CSV data exported from a historical scouting Google Sheet for the 2026 FRC game REBUILT.
Normalize it into a JSON array of team records matching this TypeScript schema:

interface TeamImportData {
  teamNumber: number;
  previousCompRank: string;
  autoFuelCount: number | null;
  autoNotes: string;
}

Rules:
- teamNumber must be an integer from the team number column.
- previousCompRank should preserve values like "N/A" and numeric ranks as strings.
- autoFuelCount should be a number when parseable, otherwise null (for values like N/A or blank).
- autoNotes should be a string (empty string if missing).
- Skip rows that do not include a valid team number.

Return ONLY a JSON array of TeamImportData records with no preamble or markdown.

CSV Data:
${csvData}
`;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: prompt,
      config: {
        responseMimeType: 'application/json',
      },
    });

    const text = response.text || '[]';
    const cleanedText = text.replace(/```json/g, '').replace(/```/g, '').trim();
    const records = JSON.parse(cleanedText);
    return res.status(200).json(records);
  } catch (error) {
    return res.status(500).json({ error: 'Failed to analyze CSV data' });
  }
}
