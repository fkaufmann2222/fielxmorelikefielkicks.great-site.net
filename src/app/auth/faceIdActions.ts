import React from 'react';
import { showToast } from '../../components/Toast';
import { faceid } from '../../lib/faceid';
import { uploadFaceIdSnapshot } from '../../lib/supabase';
import { CompetitionProfile } from '../../types';
import { STRICT_FACE_ID_POLICY } from '../constants';
import { generateUserProfileId, saveStoredUserProfiles, setStoredActiveUserProfileId } from './profileStorage';
import { FaceIdMode, PendingFaceIdAction, UserProfile } from '../types';

type FaceIdPayload = {
  mode: FaceIdMode;
  personName: string;
  embedding: number[];
  acceptedFrames: number;
  qualityScore: number;
  snapshots: Blob[];
};

export async function completeFaceIdAction(params: {
  payload: FaceIdPayload;
  pendingFaceIdAction: PendingFaceIdAction;
  activeProfile: CompetitionProfile | null;
  userProfiles: UserProfile[];
  setUserProfiles: React.Dispatch<React.SetStateAction<UserProfile[]>>;
  setSignedInUserProfileId: React.Dispatch<React.SetStateAction<string | null>>;
  setIsFaceIdBusy: React.Dispatch<React.SetStateAction<boolean>>;
  setPendingFaceIdAction: React.Dispatch<React.SetStateAction<PendingFaceIdAction>>;
  setFaceIdMode: React.Dispatch<React.SetStateAction<FaceIdMode | null>>;
  refreshUserProfiles: () => Promise<void>;
}): Promise<void> {
  const {
    payload,
    pendingFaceIdAction,
    activeProfile,
    userProfiles,
    setUserProfiles,
    setSignedInUserProfileId,
    setIsFaceIdBusy,
    setPendingFaceIdAction,
    setFaceIdMode,
    refreshUserProfiles,
  } = params;

  setIsFaceIdBusy(true);
  try {
    if (payload.mode === 'train') {
      const personName = (pendingFaceIdAction?.type === 'create-faceid' ? pendingFaceIdAction.name : payload.personName).trim();
      if (!personName) {
        showToast('Name is required for Face ID training');
        return;
      }

      const scopeKey = activeProfile?.eventKey || 'global';
      const snapshotBlobs = payload.snapshots.slice(0, 5);
      const uploadTasks = snapshotBlobs.map((blob, index) => {
        const file = new File([blob], `faceid-${Date.now()}-${index + 1}.jpg`, { type: 'image/jpeg' });
        return uploadFaceIdSnapshot(scopeKey, personName, file);
      });

      const uploads = await Promise.all(uploadTasks);
      const photoUrls = uploads.map((entry) => entry.publicUrl);

      const enrollment = await faceid.train({
        personName,
        embedding: payload.embedding,
        photoUrls,
        embeddingModel: 'face-api.js@tiny-face-detector-v1',
        acceptedFrames: payload.acceptedFrames,
        qualityScore: payload.qualityScore,
        eventKey: activeProfile?.eventKey || null,
        profileId: activeProfile?.id || null,
      });

      if (pendingFaceIdAction?.type === 'create-faceid') {
        const nextProfile: UserProfile = {
          id: generateUserProfileId(),
          name: pendingFaceIdAction.name,
          role: pendingFaceIdAction.role,
          authType: 'faceid',
          faceIdName: pendingFaceIdAction.faceIdName,
          bannedAt: null,
          bannedReason: null,
          bannedByProfileId: null,
          createdAt: Date.now(),
        };
        const nextProfiles = [...userProfiles, nextProfile];
        await saveStoredUserProfiles(nextProfiles);
        await setStoredActiveUserProfileId(nextProfile.id);
        setUserProfiles(nextProfiles);
        setSignedInUserProfileId(nextProfile.id);
        showToast(`Created and signed into ${nextProfile.name}`);
      } else {
        showToast(`Face ID trained for ${enrollment.personName}`);
      }
    } else {
      const result = await faceid.verify({
        embedding: payload.embedding,
        threshold: STRICT_FACE_ID_POLICY.threshold,
        minMargin: STRICT_FACE_ID_POLICY.minMargin,
        minConfidence: STRICT_FACE_ID_POLICY.minConfidence,
        qualityFloor: STRICT_FACE_ID_POLICY.qualityFloor,
        embeddingModel: STRICT_FACE_ID_POLICY.embeddingModel,
        eventKey: activeProfile?.eventKey || null,
        profileId: activeProfile?.id || null,
      });

      if (pendingFaceIdAction?.type === 'create-faceid') {
        const expectedName = pendingFaceIdAction.faceIdName.toLowerCase();
        const matchedName = (result.name || '').toLowerCase();
        if (result.matched && matchedName === expectedName) {
          const nextProfile: UserProfile = {
            id: generateUserProfileId(),
            name: pendingFaceIdAction.name,
            role: pendingFaceIdAction.role,
            authType: 'faceid',
            faceIdName: pendingFaceIdAction.faceIdName,
            bannedAt: null,
            bannedReason: null,
            bannedByProfileId: null,
            createdAt: Date.now(),
          };
          const nextProfiles = [...userProfiles, nextProfile];
          await saveStoredUserProfiles(nextProfiles);
          await setStoredActiveUserProfileId(nextProfile.id);
          setUserProfiles(nextProfiles);
          setSignedInUserProfileId(nextProfile.id);
          showToast(`Created and signed into ${nextProfile.name}`);
        } else {
          showToast('Face ID did not match the profile name');
        }
      } else if (pendingFaceIdAction?.type === 'load-faceid') {
        const expectedName = pendingFaceIdAction.faceIdName.toLowerCase();
        const matchedName = (result.name || '').toLowerCase();
        if (result.matched && matchedName === expectedName) {
          await setStoredActiveUserProfileId(pendingFaceIdAction.profileId);
          setSignedInUserProfileId(pendingFaceIdAction.profileId);
          showToast(`Signed into ${pendingFaceIdAction.profileName}`);
        } else {
          showToast('Face ID did not match selected profile');
        }
      } else if (result.matched && result.name) {
        showToast(`High-confidence match: ${result.name}`);
      } else if (result.decision === 'borderline') {
        if (result.decisionReason === 'too_close_to_second_best') {
          showToast('Borderline match. Too close to another enrolled face. Run test again with better lighting.');
        } else {
          showToast('Borderline match. Run test again to confirm identity.');
        }
      } else {
        showToast('No strict Face ID match found');
      }
    }
  } finally {
    setIsFaceIdBusy(false);
    setPendingFaceIdAction(null);
    setFaceIdMode(null);
    await refreshUserProfiles();
  }
}
