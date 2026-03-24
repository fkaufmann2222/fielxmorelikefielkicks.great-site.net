export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const apiKey = process.env.TBA_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'TBA_API_KEY is not configured' });
  }

  const eventKey = req.query?.eventKey;
  if (!eventKey || Array.isArray(eventKey)) {
    return res.status(400).json({ error: 'eventKey is required' });
  }

  const normalizedEventKey = eventKey.trim().toLowerCase();

  console.log('[api/tba/teams] request', {
    originalEventKey: eventKey,
    normalizedEventKey,
  });

  try {
    const response = await fetch(`https://www.thebluealliance.com/api/v3/event/${normalizedEventKey}/teams/simple`, {
      headers: {
        'X-TBA-Auth-Key': apiKey,
      },
    });

    if (!response.ok) {
      console.error('[api/tba/teams] upstream failed', {
        normalizedEventKey,
        status: response.status,
      });
      return res.status(response.status).json({ error: `TBA request failed with status ${response.status}` });
    }

    const data = await response.json();
    console.log('[api/tba/teams] success', {
      normalizedEventKey,
      teamCount: Array.isArray(data) ? data.length : 0,
    });
    return res.status(200).json(data);
  } catch (error) {
    console.error('[api/tba/teams] exception', {
      normalizedEventKey,
      error: error instanceof Error ? error.message : String(error),
    });
    return res.status(500).json({ error: 'Failed to fetch teams from TBA' });
  }
}
