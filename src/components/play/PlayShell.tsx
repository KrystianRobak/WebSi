import React from 'react';
import { Compass } from 'lucide-react';
import { useVaultStore } from '../../store/useVaultStore';
import { BattlemapViewport2D } from '../battlemap/BattlemapViewport2D';
import { PlayerJournalsPane } from '../journals/PlayerJournalsPane';
import { MapViewport3D } from '../map/MapViewport3D';
import { CommandPalette } from '../modals/CommandPalette';
import { SettingsModal } from '../modals/SettingsModal';
import { ProfileCampaignHub } from '../profile/ProfileCampaignHub';
import { GuildQuestBoardModal } from '../quests/GuildQuestBoardModal';
import { CharacterManagerPane } from '../sheets/CharacterManagerPane';
import { CampaignTimelinePane } from '../timeline/CampaignTimelinePane';
import { DiceRollerDrawer } from '../vtt/DiceRollerDrawer';
import { CampaignCompendiumDrawer } from './CampaignCompendiumDrawer';
import { PlayHeader } from './PlayHeader';
import { PlayNavDock } from './PlayNavDock';
import { PlayQuestsBoardView } from './PlayQuestsBoardView';
import { PlaySideDrawer } from './PlaySideDrawer';

export const PlayShell: React.FC = () => {
  const {
    campaigns,
    activeCampaignId,
    maps,
    playActiveSection,
    playActiveMapId,
    playFocusedCharacterId,
    playFocusedJournalId,
    setPlayActiveSection,
  } = useVaultStore();

  const hasCampaign = campaigns.length > 0 && Boolean(activeCampaignId);
  const activeMap =
    maps.find((m) => m.id === playActiveMapId) ||
    maps.find((m) => m.kind === '2d') ||
    maps[0] ||
    null;

  const renderPlayMain = () => {
    if (!hasCampaign || playActiveSection === 'hub') {
      return <ProfileCampaignHub />;
    }
    if (playActiveSection === 'party') {
      return <CharacterManagerPane initialCharacterId={playFocusedCharacterId || undefined} />;
    }
    if (playActiveSection === 'journals') {
      return <PlayerJournalsPane initialPageId={playFocusedJournalId || undefined} />;
    }
    if (playActiveSection === 'quests') {
      return <PlayQuestsBoardView />;
    }
    if (playActiveSection === 'timeline') {
      return <CampaignTimelinePane surface="play" />;
    }

    // 'table' section
    if (!activeMap) {
      return (
        <div className="h-full w-full flex items-center justify-center bg-[#06080c] p-6">
          <div className="max-w-md text-center space-y-3 rounded-xl bg-[#0b0f17] border border-[#1b2332] p-6">
            <Compass className="w-8 h-8 text-[#d4a853] mx-auto" />
            <h2 className="font-serif text-lg font-semibold text-[#f3ead8]">
              No Active Map Ready Yet
            </h2>
            <p className="text-xs text-[#8d96a6] leading-relaxed">
              Your Game Master has not published a 3D World Map or 2D Battlemap in this campaign yet. You can manage your character sheet or expedition journals in the meantime.
            </p>
            <div className="flex items-center justify-center gap-2 pt-1">
              <button
                type="button"
                onClick={() => setPlayActiveSection('party')}
                className="px-3 py-1.5 rounded-lg btn-gold-metallic text-xs font-semibold"
              >
                Open Character Sheet
              </button>
              <button
                type="button"
                onClick={() => setPlayActiveSection('journals')}
                className="px-3 py-1.5 rounded-lg bg-[#131924] border border-[#242e40] text-xs text-[#ded8cc]"
              >
                Open Journals
              </button>
            </div>
          </div>
        </div>
      );
    }

    if (activeMap.kind === '2d') {
      return <BattlemapViewport2D mapId={activeMap.id} surface="play" />;
    }
    return <MapViewport3D mapId={activeMap.id} surface="play" />;
  };

  return (
    <div className="w-screen h-screen bg-[#05070b] text-[#e8e2d5] flex flex-col overflow-hidden">
      <PlayHeader />

      <div className="flex-1 min-h-0 flex relative overflow-hidden">
        <PlayNavDock />

        <main className="flex-1 min-w-0 h-full relative overflow-hidden">
          {renderPlayMain()}
        </main>

        {playActiveSection === 'table' && <PlaySideDrawer />}
      </div>

      {/* Live Tabletop Overlays & Read-Only Codex (Zero Authoring Modals) */}
      <CampaignCompendiumDrawer />
      <DiceRollerDrawer />
      <GuildQuestBoardModal />
      <CommandPalette mode="play" />
      <SettingsModal />
    </div>
  );
};
