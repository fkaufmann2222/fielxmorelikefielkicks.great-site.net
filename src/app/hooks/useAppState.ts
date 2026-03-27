import { useCallback, useState } from 'react';
import { CompetitionProfile, UserRole } from '../../types';
import { EventTab, FaceIdMode, Location, PendingFaceIdAction, UserAuthType, UserProfile } from '../types';

export function useAppState() {
  const [location, setLocation] = useState<Location>('home');
  const [activeTab, setActiveTab] = useState<EventTab>('pit');
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [profiles, setProfiles] = useState<CompetitionProfile[]>([]);
  const [activeProfile, setActiveProfile] = useState<CompetitionProfile | null>(null);
  const [isCreatingProfile, setIsCreatingProfile] = useState(false);
  const [isLoadingProfiles, setIsLoadingProfiles] = useState(true);
  const [faceIdMode, setFaceIdMode] = useState<FaceIdMode | null>(null);
  const [isFaceIdBusy, setIsFaceIdBusy] = useState(false);
  const [userProfiles, setUserProfiles] = useState<UserProfile[]>([]);
  const [signedInUserProfileId, setSignedInUserProfileId] = useState<string | null>(null);
  const [authMode, setAuthMode] = useState<'login' | 'signup'>('login');
  const [authRole, setAuthRole] = useState<UserRole>('scout');
  const [authName, setAuthName] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [authPin, setAuthPin] = useState('');
  const [authSignupType, setAuthSignupType] = useState<UserAuthType>('password');
  const [authFaceIdName, setAuthFaceIdName] = useState('');
  const [selectedLoginProfileId, setSelectedLoginProfileId] = useState<string>('');
  const [pendingFaceIdAction, setPendingFaceIdAction] = useState<PendingFaceIdAction>(null);

  const resetAuthInputs = useCallback(() => {
    setAuthName('');
    setAuthPassword('');
    setAuthPin('');
    setAuthFaceIdName('');
  }, []);

  return {
    location,
    setLocation,
    activeTab,
    setActiveTab,
    isSettingsOpen,
    setIsSettingsOpen,
    profiles,
    setProfiles,
    activeProfile,
    setActiveProfile,
    isCreatingProfile,
    setIsCreatingProfile,
    isLoadingProfiles,
    setIsLoadingProfiles,
    faceIdMode,
    setFaceIdMode,
    isFaceIdBusy,
    setIsFaceIdBusy,
    userProfiles,
    setUserProfiles,
    signedInUserProfileId,
    setSignedInUserProfileId,
    authMode,
    setAuthMode,
    authRole,
    setAuthRole,
    authName,
    setAuthName,
    authPassword,
    setAuthPassword,
    authPin,
    setAuthPin,
    authSignupType,
    setAuthSignupType,
    authFaceIdName,
    setAuthFaceIdName,
    selectedLoginProfileId,
    setSelectedLoginProfileId,
    pendingFaceIdAction,
    setPendingFaceIdAction,
    resetAuthInputs,
  };
}
