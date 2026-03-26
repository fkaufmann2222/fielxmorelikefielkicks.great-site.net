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
  const scope = req.body?.scope === 'global' ? 'global' : 'event';
  const contextLabel = typeof req.body?.contextLabel === 'string' ? req.body.contextLabel.trim() : '';
  const teamNumber = Number(req.body?.teamNumber);

  const autonNotes = toStringArray(req.body?.autonNotes);
  const defenseNotes = toStringArray(req.body?.defenseNotes);
  const generalNotes = toStringArray(req.body?.generalNotes);

  if (!eventKey || !Number.isFinite(teamNumber)) {
    return res.status(400).json({ error: 'eventKey and teamNumber are required' });
  }

  const resolvedContextLabel = contextLabel || (scope === 'global' ? 'all competitions' : eventKey);
  const contextScopeDescription = scope === 'global'
    ? 'across multiple competitions in the same season'
    : 'at one competition event';

  if (autonNotes.length === 0 && defenseNotes.length === 0 && generalNotes.length === 0) {
    return res.status(200).json({
      autonStrategy: 'No autonomous strategy notes were provided for this team yet.',
      defenseStrategy: 'No defense strategy notes were provided for this team yet.',
      overallSummary: 'No additional match notes were provided for this team yet.',
    });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'GEMINI_API_KEY is not configured' });
  }

  const ai = new GoogleGenAI({ apiKey });

  const prompt = `
You are summarizing FIRST Robotics Competition scouting notes for one team ${contextScopeDescription}.
Extract cumulative strategy insights with clear structure.

Context:
- Scope: ${scope}
- Context label: ${resolvedContextLabel}
- Event key marker: ${eventKey}
- Team number: ${Math.trunc(teamNumber)}

Input notes (already grouped):
- Auton notes: ${JSON.stringify(autonNotes)}
- Defense notes: ${JSON.stringify(defenseNotes)}
- General notes: ${JSON.stringify(generalNotes)}

Return ONLY valid JSON with this exact schema:
{
  "autonStrategy": "string",
  "defenseStrategy": "string",
  "overallSummary": "string"
}

Rules:
1. Always include all three keys: autonStrategy, defenseStrategy, overallSummary.
2. For autonStrategy and defenseStrategy:
   - If multiple distinct strategies appear, output a numbered list in plain text:
     "1) <strategy> (confidence: high|medium|low)\n2) <strategy> (confidence: high|medium|low)"
   - If only one strategy appears, write exactly one numbered line in that same format.
   - Keep each strategy line concise and specific.
3. For overallSummary, provide 1-3 short sentences describing important cross-match context.
4. If a section has little/no signal, explicitly say that in that section.
5. Do not mention that you are an AI.
6. Do not output markdown.
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
      autonStrategy: typeof parsed?.autonStrategy === 'string' && parsed.autonStrategy.trim()
        ? parsed.autonStrategy.trim()
        : '1) No clear autonomous strategy trend was found in these notes. (confidence: low)',
      defenseStrategy: typeof parsed?.defenseStrategy === 'string' && parsed.defenseStrategy.trim()
        ? parsed.defenseStrategy.trim()
        : '1) No clear defense strategy trend was found in these notes. (confidence: low)',
      overallSummary: typeof parsed?.overallSummary === 'string' && parsed.overallSummary.trim()
        ? parsed.overallSummary.trim()
        : 'No clear cross-match context was found in these notes.',
    });
  } catch (error) {
    return res.status(500).json({ error: 'Failed to summarize match notes' });
  }
}
