export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const pathParam = req.query?.path;
  const segments = Array.isArray(pathParam) ? pathParam : [pathParam].filter(Boolean);

  if (segments.length === 0) {
    return res.status(400).json({ error: 'Statbotics endpoint path is required' });
  }

  const query = new URLSearchParams();
  Object.entries(req.query || {}).forEach(([key, value]) => {
    if (key === 'path') {
      return;
    }

    if (Array.isArray(value)) {
      value.forEach((item) => query.append(key, String(item)));
      return;
    }

    if (value !== undefined) {
      query.append(key, String(value));
    }
  });

  const endpoint = segments.map((segment) => encodeURIComponent(String(segment))).join('/');
  const queryString = query.toString();
  const targetUrl = `https://api.statbotics.io/v3/${endpoint}${queryString ? `?${queryString}` : ''}`;

  try {
    const response = await fetch(targetUrl);
    const rawBody = await response.text();

    if (!response.ok) {
      return res.status(response.status).json({
        error: `Statbotics request failed with status ${response.status}`,
        endpoint,
      });
    }

    try {
      const parsed = JSON.parse(rawBody);
      return res.status(200).json(parsed);
    } catch {
      return res.status(200).send(rawBody);
    }
  } catch (error) {
    return res.status(500).json({
      error: 'Failed to fetch data from Statbotics',
      details: error instanceof Error ? error.message : String(error),
    });
  }
}
