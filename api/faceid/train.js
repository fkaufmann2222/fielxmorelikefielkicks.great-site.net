import { createClient } from '@supabase/supabase-js';
import { euclideanDistance, normalizeEmbedding, normalizePhotoUrls } from '../../lib/faceid-server-utils.js';

const DEFAULT_EMBEDDING_MODEL = 'face-api.js@tiny-face-detector-v1';
const MIN_QUALITY_SCORE = 0.45;
const DEDUP_DISTANCE_THRESHOLD = 0.05;

function createEnrollmentId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }

  return `face-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const personName = typeof req.body?.personName === 'string' ? req.body.personName.trim() : '';
  if (!personName) {
    return res.status(400).json({ error: 'personName is required' });
  }

  const embedding = normalizeEmbedding(req.body?.embedding);
  if (!embedding) {
    return res.status(400).json({ error: 'A valid embedding array is required' });
  }

  const photoUrls = normalizePhotoUrls(req.body?.photoUrls);
  const embeddingModel = typeof req.body?.embeddingModel === 'string' && req.body.embeddingModel.trim() !== ''
    ? req.body.embeddingModel.trim()
    : DEFAULT_EMBEDDING_MODEL;

  const eventKey = typeof req.body?.eventKey === 'string' && req.body.eventKey.trim() !== ''
    ? req.body.eventKey.trim().toLowerCase()
    : null;

  const profileId = typeof req.body?.profileId === 'string' && req.body.profileId.trim() !== ''
    ? req.body.profileId.trim()
    : null;

  const qualityScore = typeof req.body?.qualityScore === 'number' && Number.isFinite(req.body.qualityScore)
    ? Math.max(0, Math.min(1, req.body.qualityScore))
    : null;

  if (qualityScore === null || qualityScore < MIN_QUALITY_SCORE) {
    return res.status(400).json({
      error: `Enrollment quality too low. Score must be at least ${MIN_QUALITY_SCORE.toFixed(2)}.`,
    });
  }

  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    return res.status(500).json({ error: 'Supabase server credentials are not configured' });
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });

  const row = {
    id: createEnrollmentId(),
    person_name: personName,
    event_key: eventKey,
    profile_id: profileId,
    embedding,
    embedding_model: embeddingModel,
    quality_score: qualityScore,
    photo_urls: photoUrls,
    metadata: {
      acceptedFrames: typeof req.body?.acceptedFrames === 'number' ? req.body.acceptedFrames : null,
    },
  };

  let dedupeQuery = supabase
    .from('face_id_enrollments')
    .select('id, embedding, quality_score')
    .eq('person_name', personName)
    .eq('embedding_model', embeddingModel)
    .order('updated_at', { ascending: false })
    .limit(20);

  if (eventKey) {
    dedupeQuery = dedupeQuery.eq('event_key', eventKey);
  }

  if (profileId) {
    dedupeQuery = dedupeQuery.eq('profile_id', profileId);
  }

  const { data: recentRows, error: dedupeError } = await dedupeQuery;
  if (dedupeError) {
    return res.status(500).json({ error: dedupeError.message || 'Failed to evaluate duplicate enrollments' });
  }

  let closestDuplicate = null;
  for (const candidate of Array.isArray(recentRows) ? recentRows : []) {
    const candidateEmbedding = normalizeEmbedding(candidate?.embedding);
    if (!candidateEmbedding || candidateEmbedding.length !== embedding.length) {
      continue;
    }

    const distance = euclideanDistance(embedding, candidateEmbedding);
    if (!Number.isFinite(distance) || distance > DEDUP_DISTANCE_THRESHOLD) {
      continue;
    }

    if (!closestDuplicate || distance < closestDuplicate.distance) {
      const candidateQuality = typeof candidate?.quality_score === 'number' && Number.isFinite(candidate.quality_score)
        ? candidate.quality_score
        : 0;

      closestDuplicate = {
        id: typeof candidate?.id === 'string' ? candidate.id : null,
        distance,
        quality: candidateQuality,
      };
    }
  }

  if (closestDuplicate?.id) {
    if (closestDuplicate.quality >= qualityScore) {
      return res.status(200).json({
        id: closestDuplicate.id,
        personName: row.person_name,
        photoCount: photoUrls.length,
        embeddingModel: row.embedding_model,
        action: 'skipped_duplicate_lower_quality',
      });
    }

    const { error: updateError } = await supabase
      .from('face_id_enrollments')
      .update({
        embedding: row.embedding,
        quality_score: row.quality_score,
        photo_urls: row.photo_urls,
        metadata: row.metadata,
      })
      .eq('id', closestDuplicate.id);

    if (updateError) {
      return res.status(500).json({ error: updateError.message || 'Failed to refresh duplicate enrollment' });
    }

    return res.status(200).json({
      id: closestDuplicate.id,
      personName: row.person_name,
      photoCount: photoUrls.length,
      embeddingModel: row.embedding_model,
      action: 'upserted_duplicate',
    });
  }

  const { error } = await supabase.from('face_id_enrollments').insert(row);
  if (error) {
    return res.status(500).json({ error: error.message || 'Failed to save face enrollment' });
  }

  return res.status(200).json({
    id: row.id,
    personName: row.person_name,
    photoCount: photoUrls.length,
    embeddingModel: row.embedding_model,
    action: 'created_new',
  });
}
