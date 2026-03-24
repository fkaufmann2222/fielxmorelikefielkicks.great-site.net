import { createClient } from '@supabase/supabase-js';
import { euclideanDistance, normalizeEmbedding } from '../../lib/faceid-server-utils.js';

const DEFAULT_THRESHOLD = 0.27;
const DEFAULT_MIN_MARGIN = 0.06;
const DEFAULT_MIN_CONFIDENCE = 0.85;
const DEFAULT_QUALITY_FLOOR = 0.35;
const DEFAULT_EMBEDDING_MODEL = 'face-api.js@tiny-face-detector-v1';

function toThreshold(value) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return DEFAULT_THRESHOLD;
}

function toFiniteNumber(value, fallback) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return fallback;
}

function toOptionalString(value) {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const embedding = normalizeEmbedding(req.body?.embedding);
  if (!embedding) {
    return res.status(400).json({ error: 'A valid embedding array is required' });
  }

  const threshold = Math.max(0.2, Math.min(0.8, toThreshold(req.body?.threshold)));
  const minMargin = Math.max(0.01, Math.min(0.4, toFiniteNumber(req.body?.minMargin, DEFAULT_MIN_MARGIN)));
  const minConfidence = Math.max(0.5, Math.min(0.99, toFiniteNumber(req.body?.minConfidence, DEFAULT_MIN_CONFIDENCE)));
  const qualityFloor = Math.max(0, Math.min(1, toFiniteNumber(req.body?.qualityFloor, DEFAULT_QUALITY_FLOOR)));

  const embeddingModel = toOptionalString(req.body?.embeddingModel) || DEFAULT_EMBEDDING_MODEL;
  const eventKey = toOptionalString(req.body?.eventKey)?.toLowerCase() || null;
  const profileId = toOptionalString(req.body?.profileId) || null;

  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    return res.status(500).json({ error: 'Supabase server credentials are not configured' });
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });

  let query = supabase
    .from('face_id_enrollments')
    .select('id, person_name, embedding, embedding_model, event_key, profile_id, quality_score')
    .eq('embedding_model', embeddingModel)
    .order('updated_at', { ascending: false })
    .limit(5000);

  if (eventKey) {
    query = query.eq('event_key', eventKey);
  }

  if (profileId) {
    query = query.eq('profile_id', profileId);
  }

  const { data, error } = await query;

  if (error) {
    return res.status(500).json({ error: error.message || 'Failed to verify face' });
  }

  const rows = Array.isArray(data) ? data : [];
  if (rows.length === 0) {
    return res.status(200).json({
      matched: false,
      decision: 'no_match',
      decisionReason: 'no_enrollments',
      name: null,
      enrollmentId: null,
      distance: null,
      secondBestDistance: null,
      margin: null,
      confidence: null,
      checked: 0,
      candidatesChecked: 0,
      threshold,
      minMargin,
      minConfidence,
      qualityFloor,
    });
  }

  let best = {
    enrollmentId: null,
    name: null,
    distance: Number.POSITIVE_INFINITY,
  };
  let secondBestDistance = Number.POSITIVE_INFINITY;
  let candidatesChecked = 0;

  for (const row of rows) {
    const qualityScore = typeof row?.quality_score === 'number' && Number.isFinite(row.quality_score)
      ? row.quality_score
      : null;

    if (qualityScore === null || qualityScore < qualityFloor) {
      continue;
    }

    const candidate = normalizeEmbedding(row?.embedding);
    if (!candidate || candidate.length !== embedding.length) {
      continue;
    }

    candidatesChecked += 1;
    const distance = euclideanDistance(embedding, candidate);
    if (distance < best.distance) {
      secondBestDistance = best.distance;
      best = {
        enrollmentId: typeof row.id === 'string' ? row.id : null,
        name: typeof row.person_name === 'string' ? row.person_name : null,
        distance,
      };
    } else if (distance < secondBestDistance) {
      secondBestDistance = distance;
    }
  }

  const hasBest = Number.isFinite(best.distance);
  const confidence = hasBest && threshold > 0
    ? Math.max(0, Math.min(1, 1 - best.distance / threshold))
    : null;

  const margin = hasBest
    ? (Number.isFinite(secondBestDistance) ? secondBestDistance - best.distance : Number.POSITIVE_INFINITY)
    : null;

  const passesDistance = hasBest && best.distance <= threshold;
  const isSingleCandidate = candidatesChecked === 1;
  const passesMargin = isSingleCandidate || (margin !== null && margin >= minMargin);
  const passesConfidence = isSingleCandidate || (confidence !== null && confidence >= minConfidence);

  const matched = passesDistance && passesMargin && passesConfidence;

  let decision = 'no_match';
  let decisionReason = 'no_viable_candidate';

  if (matched) {
    decision = 'match';
    decisionReason = 'strict_match';
  } else if (passesDistance) {
    decision = 'borderline';
    if (!passesMargin) {
      decisionReason = 'too_close_to_second_best';
    } else if (!passesConfidence) {
      decisionReason = 'low_confidence';
    } else {
      decisionReason = 'policy_failed';
    }
  } else if (hasBest) {
    decisionReason = 'distance_above_threshold';
  } else if (rows.length > 0 && candidatesChecked === 0) {
    decisionReason = 'below_quality_floor_or_invalid_embeddings';
  }

  return res.status(200).json({
    matched,
    decision,
    decisionReason,
    name: matched ? best.name : null,
    enrollmentId: matched ? best.enrollmentId : null,
    distance: Number.isFinite(best.distance) ? Number(best.distance.toFixed(6)) : null,
    secondBestDistance: Number.isFinite(secondBestDistance) ? Number(secondBestDistance.toFixed(6)) : null,
    margin: Number.isFinite(margin) ? Number(margin.toFixed(6)) : null,
    confidence: typeof confidence === 'number' ? Number(confidence.toFixed(6)) : null,
    checked: rows.length,
    candidatesChecked,
    threshold,
    minMargin,
    minConfidence,
    qualityFloor,
  });
}
