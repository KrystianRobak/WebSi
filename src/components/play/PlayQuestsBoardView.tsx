import React from 'react';
import { Compass, MapPin, ScrollText, ShieldAlert, Users } from 'lucide-react';
import { useVaultStore } from '../../store/useVaultStore';

export const PlayQuestsBoardView: React.FC = () => {
  const {
    world,
    maps,
    questBoards,
    guildQuests,
    guildQuestSignups,
    setActiveQuestBoardModalId,
    setPlayActiveMapId,
  } = useVaultStore();

  return (
    <div className="h-full w-full overflow-y-auto bg-[#06080b] p-6">
      <div className="max-w-5xl mx-auto space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[#181d27] pb-4">
          <div>
            <h1 className="font-serif text-2xl font-semibold text-[#f3ead8] flex items-center gap-2.5">
              <ScrollText className="w-6 h-6 text-[#d4a853]" />
              <span>Guild Quest Boards</span>
            </h1>
            <p className="text-xs text-[#8d96a6] mt-1">
              Active expedition notices and party signups across {world.name}.
            </p>
          </div>
          <span className="px-2.5 py-1 rounded-full text-[11px] font-mono bg-[#101520] border border-[#232c3d] text-[#d4a853]">
            {questBoards.length} Board{questBoards.length === 1 ? '' : 's'} · {guildQuests.length} Quest
            {guildQuests.length === 1 ? '' : 's'}
          </span>
        </div>

        {questBoards.length === 0 ? (
          <div className="rounded-xl bg-[#0b0e14] border border-dashed border-[#242b38] p-10 text-center space-y-2">
            <ScrollText className="w-8 h-8 text-[#d4a853]/50 mx-auto" />
            <p className="text-sm font-medium text-[#e8e2d5]">No Quest Boards posted yet</p>
            <p className="text-xs text-[#8d96a6] max-w-md mx-auto">
              Quest boards placed by your Game Master on any 3D World Map or 2D Battlemap will appear here for party signups.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {questBoards.map((board) => {
              const mapObj = maps.find((m) => m.id === board.map_id);
              const boardQuests = guildQuests.filter(
                (q) => q.board_id === board.id && q.status !== 'archived'
              );
              return (
                <div
                  key={board.id}
                  className="rounded-xl bg-[#0b0e14] border border-[#1c2331] p-4 flex flex-col justify-between gap-4 hover:border-[#d4a853]/40 transition-colors"
                >
                  <div className="space-y-2.5">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <h2 className="font-serif text-base font-semibold text-[#f3ead8]">
                          {board.title}
                        </h2>
                        {mapObj && (
                          <div className="text-[11px] font-mono text-[#8b94a5] flex items-center gap-1 mt-0.5">
                            <MapPin className="w-3 h-3 text-[#d4a853]" />
                            <span>{mapObj.name}</span>
                          </div>
                        )}
                      </div>
                      <span className="px-2 py-0.5 rounded bg-[#141925] border border-[#222b3d] text-[10px] font-mono text-[#c9a050]">
                        {boardQuests.length} Active
                      </span>
                    </div>

                    {board.description && (
                      <p className="text-xs text-[#9aa3b2] leading-relaxed">
                        {board.description}
                      </p>
                    )}

                    <div className="space-y-1.5 pt-1">
                      {boardQuests.length === 0 ? (
                        <div className="text-xs text-[#616978] italic">
                          No open contracts on this board yet.
                        </div>
                      ) : (
                        boardQuests.slice(0, 4).map((q) => {
                          const signupsCount = guildQuestSignups.filter(
                            (s) => s.quest_id === q.id
                          ).length;
                          return (
                            <div
                              key={q.id}
                              className="flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-lg bg-[#07090d] border border-[#151a24] text-xs"
                            >
                              <div className="min-w-0">
                                <div className="font-medium text-[#e8dfd0] truncate">{q.title}</div>
                                <div className="text-[10px] text-[#7e8796] flex items-center gap-2">
                                  <span className="inline-flex items-center gap-1">
                                    <ShieldAlert className="w-2.5 h-2.5 text-amber-400" />
                                    {q.danger_tier}
                                  </span>
                                  <span>·</span>
                                  <span>{q.reward}</span>
                                </div>
                              </div>
                              <span className="inline-flex items-center gap-1 text-[10.5px] font-mono text-[#d4a853] shrink-0">
                                <Users className="w-3 h-3" />
                                {signupsCount}/{q.max_players}
                              </span>
                            </div>
                          );
                        })
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 pt-2 border-t border-[#161c26]">
                    <button
                      type="button"
                      onClick={() => setActiveQuestBoardModalId(board.id)}
                      className="flex-1 py-1.5 px-3 rounded-lg btn-gold-metallic text-xs font-semibold"
                    >
                      Open Quest Board
                    </button>
                    {mapObj && (
                      <button
                        type="button"
                        onClick={() => setPlayActiveMapId(mapObj.id)}
                        className="py-1.5 px-3 rounded-lg bg-[#121722] border border-[#232c3d] hover:border-[#d4a853]/50 text-xs text-[#ded8cc] flex items-center gap-1.5"
                      >
                        <Compass className="w-3.5 h-3.5 text-[#d4a853]" />
                        <span>View Map</span>
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
