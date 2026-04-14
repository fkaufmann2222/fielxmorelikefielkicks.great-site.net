import React from 'react';
import { Home } from '../../tabs/Home';
import { PitScouting } from '../../tabs/PitScouting';
import { AllianceStrategy } from '../../tabs/AllianceStrategy';
import { AllianceSelection } from '../../tabs/AllianceSelection';
import { RawData } from '../../tabs/RawData';
import { EventMatchScouting } from '../../tabs/EventMatchScouting';
import { AdminMatchCleanup } from '../../tabs/AdminMatchCleanup';
import { MatchScoutingCoverage } from '../../tabs/MatchScoutingCoverage.tsx';
import { PrescoutingCoverage } from '../../tabs/PrescoutingCoverage.tsx';
import { PrescoutingMatchScouting } from '../../tabs/PrescoutingMatchScouting.tsx';
import { AdminGlobalMatchData } from '../../tabs/AdminGlobalMatchData.tsx';
import { PrescoutingQuickScoutTarget } from '../../prescouting/quickScout';
import { CompetitionProfile } from '../../types';
import { EventTab, Location, UserProfile } from '../types';

type PageContentProps = {
  isLoadingProfiles: boolean;
  signedInUserProfile: UserProfile | null;
  location: Location;
  isAdminSignedIn: boolean;
  canAccessGlobalMatchData: boolean;
  isScoutSignedIn: boolean;
  activeTab: EventTab;
  profiles: CompetitionProfile[];
  activeProfile: CompetitionProfile | null;
  isCreatingProfile: boolean;
  userProfiles: UserProfile[];
  onCreateProfile: () => Promise<void>;
  onSelectProfile: (profileId: string) => void;
  onBanScout: (scoutProfileId: string) => Promise<void>;
  onUnbanScout: (scoutProfileId: string) => Promise<void>;
  onOpenPrescouting: () => void;
  onOpenGlobalMatchData: () => void;
  onPrescoutingQuickScout: (target: PrescoutingQuickScoutTarget) => void;
};

function MatchFallback(props: {
  activeProfile: CompetitionProfile | null;
  isAdminSignedIn: boolean;
  signedInUserProfile: UserProfile | null;
  isScoutSignedIn: boolean;
}) {
  const { activeProfile, isAdminSignedIn, signedInUserProfile, isScoutSignedIn } = props;
  return (
    <EventMatchScouting
      activeProfile={activeProfile}
      isAdminScout={isAdminSignedIn}
      adminProfileId={signedInUserProfile?.id || null}
      scoutProfileId={isScoutSignedIn ? signedInUserProfile?.id || null : null}
    />
  );
}

export function PageContent(props: PageContentProps) {
  const {
    isLoadingProfiles,
    signedInUserProfile,
    location,
    isAdminSignedIn,
    canAccessGlobalMatchData,
    isScoutSignedIn,
    activeTab,
    profiles,
    activeProfile,
    isCreatingProfile,
    userProfiles,
    onCreateProfile,
    onSelectProfile,
    onBanScout,
    onUnbanScout,
    onOpenPrescouting,
    onOpenGlobalMatchData,
    onPrescoutingQuickScout,
  } = props;

  if (isLoadingProfiles) {
    return (
      <div className="max-w-5xl mx-auto rounded-2xl border border-slate-700 bg-slate-800/40 p-8 text-slate-300">
        Loading competition profiles...
      </div>
    );
  }

  if (!signedInUserProfile) {
    return null;
  }

  if (location === 'home') {
    if (!isAdminSignedIn) {
      return (
        <div className="max-w-4xl mx-auto rounded-2xl border border-slate-700 bg-slate-800/40 p-8 text-slate-300 space-y-4">
          <p>Waiting for an admin to select the active event profile. Scouts cannot change the global event.</p>
          <button
            onClick={onOpenPrescouting}
            className="inline-flex items-center justify-center gap-2 px-5 py-3 rounded-2xl bg-blue-600 hover:bg-blue-500 text-white font-semibold shadow-lg shadow-blue-500/20"
          >
            Open Prescouting
          </button>
        </div>
      );
    }

    return (
      <Home
        profiles={profiles}
        activeProfile={activeProfile}
        isCreatingProfile={isCreatingProfile}
        onCreateProfile={onCreateProfile}
        onSelectProfile={onSelectProfile}
        onOpenPrescouting={onOpenPrescouting}
        canAccessGlobalMatchData={canAccessGlobalMatchData}
        onOpenGlobalMatchData={onOpenGlobalMatchData}
      />
    );
  }

  if (location === 'global-match-data') {
    if (!isAdminSignedIn || !canAccessGlobalMatchData) {
      return (
        <div className="max-w-4xl mx-auto rounded-2xl border border-slate-700 bg-slate-800/40 p-8 text-slate-300 space-y-4">
          <p>This account is not allowed to view global match data.</p>
        </div>
      );
    }

    return <AdminGlobalMatchData />;
  }

  if (location === 'prescouting') {
    if (activeTab === 'prescouting-coverage') {
      return (
        <PrescoutingCoverage
          isAdminSignedIn={isAdminSignedIn}
          signedInUserProfile={signedInUserProfile}
          onQuickScout={onPrescoutingQuickScout}
        />
      );
    }

    return (
      <PrescoutingMatchScouting
        isAdminScout={isAdminSignedIn}
        adminProfileId={signedInUserProfile?.id || null}
        scoutProfileId={isScoutSignedIn ? signedInUserProfile?.id || null : null}
      />
    );
  }

  switch (activeTab) {
    case 'pit':
      return isAdminSignedIn ? (
        <PitScouting activeProfile={activeProfile} />
      ) : (
        <MatchFallback
          activeProfile={activeProfile}
          isAdminSignedIn={isAdminSignedIn}
          signedInUserProfile={signedInUserProfile}
          isScoutSignedIn={isScoutSignedIn}
        />
      );
    case 'match':
      return (
        <MatchFallback
          activeProfile={activeProfile}
          isAdminSignedIn={isAdminSignedIn}
          signedInUserProfile={signedInUserProfile}
          isScoutSignedIn={isScoutSignedIn}
        />
      );
    case 'strategy':
      return <AllianceStrategy eventKey={activeProfile?.eventKey || ''} profileId={activeProfile?.id || null} />;
    case 'alliance':
      return <AllianceSelection eventKey={activeProfile?.eventKey || ''} profileId={activeProfile?.id || null} />;
    case 'raw':
      return (
        <RawData
          eventKey={activeProfile?.eventKey || ''}
          profileId={activeProfile?.id || null}
          scope="global"
          scoutProfiles={userProfiles.map((profile) => ({ id: profile.id, name: profile.name }))}
        />
      );
    case 'admin':
      return isAdminSignedIn ? (
        <AdminMatchCleanup
          eventKey={activeProfile?.eventKey || ''}
          scoutProfiles={userProfiles.filter((profile) => profile.role === 'scout')}
          onBanScout={onBanScout}
          onUnbanScout={onUnbanScout}
        />
      ) : (
        <MatchFallback
          activeProfile={activeProfile}
          isAdminSignedIn={isAdminSignedIn}
          signedInUserProfile={signedInUserProfile}
          isScoutSignedIn={isScoutSignedIn}
        />
      );
    case 'coverage':
      return isAdminSignedIn ? (
        <MatchScoutingCoverage eventKey={activeProfile?.eventKey || ''} />
      ) : (
        <MatchFallback
          activeProfile={activeProfile}
          isAdminSignedIn={isAdminSignedIn}
          signedInUserProfile={signedInUserProfile}
          isScoutSignedIn={isScoutSignedIn}
        />
      );
    default:
      return isAdminSignedIn ? (
        <PitScouting activeProfile={activeProfile} />
      ) : (
        <MatchFallback
          activeProfile={activeProfile}
          isAdminSignedIn={isAdminSignedIn}
          signedInUserProfile={signedInUserProfile}
          isScoutSignedIn={isScoutSignedIn}
        />
      );
  }
}
