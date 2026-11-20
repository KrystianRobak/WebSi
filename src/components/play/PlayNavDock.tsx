import React from 'react';
import {
  BookMarked,
  Calendar,
  Compass,
  NotebookPen,
  ScrollText,
  UserCheck,
  Users,
} from 'lucide-react';
import { useVaultStore } from '../../store/useVaultStore';
import type { PlaySection } from '../../types/vault';

export const PlayNavDock: React.FC = () => {
  const {
    playActiveSection,
    setPlayActiveSection,
    playCodexOpen,
    openPlayCodex,
    closePlayCodex,
  } = useVaultStore();

  const itemCls = (active: boolean) =>
    `group relative w-full py-1.5 px-1 rounded-lg flex flex-col items-center justify-center gap-0.5 transition-all shrink-0 ${
      active
        ? 'bg-[#131a26] text-[#e2b969] border border-[#d4a853]/40 shadow-[0_0_12px_rgba(212,168,83,0.12)]'
        : 'text-[#8791a3] hover:text-[#f0e9db] hover:bg-[#111722] border border-transparent'
    }`;

  const navButtons: Array<{
    id: PlaySection;
    label: string;
    title: string;
    icon: React.FC<{ className?: string }>;
  }> = [
    { id: 'table', label: 'Table', title: 'Live Map & Battlemap Table', icon: Compass },
    { id: 'party', label: 'Party', title: 'Characters & Character Sheets', icon: Users },
    { id: 'journals', label: 'Journals', title: 'Player Journals & Shared Notes', icon: NotebookPen },
    { id: 'quests', label: 'Quests', title: 'Guild Quest Boards', icon: ScrollText },
    { id: 'timeline', label: 'Timeline', title: 'Campaign Calendar & Timeline', icon: Calendar },
  ];

  return (
    <nav
      aria-label="Playing Mode Navigation"
      className="w-[54px] sm:w-[64px] h-full bg-[#070a0f] border-r border-[#16202b] flex flex-col items-center py-2.5 px-1.5 gap-1.5 shrink-0 z-30 overflow-y-auto no-scrollbar select-none"
    >
      {navButtons.map((item) => {
        const Icon = item.icon;
        return (
          <button
            key={item.id}
            type="button"
            onClick={() => setPlayActiveSection(item.id)}
            title={item.title}
            aria-label={item.title}
            className={itemCls(playActiveSection === item.id)}
          >
            <Icon className="w-4 h-4" />
            <span className="hidden sm:block text-[9.5px] font-medium tracking-tight leading-none">
              {item.label}
            </span>
          </button>
        );
      })}

      <div className="w-6 h-px bg-[#182230] my-1 shrink-0" />

      <button
        type="button"
        onClick={() => (playCodexOpen ? closePlayCodex() : openPlayCodex())}
        title="Campaign & World Codex (Read-Only)"
        aria-label="Codex"
        className={itemCls(playCodexOpen)}
      >
        <BookMarked className="w-4 h-4" />
        <span className="hidden sm:block text-[9.5px] font-medium tracking-tight leading-none">
          Codex
        </span>
      </button>

      <div className="mt-auto w-full flex flex-col items-center gap-1 pt-2 border-t border-[#151e2a]">
        <button
          type="button"
          onClick={() => setPlayActiveSection('hub')}
          title="Profile & Campaigns Hub"
          aria-label="Profile & Campaigns"
          className={itemCls(playActiveSection === 'hub')}
        >
          <UserCheck className="w-4 h-4" />
          <span className="hidden sm:block text-[9.5px] font-medium tracking-tight leading-none">
            Hub
          </span>
        </button>
      </div>
    </nav>
  );
};
