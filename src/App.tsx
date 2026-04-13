import React, { useCallback } from 'react';
import { SettingsModal } from './components/SettingsModal';
import { FaceIdCaptureModal } from './components/FaceIdCaptureModal';
import { ToastProvider } from './components/Toast';
import { UserRole } from './types';
import { AuthenticationGate } from './app/components/AuthenticationGate';
import { EventNavigation } from './app/components/EventNavigation';
import { PageContent } from './app/components/PageContent';
import { createFaceIdUserProfile, createPasswordUserProfile, loadUserProfile, signOutUserProfile } from './app/auth/actions';
import { completeFaceIdAction } from './app/auth/faceIdActions';
import { clearStoredActiveUserProfileId, getStoredUserProfiles } from './app/auth/profileStorage';
import { loginSubmit, signupSubmit } from './app/handlers/authSubmitHandlers';
import { banScout, unbanScout } from './app/handlers/moderationHandlers';
import { createCompetitionProfile, selectProfile } from './app/handlers/profileHandlers';
import { useAppState } from './app/hooks/useAppState';
import { useInitialAppLoad } from './app/hooks/useInitialAppLoad';
import { useLoginProfileSelection } from './app/hooks/useLoginProfileSelection';
import { useRouteGuards } from './app/hooks/useRouteGuards';
import { useUserProfilePolling } from './app/hooks/useUserProfilePolling';
import { PrescoutingQuickScoutTarget, setPendingPrescoutingQuickScout } from './prescouting/quickScout';
import {
  FaceIdMode,
} from './app/types';

export default function App() {
  const {
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
  } = useAppState();

  useInitialAppLoad({
    setProfiles,
    setActiveProfile,
    setUserProfiles,
    setSignedInUserProfileId,
    setIsLoadingProfiles,
  });

  const refreshUserProfiles = useCallback(async () => {
    try {
      const loaded = await getStoredUserProfiles();
      setUserProfiles(loaded);
      if (signedInUserProfileId) {
        const active = loaded.find((profile) => profile.id === signedInUserProfileId);
        if (!active || active.bannedAt) {
          setSignedInUserProfileId(null);
          await clearStoredActiveUserProfileId();
        }
      }
    } catch (error) {
      console.error('Failed to refresh admin user profiles:', error);
      setSignedInUserProfileId(null);
    }
  }, [setSignedInUserProfileId, setUserProfiles, signedInUserProfileId]);

  const signedInUserProfile = userProfiles.find((profile) => profile.id === signedInUserProfileId) || null;
  const isAdminSignedIn = signedInUserProfile?.role === 'admin';
  const isScoutSignedIn = signedInUserProfile?.role === 'scout';
  const loginProfiles = userProfiles.filter((profile) => {
    if (profile.role !== authRole) {
      return false;
    }
    if (profile.role === 'scout' && profile.bannedAt) {
      return false;
    }
    return true;
  });

  useLoginProfileSelection({
    authMode,
    loginProfiles,
    selectedLoginProfileId,
    setSelectedLoginProfileId,
  });

  useRouteGuards({
    activeProfile,
    location,
    setLocation,
    signedInUserProfile,
    isScoutSignedIn,
    activeTab,
    setActiveTab,
  });

  useUserProfilePolling({
    signedInUserProfileId,
    refreshUserProfiles,
  });

  const handleSignOutUserProfile = async () => {
    await signOutUserProfile({
      setSignedInUserProfileId,
      resetAuthInputs,
      setAuthMode,
    });
  };

  const handleCreatePasswordUserProfile = async (params: {
    role: UserRole;
    pin?: string;
    name: string;
    password: string;
  }) => {
    await createPasswordUserProfile({
      ...params,
      isFaceIdBusy,
      userProfiles,
      setUserProfiles,
      setSignedInUserProfileId,
      resetAuthInputs,
    });
  };

  const handleCreateFaceIdUserProfile = async (params: {
    role: UserRole;
    pin?: string;
    name: string;
    faceIdName: string;
  }) => {
    await createFaceIdUserProfile({
      ...params,
      isFaceIdBusy,
      userProfiles,
      setPendingFaceIdAction,
      setIsSettingsOpen,
      setFaceIdMode,
    });
  };

  const handleLoadUserProfile = async (params: { profileId: string; password?: string }) => {
    await loadUserProfile({
      ...params,
      authRole,
      isFaceIdBusy,
      userProfiles,
      setSignedInUserProfileId,
      setPendingFaceIdAction,
      setIsSettingsOpen,
      setFaceIdMode,
      resetAuthInputs,
    });
  };

  const handleSelectProfile = (profileId: string) => {
    selectProfile({
      profileId,
      isAdminSignedIn,
      setProfiles,
      setActiveProfile,
      setLocation,
      setActiveTab,
    });
  };

  const handleGoHome = () => {
    setLocation('home');
  };

  const handleOpenPrescouting = () => {
    setLocation('prescouting');
    setActiveTab('prescouting-match');
  };

  const handlePrescoutingQuickScout = useCallback((target: PrescoutingQuickScoutTarget) => {
    setPendingPrescoutingQuickScout(target);
    setLocation('prescouting');
    setActiveTab('prescouting-match');
  }, [setActiveTab, setLocation]);

  const handleCreateProfile = async () => {
    await createCompetitionProfile({
      isAdminSignedIn,
      setProfiles,
      setActiveProfile,
      setIsCreatingProfile,
      setLocation,
      setActiveTab,
    });
  };

  const handleBanScout = async (scoutProfileId: string) => {
    await banScout({
      scoutProfileId,
      isAdminSignedIn,
      signedInUserProfile,
      refreshUserProfiles,
    });
  };

  const handleUnbanScout = async (scoutProfileId: string) => {
    await unbanScout({
      scoutProfileId,
      isAdminSignedIn,
      refreshUserProfiles,
    });
  };

  const selectedLoginProfile = loginProfiles.find((profile) => profile.id === selectedLoginProfileId) || null;

  const handleLoginSubmit = async () => {
    await loginSubmit({
      selectedLoginProfileId,
      selectedLoginProfile,
      authPassword,
      onLoadUserProfile: handleLoadUserProfile,
    });
  };

  const handleSignupSubmit = async () => {
    await signupSubmit({
      authRole,
      authSignupType,
      authPin,
      authName,
      authFaceIdName,
      authPassword,
      onCreateFaceIdUserProfile: handleCreateFaceIdUserProfile,
      onCreatePasswordUserProfile: handleCreatePasswordUserProfile,
    });
  };

  const handleFaceIdComplete = async (payload: {
    mode: FaceIdMode;
    personName: string;
    embedding: number[];
    acceptedFrames: number;
    qualityScore: number;
    snapshots: Blob[];
  }) => {
    await completeFaceIdAction({
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
    });
  };

  return (
    <div className="min-h-screen bg-slate-900 text-slate-200 font-sans selection:bg-blue-500/30">
      {!signedInUserProfile && !isLoadingProfiles ? (
        <AuthenticationGate
          authMode={authMode}
          setAuthMode={setAuthMode}
          authRole={authRole}
          setAuthRole={setAuthRole}
          authName={authName}
          setAuthName={setAuthName}
          authPassword={authPassword}
          setAuthPassword={setAuthPassword}
          authPin={authPin}
          setAuthPin={setAuthPin}
          authSignupType={authSignupType}
          setAuthSignupType={setAuthSignupType}
          authFaceIdName={authFaceIdName}
          setAuthFaceIdName={setAuthFaceIdName}
          selectedLoginProfileId={selectedLoginProfileId}
          setSelectedLoginProfileId={setSelectedLoginProfileId}
          loginProfiles={loginProfiles}
          selectedLoginProfile={selectedLoginProfile}
          isFaceIdBusy={isFaceIdBusy}
          onLoginSubmit={handleLoginSubmit}
          onSignupSubmit={handleSignupSubmit}
        />
      ) : (
        <>
          <EventNavigation
            location={location}
            activeProfile={activeProfile}
            activeTab={activeTab}
            isAdminSignedIn={isAdminSignedIn}
            signedInUserProfile={signedInUserProfile}
            onSetActiveTab={setActiveTab}
            onSignOut={() => {
              void handleSignOutUserProfile();
            }}
            onOpenSettings={() => setIsSettingsOpen(true)}
            onGoHome={handleGoHome}
          />

          <main className="p-4 sm:p-6 lg:p-8">
            <PageContent
              isLoadingProfiles={isLoadingProfiles}
              signedInUserProfile={signedInUserProfile}
              location={location}
              isAdminSignedIn={isAdminSignedIn}
              isScoutSignedIn={isScoutSignedIn}
              activeTab={activeTab}
              profiles={profiles}
              activeProfile={activeProfile}
              isCreatingProfile={isCreatingProfile}
              userProfiles={userProfiles}
              onCreateProfile={handleCreateProfile}
              onSelectProfile={handleSelectProfile}
              onBanScout={handleBanScout}
              onUnbanScout={handleUnbanScout}
              onOpenPrescouting={handleOpenPrescouting}
              onPrescoutingQuickScout={handlePrescoutingQuickScout}
            />
          </main>

          <SettingsModal
            isOpen={isSettingsOpen}
            onClose={() => setIsSettingsOpen(false)}
            activeProfile={activeProfile}
            onBackToEvents={handleGoHome}
            onSignOutUserProfile={() => {
              void handleSignOutUserProfile();
            }}
            signedInUserProfile={
              signedInUserProfile
                ? { name: signedInUserProfile.name, authType: signedInUserProfile.authType }
                : null
            }
            isProfileActionBusy={isFaceIdBusy}
          />
        </>
      )}

      {faceIdMode && (
        <FaceIdCaptureModal
          isOpen={Boolean(faceIdMode)}
          mode={faceIdMode}
          onClose={() => setFaceIdMode(null)}
          onComplete={handleFaceIdComplete}
        />
      )}
      <ToastProvider />
    </div>
  );
}
