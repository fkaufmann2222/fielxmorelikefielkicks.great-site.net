import { GoogleGenAI } from '@google/genai';

function toStringArray(value) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter((item) => typeof item === 'string')
    .map((item) => item.trim())
    .filter((item) => item.length > 0)
    .slice(0, 120);
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const eventKey = typeof req.body?.eventKey === 'string' ? req.body.eventKey.trim() : '';
  const teamNumber = Number(req.body?.teamNumber);

  const offenseNotes = toStringArray(req.body?.offenseNotes);
  const defenseNotes = toStringArray(req.body?.defenseNotes);
  const generalNotes = toStringArray(req.body?.generalNotes);

  if (!eventKey || !Number.isFinite(teamNumber)) {
    return res.status(400).json({ error: 'eventKey and teamNumber are required' });
  }

  if (offenseNotes.length === 0 && defenseNotes.length === 0 && generalNotes.length === 0) {
    return res.status(200).json({
      offense: 'No offense notes were provided for this team yet.',
      defense: 'No defense notes were provided for this team yet.',
      general: 'No general notes were provided for this team yet.',
    });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'GEMINI_API_KEY is not configured' });
  }

  const ai = new GoogleGenAI({ apiKey });

  const prompt = `
You are summarizing FIRST Robotics Competition scouting notes for one team at one event.
Create a concise blended summary that averages repeated note patterns and disagreements.

Context:
- Event key: ${eventKey}
- Team number: ${Math.trunc(teamNumber)}

Input notes (already grouped):
- Offense notes: ${JSON.stringify(offenseNotes)}
- Defense notes: ${JSON.stringify(defenseNotes)}
- General notes: ${JSON.stringify(generalNotes)}

Return ONLY valid JSON with this exact schema:
{
  "offense": "string",
  "defense": "string",
  "general": "string"
}

Rules:
1. Always include all three keys: offense, defense, general.
2. Keep each section to 1-3 short sentences.
3. If a section has little/no signal, say that clearly in that section.
4. Do not mention that you are an AI or that data is missing globally.
5. Do not output markdown.
`;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: prompt,
      config: {
        responseMimeType: 'application/json',
      },
    });

    const text = (response.text || '{}').replace(/```json/g, '').replace(/```/g, '').trim();
    const parsed = JSON.parse(text);

    return res.status(200).json({
      offense: typeof parsed?.offense === 'string' && parsed.offense.trim()
        ? parsed.offense.trim()
        : 'No clear offense trend was found in these notes.',
      defense: typeof parsed?.defense === 'string' && parsed.defense.trim()
        ? parsed.defense.trim()
        : 'No clear defense trend was found in these notes.',
      general: typeof parsed?.general === 'string' && parsed.general.trim()
        ? parsed.general.trim()
        : 'No clear general trend was found in these notes.',
    });
  } catch (error) {
    return res.status(500).json({ error: 'Failed to summarize match notes' });
  }
}
