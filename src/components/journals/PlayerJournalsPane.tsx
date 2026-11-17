import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  BookOpen,
  Code2,
  Columns2,
  Globe,
  Lock,
  NotebookPen,
  Plus,
  Share2,
  Sparkles,
  Trash2,
  Users,
} from 'lucide-react';
import { markdownToHtml, parseNoteMarkdownStyleBlock } from '../../lib/wikilinks';
import { useVaultStore } from '../../store/useVaultStore';
import {
  GrimoireCodeSubMode,
  GrimoireToolbarMenus,
  MarkdownGrimoireEditor,
  MarkdownGrimoireEditorHandle,
} from '../editor/MarkdownGrimoireEditor';
import { JournalShareModal } from './JournalShareModal';

export const PlayerJournalsPane: React.FC<{ initialPageId?: string }> = ({ initialPageId }) => {
  const {
    user,
    journalPages,
    journalPageShares,
    campaignMembers,
    entities,
    assets,
    createJournalPage,
    updateJournalPage,
    deleteJournalPage,
    openEntityByTitle,
  } = useVaultStore();

  const [filterScope, setFilterScope] = useState<'mine' | 'shared'>('mine');
  const [selectedPageId, setSelectedPageId] = useState<string | null>(
    initialPageId && initialPageId !== 'journals' ? initialPageId : null
  );
  const [viewMode, setViewMode] = useState<'read' | 'edit'>('edit');
  const [codeSubMode, setCodeSubMode] = useState<GrimoireCodeSubMode>('split');
  const [shareModalOpen, setShareModalOpen] = useState(false);

  const editorHandleRef = useRef<MarkdownGrimoireEditorHandle>(null);

  const myPages = useMemo(
    () => journalPages.filter((p) => p.owner_id === user?.id),
    [journalPages, user?.id]
  );

  const sharedWithMe = useMemo(
    () => journalPages.filter((p) => p.owner_id !== user?.id),
    [journalPages, user?.id]
  );

  useEffect(() => {
    if (initialPageId && initialPageId !== 'journals') {
      const target = journalPages.find((p) => p.id === initialPageId);
      if (target) {
        setSelectedPageId(target.id);
        setFilterScope(target.owner_id === user?.id ? 'mine' : 'shared');
      }
    }
  }, [initialPageId, journalPages, user?.id]);

  const activeList = filterScope === 'mine' ? myPages : sharedWithMe;
  const activePage =
    journalPages.find((p) => p.id === selectedPageId) || activeList[0] || journalPages[0] || null;

  const isOwner = Boolean(activePage && user && activePage.owner_id === user.id);
  const hasEditShare = Boolean(
    activePage &&
      user &&
      journalPageShares.some(
        (sh) => sh.page_id === activePage.id && sh.shared_with_user_id === user.id && sh.can_edit
      )
  );
  const canEdit = isOwner || hasEditShare;

  const [titleDraft, setTitleDraft] = useState(activePage?.title || '');
  const [contentDraft, setContentDraft] = useState(activePage?.content || '');

  useEffect(() => {
    setTitleDraft(activePage?.title || '');
    setContentDraft(activePage?.content || '');
    if (activePage && !canEdit) {
      setViewMode('read');
    }
  }, [activePage?.id, activePage?.title, activePage?.content, canEdit]);

  const renderedHtml = useMemo(
    () => markdownToHtml(contentDraft, assets, entities),
    [contentDraft, assets, entities]
  );
  const { noteVars } = useMemo(() => parseNoteMarkdownStyleBlock(contentDraft), [contentDraft]);

  const handleCreateNew = async () => {
    const created = await createJournalPage({ title: 'New Expedition Log' });
    if (created) {
      setFilterScope('mine');
      setSelectedPageId(created.id);
      setViewMode('edit');
    }
  };

  const getOwnerLabel = (ownerId: string) => {
    if (ownerId === user?.id) return 'You';
    const mem = campaignMembers.find((m) => m.user_id === ownerId);
    return mem?.profile?.display_name || ownerId.slice(0, 8);
  };

  const ScopeIcon = ({ scope }: { scope: string }) => {
    if (scope === 'campaign') return <Globe className="w-3 h-3 text-emerald-400" />;
    if (scope === 'selected') return <Users className="w-3 h-3 text-sky-400" />;
    return <Lock className="w-3 h-3 text-[#8c95a4]" />;
  };

  return (
    <div className="h-full w-full flex bg-[#06070a] text-[#ded8cc] overflow-hidden">
      {/* Left Journal List Rail */}
      <aside className="w-64 shrink-0 border-r border-[#12161e] bg-[#050608] flex flex-col">
        <div className="p-3 border-b border-[#12161e] space-y-2.5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <NotebookPen className="w-4 h-4 text-[#d4a853]" />
              <span className="font-serif text-sm font-semibold text-[#f3ead8]">Journals</span>
            </div>
            <button
              onClick={handleCreateNew}
              className="px-2 py-1 rounded btn-gold-metallic text-[11px] font-semibold flex items-center gap-1"
            >
              <Plus className="w-3 h-3" />
              <span>New Page</span>
            </button>
          </div>

          <div className="grid grid-cols-2 gap-1 p-0.5 rounded-md bg-[#040507] border border-[#131720] text-[11px]">
            <button
              onClick={() => setFilterScope('mine')}
              className={`py-1 rounded font-medium transition-colors ${
                filterScope === 'mine'
                  ? 'bg-[#10141c] text-[#d6b16a]'
                  : 'text-[#757e8d] hover:text-white'
              }`}
            >
              My Journal ({myPages.length})
            </button>
            <button
              onClick={() => setFilterScope('shared')}
              className={`py-1 rounded font-medium transition-colors ${
                filterScope === 'shared'
                  ? 'bg-[#10141c] text-[#d6b16a]'
                  : 'text-[#757e8d] hover:text-white'
              }`}
            >
              Shared ({sharedWithMe.length})
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {activeList.length === 0 ? (
            <div className="px-2 py-6 text-center text-xs text-[#6c7585]">
              {filterScope === 'mine'
                ? 'No personal journal pages yet.'
                : 'No party members have shared pages with you yet.'}
            </div>
          ) : (
            activeList.map((page) => {
              const selected = activePage?.id === page.id;
              return (
                <button
                  key={page.id}
                  onClick={() => setSelectedPageId(page.id)}
                  className={`w-full text-left px-2.5 py-2 rounded-lg border transition-colors ${
                    selected
                      ? 'bg-[#b68d40]/14 border-[#b68d40]/45 text-[#f3ead8]'
                      : 'bg-[#080a0f] border-transparent hover:border-[#1a202c] text-[#b4becd]'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-medium truncate">{page.title}</span>
                    <ScopeIcon scope={page.share_scope} />
                  </div>
                  <div className="text-[10px] text-[#6c7585] mt-0.5 flex items-center justify-between">
                    <span>{getOwnerLabel(page.owner_id)}</span>
                    <span>{new Date(page.updated_at).toLocaleDateString()}</span>
                  </div>
                </button>
              );
            })
          )}
        </div>
      </aside>

      {/* Main Journal Workspace */}
      <div className="flex-1 min-w-0 flex flex-col overflow-hidden">
        {!activePage ? (
          <div className="flex-1 flex flex-col items-center justify-center p-6 text-center space-y-3">
            <NotebookPen className="w-10 h-10 text-[#b68d40]/60" />
            <h3 className="font-serif text-lg text-[#f3ead8]">Start Your Expedition Journal</h3>
            <p className="text-xs text-[#8c95a4] max-w-sm">
              Keep private character theories, dungeon notes, or share selected pages with party members.
            </p>
            <button
              onClick={handleCreateNew}
              className="px-4 py-2 rounded-lg btn-gold-metallic text-xs font-semibold flex items-center gap-1.5"
            >
              <Plus className="w-3.5 h-3.5" />
              Create First Journal Page
            </button>
          </div>
        ) : (
          <>
            <div className="h-[40px] px-3 border-b border-[#12161e] bg-[#050608] flex items-center justify-between gap-2 shrink-0">
              <div className="flex items-center gap-2 min-w-0 flex-1">
                <ScopeIcon scope={activePage.share_scope} />
                <input
                  aria-label="Journal Page Title"
                  placeholder="Journal Page Title"
                  readOnly={!canEdit}
                  value={titleDraft}
                  onChange={(e) => {
                    setTitleDraft(e.target.value);
                    updateJournalPage(activePage.id, { title: e.target.value });
                  }}
                  className="flex-1 min-w-0 bg-transparent font-serif text-[15px] font-semibold text-[#ede5d6] focus:outline-none truncate"
                />
                {!isOwner && (
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-[#0c0f15] border border-[#1d222b] text-[#8c95a4] shrink-0">
                    By {getOwnerLabel(activePage.owner_id)} {canEdit ? '• Editor' : '• Read Only'}
                  </span>
                )}
              </div>

              <div className="flex items-center gap-1.5 shrink-0">
                {canEdit && viewMode === 'edit' && (
                  <GrimoireToolbarMenus editorRef={editorHandleRef} codeSubMode={codeSubMode} />
                )}

                {canEdit && (
                  <div className="flex items-center bg-[#040507] p-0.5 rounded-md border border-[#131720]">
                    <button
                      onClick={() => {
                        setViewMode('edit');
                        setCodeSubMode('split');
                      }}
                      className={`flex items-center gap-1 px-2 py-0.5 rounded text-[11px] ${
                        viewMode === 'edit' && codeSubMode === 'split'
                          ? 'bg-[#10141c] text-[#d6b16a]'
                          : 'text-[#757e8d] hover:text-white'
                      }`}
                    >
                      <Columns2 className="w-3 h-3" />
                      <span className="hidden md:inline">Split</span>
                    </button>
                    <button
                      onClick={() => {
                        setViewMode('edit');
                        setCodeSubMode('raw');
                      }}
                      className={`flex items-center gap-1 px-2 py-0.5 rounded text-[11px] ${
                        viewMode === 'edit' && codeSubMode === 'raw'
                          ? 'bg-[#10141c] text-[#d6b16a]'
                          : 'text-[#757e8d] hover:text-white'
                      }`}
                    >
                      <Code2 className="w-3 h-3" />
                      <span className="hidden lg:inline">Source</span>
                    </button>
                    <button
                      onClick={() => {
                        setViewMode('edit');
                        setCodeSubMode('visual');
                      }}
                      className={`flex items-center gap-1 px-2 py-0.5 rounded text-[11px] ${
                        viewMode === 'edit' && codeSubMode === 'visual'
                          ? 'bg-[#10141c] text-[#d6b16a]'
                          : 'text-[#757e8d] hover:text-white'
                      }`}
                    >
                      <Sparkles className="w-3 h-3" />
                      <span className="hidden lg:inline">Visual</span>
                    </button>
                    <button
                      onClick={() => setViewMode('read')}
                      className={`flex items-center gap-1 px-2 py-0.5 rounded text-[11px] ${
                        viewMode === 'read'
                          ? 'bg-[#10141c] text-[#d6b16a]'
                          : 'text-[#757e8d] hover:text-white'
                      }`}
                    >
                      <BookOpen className="w-3 h-3" />
                      <span className="hidden md:inline">Read</span>
                    </button>
                  </div>
                )}

                {isOwner && (
                  <>
                    <button
                      onClick={() => setShareModalOpen(true)}
                      className="flex items-center gap-1 px-2.5 py-1 rounded bg-[#0c0f15] border border-[#b68d40]/40 hover:border-[#d4a853] text-[11px] font-medium text-[#d6b16a]"
                    >
                      <Share2 className="w-3 h-3" />
                      <span>Share</span>
                    </button>
                    <button
                      onClick={() => deleteJournalPage(activePage.id)}
                      title="Delete Journal Page"
                      className="p-1.5 rounded bg-[#090b0f] border border-[#151a23] text-[#6d7686] hover:text-red-400"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </>
                )}
              </div>
            </div>

            {viewMode === 'read' || !canEdit ? (
              <div className="flex-1 overflow-y-auto px-8 py-6 max-w-4xl mx-auto w-full">
                <h1 className="font-serif text-2xl font-bold text-[#f3ead8] mb-4">
                  {activePage.title}
                </h1>
                <div
                  style={noteVars as React.CSSProperties}
                  className="tiptap"
                  onClick={(e) => {
                    const target = (e.target as HTMLElement).closest('[data-wikilink]') as HTMLElement | null;
                    const title = target?.getAttribute('data-wikilink');
                    if (title) openEntityByTitle(title);
                  }}
                  dangerouslySetInnerHTML={{ __html: renderedHtml }}
                />
              </div>
            ) : (
              <MarkdownGrimoireEditor
                ref={editorHandleRef}
                docId={activePage.id}
                value={contentDraft}
                updatedAt={activePage.updated_at}
                readOnly={!canEdit}
                codeSubMode={codeSubMode}
                placeholder="Write private session logs, character notes, or [[WikiLink]] world entries..."
                onChange={(nextMd) => {
                  setContentDraft(nextMd);
                  updateJournalPage(activePage.id, { content: nextMd });
                }}
              />
            )}
          </>
        )}
      </div>

      {shareModalOpen && activePage && (
        <JournalShareModal page={activePage} onClose={() => setShareModalOpen(false)} />
      )}
    </div>
  );
};
