import React, { useEffect, useState } from 'react';
import {
  Check,
  Compass,
  Copy,
  Crown,
  Link2,
  Plus,
  RefreshCw,
  Shield,
  Sword,
  Ticket,
  Trash2,
  Upload,
  User,
  UserMinus,
  Users,
} from 'lucide-react';
import { getSupabaseClient, uploadVaultAsset } from '../../lib/supabase';
import { useVaultStore } from '../../store/useVaultStore';
import type { CampaignMode, CampaignRole, CharacterRecord } from '../../types/vault';

export const ProfileCampaignHub: React.FC = () => {
  const {
    user,
    userEmail,
    profile,
    updateProfile,
    campaigns,
    activeCampaignId,
    world,
    campaignMembers,
    myRole,
    characters,
    sheetTemplates,
    switchCampaign,
    createCampaign,
    importCampaignArchiveJson,
    joinCampaignByInvite,
    updateCampaignSettings,
    regenerateInviteCode,
    updateMemberRole,
    removeCampaignMember,
    leaveCampaign,
    openCharacterTab,
  } = useVaultStore();

  // Profile editor state
  const [displayName, setDisplayName] = useState(profile?.display_name || '');
  const [avatarUrl, setAvatarUrl] = useState(profile?.avatar_url || '');
  const [bio, setBio] = useState(profile?.bio || '');
  const [profileSaved, setProfileSaved] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);

  // Join by invite state
  const [inviteInput, setInviteInput] = useState('');
  const [joinStatus, setJoinStatus] = useState<{ error?: string; ok?: string } | null>(null);

  // Create campaign state
  const [createOpen, setCreateOpen] = useState(campaigns.length === 0);
  const [newName, setNewName] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [newMode, setNewMode] = useState<CampaignMode>('west_marches');
  const [maxPlayersPerParty, setMaxPlayersPerParty] = useState(5);
  const [seedStarter, setSeedStarter] = useState(true);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  // Import JSON state
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [copiedInvite, setCopiedInvite] = useState(false);
  const [memberActionError, setMemberActionError] = useState<string | null>(null);
  const [campaignDescDraft, setCampaignDescDraft] = useState(world.description || '');
  const [savingCampaignDesc, setSavingCampaignDesc] = useState(false);
  const [savedCampaignDesc, setSavedCampaignDesc] = useState(false);

  useEffect(() => {
    setCampaignDescDraft(world.description || '');
  }, [world.id, world.description]);

  useEffect(() => {
    setDisplayName(profile?.display_name || '');
    setAvatarUrl(profile?.avatar_url || '');
    setBio(profile?.bio || '');
  }, [profile]);

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    await updateProfile({
      display_name: displayName.trim() || 'Adventurer',
      avatar_url: avatarUrl.trim() || null,
      bio: bio.trim(),
    });
    setProfileSaved(true);
    setTimeout(() => setProfileSaved(false), 2000);
  };

  const handleAvatarUpload = async (file?: File) => {
    if (!file) return;
    setUploadingAvatar(true);
    try {
      const publicUrl = await uploadVaultAsset(file, 'avatars');
      setAvatarUrl(publicUrl);
    } finally {
      setUploadingAvatar(false);
    }
  };

  const handleJoinByInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    setJoinStatus(null);
    const res = await joinCampaignByInvite(inviteInput);
    if (res.error) {
      setJoinStatus({ error: res.error });
    } else {
      setInviteInput('');
      setJoinStatus({ ok: 'Joined campaign successfully!' });
    }
  };

  const handleCreateCampaign = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreateError(null);
    setCreating(true);
    try {
      const res = await createCampaign({
        name: newName,
        description: newDesc,
        mode: newMode,
        maxPlayersPerParty,
        seedStarter,
      });
      if (res.error) {
        setCreateError(res.error);
      } else {
        setNewName('');
        setNewDesc('');
        setCreateOpen(false);
      }
    } finally {
      setCreating(false);
    }
  };

  const handleImportJsonFile = async (file?: File) => {
    if (!file) return;
    setImportError(null);
    setImporting(true);
    try {
      const text = await file.text();
      const res = await importCampaignArchiveJson(text);
      if (res.error) setImportError(res.error);
    } catch (err) {
      setImportError(err instanceof Error ? err.message : 'Unable to read JSON file.');
    } finally {
      setImporting(false);
    }
  };

  const inviteUrl =
    typeof window !== 'undefined' && world.invite_code
      ? `${window.location.origin}${window.location.pathname}?invite=${world.invite_code}`
      : '';

  const copyInviteLink = () => {
    if (!inviteUrl) return;
    navigator.clipboard?.writeText(inviteUrl);
    setCopiedInvite(true);
    setTimeout(() => setCopiedInvite(false), 1800);
  };

  const isManager = myRole === 'gm' || myRole === 'co_gm';
  const myCharsInCampaign = characters.filter((c) => c.user_id === user?.id);
  const [crossCampaignChars, setCrossCampaignChars] = useState<CharacterRecord[]>([]);

  useEffect(() => {
    const client = getSupabaseClient();
    if (!client || !user?.id) {
      setCrossCampaignChars([]);
      return;
    }
    let cancelled = false;
    client
      .from('characters')
      .select('*')
      .eq('user_id', user.id)
      .then(({ data }) => {
        if (!cancelled && Array.isArray(data)) {
          setCrossCampaignChars(data as CharacterRecord[]);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [user?.id, characters, campaigns.length]);

  const allMyCharacters = (() => {
    const byId = new Map<string, CharacterRecord>();
    for (const c of crossCampaignChars) byId.set(c.id, c);
    for (const c of myCharsInCampaign) byId.set(c.id, c);
    return Array.from(byId.values());
  })();

  return (
    <div className="h-full w-full overflow-y-auto bg-[#06080b] p-6">
      <div className="max-w-5xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[#181d27] pb-4">
          <div>
            <h1 className="font-serif text-2xl font-semibold text-[#f3ead8] flex items-center gap-2.5">
              <Compass className="w-6 h-6 text-[#d4a853]" />
              <span>Player Profile &amp; Campaign Hub</span>
            </h1>
            <p className="text-xs text-[#8d96a6] mt-1">
              Manage your identity, create Normal or West Marches campaigns, join via invite code, and oversee party rosters.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <label className="cursor-pointer px-3 py-1.5 rounded-lg bg-[#10141c] border border-[#242b38] hover:border-[#d4a853]/50 text-xs text-[#ded8cc] inline-flex items-center gap-1.5">
              <Upload className="w-3.5 h-3.5 text-[#d4a853]" />
              <span>{importing ? 'Importing...' : 'Import Archive (.json)'}</span>
              <input
                type="file"
                accept="application/json,.json"
                className="hidden"
                onChange={(e) => handleImportJsonFile(e.target.files?.[0])}
              />
            </label>
            <button
              type="button"
              onClick={() => setCreateOpen(true)}
              className="px-3.5 py-1.5 rounded-lg btn-gold-metallic text-xs font-semibold inline-flex items-center gap-1.5"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>New Campaign</span>
            </button>
          </div>
        </div>

        {importError && (
          <div className="p-3 rounded-lg bg-red-950/60 border border-red-500/40 text-xs text-red-200">
            {importError}
          </div>
        )}

        {/* Top Grid: Profile + Join by Invite */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          {/* Player Profile Card */}
          <form
            onSubmit={handleSaveProfile}
            className="rounded-xl bg-[#0b0e14] border border-[#1a202c] p-5 space-y-3.5"
          >
            <div className="flex items-center justify-between gap-2">
              <h2 className="font-serif text-base font-semibold text-[#f3ead8] flex items-center gap-2">
                <User className="w-4 h-4 text-[#d4a853]" />
                <span>Player Profile</span>
                {profile?.display_name && (
                  <span className="text-xs font-sans font-normal text-[#c9a050]">
                    · {profile.display_name}
                  </span>
                )}
              </h2>
              <span className="font-mono text-[10.5px] text-[#7e8796]">{userEmail}</span>
            </div>

            <div className="flex items-center gap-3">
              {avatarUrl ? (
                <img
                  src={avatarUrl}
                  alt={displayName}
                  className="w-12 h-12 rounded-full object-cover border border-[#d4a853]/50"
                />
              ) : (
                <div className="w-12 h-12 rounded-full bg-[#151a24] border border-[#242b38] flex items-center justify-center text-[#d4a853] font-serif font-bold">
                  {(displayName || 'A').charAt(0).toUpperCase()}
                </div>
              )}
              <div className="flex-1 min-w-0">
                <label className="cursor-pointer inline-flex items-center gap-1.5 px-2.5 py-1 rounded bg-[#141822] border border-[#252c3b] hover:border-[#d4a853]/45 text-[11px] text-[#ded8cc]">
                  <Upload className="w-3 h-3 text-[#d4a853]" />
                  <span>{uploadingAvatar ? 'Uploading...' : 'Upload Avatar'}</span>
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => handleAvatarUpload(e.target.files?.[0])}
                  />
                </label>
              </div>
            </div>

            <div>
              <label htmlFor="hub-display-name" className="block text-[11px] text-[#9aa3b2] mb-1">
                Display Name
              </label>
              <input
                id="hub-display-name"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Your adventurer alias"
                className="w-full bg-[#07090d] border border-[#222936] rounded-lg px-3 py-1.5 text-xs text-[#f3ead8] focus:outline-none focus:border-[#d4a853]"
              />
            </div>

            <div>
              <label htmlFor="hub-bio" className="block text-[11px] text-[#9aa3b2] mb-1">
                Player Bio &amp; Preferences
              </label>
              <textarea
                id="hub-bio"
                rows={2}
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                placeholder="Preferred roles, timezone, play style..."
                className="w-full bg-[#07090d] border border-[#222936] rounded-lg px-3 py-1.5 text-xs text-[#ded8cc] focus:outline-none focus:border-[#d4a853]"
              />
            </div>

            <div className="flex items-center justify-end gap-2">
              {profileSaved && (
                <span className="text-xs text-emerald-400 inline-flex items-center gap-1">
                  <Check className="w-3.5 h-3.5" /> Saved
                </span>
              )}
              <button
                type="submit"
                className="px-3.5 py-1.5 rounded-lg bg-[#19202c] border border-[#d4a853]/40 hover:bg-[#d4a853]/15 text-xs font-semibold text-[#f3ead8]"
              >
                Save Profile
              </button>
            </div>
          </form>

          {/* Join by Invite Code Card */}
          <div className="rounded-xl bg-[#0b0e14] border border-[#1a202c] p-5 flex flex-col justify-between space-y-4">
            <div className="space-y-2">
              <h2 className="font-serif text-base font-semibold text-[#f3ead8] flex items-center gap-2">
                <Ticket className="w-4 h-4 text-[#d4a853]" />
                <span>Join a Campaign</span>
              </h2>
              <p className="text-xs text-[#8d96a6]">
                Enter an invite code shared by your Game Master (or open an invite link <code className="font-mono text-[#c9a050]">?invite=CODE</code>).
              </p>

              <form onSubmit={handleJoinByInvite} className="flex gap-2 pt-2">
                <input
                  aria-label="Invite Code"
                  value={inviteInput}
                  onChange={(e) => setInviteInput(e.target.value)}
                  placeholder="e.g. A1B2C3D4"
                  className="flex-1 min-w-0 bg-[#07090d] border border-[#222936] rounded-lg px-3 py-2 font-mono text-xs uppercase text-[#f3ead8] focus:outline-none focus:border-[#d4a853]"
                />
                <button
                  type="submit"
                  className="px-4 py-2 rounded-lg btn-gold-metallic text-xs font-semibold shrink-0"
                >
                  Join Campaign
                </button>
              </form>

              {joinStatus?.error && (
                <div className="p-2 rounded bg-red-950/60 border border-red-500/40 text-xs text-red-200">
                  {joinStatus.error}
                </div>
              )}
              {joinStatus?.ok && (
                <div className="p-2 rounded bg-emerald-950/60 border border-emerald-500/40 text-xs text-emerald-200">
                  {joinStatus.ok}
                </div>
              )}
            </div>

            {/* Active Characters Quick Box */}
            <div className="pt-3 border-t border-[#181d27]">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[11px] uppercase tracking-wider text-[#9aa3b2] font-semibold flex items-center gap-1.5">
                  <Sword className="w-3.5 h-3.5 text-[#d4a853]" />
                  My Characters ({allMyCharacters.length})
                </span>
                {activeCampaignId && (
                  <button
                    type="button"
                    onClick={() => openCharacterTab()}
                    className="text-[11px] text-[#d4a853] hover:underline"
                  >
                    Manage Roster →
                  </button>
                )}
              </div>
              {allMyCharacters.length === 0 ? (
                <p className="text-xs text-[#6f7887]">
                  {activeCampaignId
                    ? 'No character created in this campaign yet.'
                    : 'Select or join a campaign to create a character.'}
                </p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {allMyCharacters.map((c) => {
                    const campName = campaigns.find((cp) => cp.id === c.campaign_id)?.name;
                    return (
                      <button
                        key={c.id}
                        type="button"
                        onClick={async () => {
                          if (c.campaign_id && c.campaign_id !== activeCampaignId) {
                            await switchCampaign(c.campaign_id);
                          }
                          openCharacterTab(c.id);
                        }}
                        className="px-2.5 py-1 rounded-md bg-[#121722] border border-[#222a3a] hover:border-[#d4a853]/50 text-xs text-[#f3ead8] inline-flex items-center gap-1.5"
                      >
                        {c.name}
                        {campName && (
                          <span className="text-[10px] text-[#8d96a6]">({campName})</span>
                        )}
                        {c.is_active && (
                          <span className="text-[9px] px-1 rounded bg-emerald-500/20 text-emerald-300">
                            Active
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Create Campaign Form */}
        {createOpen && (
          <form
            onSubmit={handleCreateCampaign}
            className="rounded-xl bg-[#0b0e14] border border-[#d4a853]/40 p-5 space-y-4"
          >
            <h2 className="font-serif text-base font-semibold text-[#f3ead8]">
              Create New Campaign
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label htmlFor="hub-new-campaign-name" className="block text-[11px] text-[#9aa3b2] mb-1">
                  Campaign Name
                </label>
                <input
                  id="hub-new-campaign-name"
                  required
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="e.g. Chronicles of the Iron Reach"
                  className="w-full bg-[#07090d] border border-[#222936] rounded-lg px-3 py-2 text-xs text-[#f3ead8] focus:outline-none focus:border-[#d4a853]"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="hub-new-campaign-mode" className="block text-[11px] text-[#9aa3b2] mb-1">
                    Campaign Mode
                  </label>
                  <select
                    id="hub-new-campaign-mode"
                    value={newMode}
                    onChange={(e) => setNewMode(e.target.value as CampaignMode)}
                    className="w-full bg-[#07090d] border border-[#222936] rounded-lg px-2.5 py-2 text-xs text-[#f3ead8]"
                  >
                    <option value="west_marches">West Marches</option>
                    <option value="normal">Normal</option>
                  </select>
                </div>

                <div>
                  <label htmlFor="hub-max-players" className="block text-[11px] text-[#9aa3b2] mb-1">
                    Max Players / Party
                  </label>
                  <input
                    id="hub-max-players"
                    type="number"
                    min={1}
                    max={20}
                    value={maxPlayersPerParty}
                    onChange={(e) => setMaxPlayersPerParty(Math.max(1, Number(e.target.value) || 5))}
                    className="w-full bg-[#07090d] border border-[#222936] rounded-lg px-2.5 py-2 text-xs text-[#f3ead8]"
                  />
                </div>
              </div>
            </div>

            <div>
              <label htmlFor="hub-new-campaign-desc" className="block text-[11px] text-[#9aa3b2] mb-1">
                Premise &amp; Table Rules
              </label>
              <textarea
                id="hub-new-campaign-desc"
                rows={2}
                value={newDesc}
                onChange={(e) => setNewDesc(e.target.value)}
                placeholder="Open frontier hub where players form expedition parties from the Guild Quest Board..."
                className="w-full bg-[#07090d] border border-[#222936] rounded-lg px-3 py-1.5 text-xs text-[#ded8cc]"
              />
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3">
              <label className="flex items-center gap-2 text-xs text-[#ded8cc] cursor-pointer">
                <input
                  type="checkbox"
                  checked={seedStarter}
                  onChange={(e) => setSeedStarter(e.target.checked)}
                  className="accent-[#d4a853]"
                />
                <span>Include Starter Realm (Aethelgard 3D + 2D Map, NPCs &amp; Quest Board)</span>
              </label>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setCreateOpen(false)}
                  className="px-3 py-1.5 rounded-lg bg-[#151a24] text-xs text-[#9aa3b2] hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={creating}
                  className="px-4 py-1.5 rounded-lg btn-gold-metallic text-xs font-semibold disabled:opacity-50"
                >
                  {creating ? 'Creating...' : 'Create Campaign'}
                </button>
              </div>
            </div>

            {createError && (
              <div className="p-2.5 rounded bg-red-950/60 border border-red-500/40 text-xs text-red-200">
                {createError}
              </div>
            )}
          </form>
        )}

        {/* Joined Campaigns Grid */}
        <div className="space-y-3">
          <h2 className="font-serif text-base font-semibold text-[#f3ead8]">
            My Campaigns ({campaigns.length})
          </h2>
          {campaigns.length === 0 ? (
            <div className="rounded-xl bg-[#0b0e14] border border-dashed border-[#242b38] p-8 text-center text-xs text-[#8d96a6]">
              You have not joined any campaigns yet. Create a new campaign above or enter an invite code.
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
              {campaigns.map((camp) => {
                const isActive = camp.id === activeCampaignId;
                const isOwner = camp.owner_id === user?.id;
                return (
                  <div
                    key={camp.id}
                    className={`rounded-xl p-4 border transition-colors ${
                      isActive
                        ? 'bg-[#101520] border-[#d4a853]/55'
                        : 'bg-[#0b0e14] border-[#1a202c] hover:border-[#2a3346]'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <h3 className="font-serif text-sm font-semibold text-[#f3ead8]">
                            {camp.name}
                          </h3>
                          <span
                            className={`text-[10px] px-2 py-0.5 rounded-full font-medium border ${
                              camp.mode === 'west_marches'
                                ? 'bg-amber-500/15 border-amber-500/40 text-amber-300'
                                : 'bg-sky-500/15 border-sky-500/40 text-sky-300'
                            }`}
                          >
                            {camp.mode === 'west_marches' ? 'West Marches' : 'Normal'}
                          </span>
                          {isActive && myRole && (
                            <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/15 border border-emerald-500/35 text-emerald-300 uppercase">
                              {myRole.replace('_', '-')}
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-[#8d96a6] mt-1 line-clamp-2">
                          {camp.description || 'No campaign description.'}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center justify-between gap-2 mt-3 pt-2.5 border-t border-[#181d27]">
                      {isActive ? (
                        <span className="text-[11px] font-medium text-[#d4a853]">
                          Currently Active
                        </span>
                      ) : (
                        <button
                          type="button"
                          onClick={() => switchCampaign(camp.id)}
                          className="px-3 py-1 rounded-md bg-[#18202e] hover:bg-[#d4a853]/20 border border-[#2a3447] text-xs font-medium text-[#f3ead8]"
                        >
                          Switch to Campaign
                        </button>
                      )}

                      {!isOwner && (
                        <button
                          type="button"
                          onClick={() => leaveCampaign(camp.id)}
                          className="text-[11px] text-[#8d96a6] hover:text-red-300"
                        >
                          Leave
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Active Campaign Management (GM / Co-GM only) */}
        {activeCampaignId && world.id && isManager && (
          <div className="rounded-xl bg-[#0b0e14] border border-[#1a202c] p-5 space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#181d27] pb-3">
              <h2 className="font-serif text-base font-semibold text-[#f3ead8] flex items-center gap-2">
                <Shield className="w-4 h-4 text-[#d4a853]" />
                <span>Manage Campaign: {world.name}</span>
              </h2>
              <div className="flex items-center gap-2">
                <span className="font-mono text-xs px-2.5 py-1 rounded bg-[#07090d] border border-[#242b38] text-[#d4a853]">
                  Code: {world.invite_code || '—'}
                </span>
                <button
                  type="button"
                  onClick={copyInviteLink}
                  className="px-2.5 py-1 rounded bg-[#141923] border border-[#252c3b] hover:border-[#d4a853]/45 text-xs text-[#ded8cc] inline-flex items-center gap-1"
                >
                  <Link2 className="w-3.5 h-3.5 text-[#d4a853]" />
                  <span>{copiedInvite ? 'Copied!' : 'Copy Invite Link'}</span>
                </button>
                <button
                  type="button"
                  onClick={regenerateInviteCode}
                  title="Regenerate Invite Code"
                  className="p-1.5 rounded bg-[#141923] border border-[#252c3b] hover:border-[#d4a853]/45 text-[#9aa3b2] hover:text-white"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-[11px] text-[#9aa3b2] mb-1">Mode</label>
                <select
                  value={world.mode}
                  onChange={(e) =>
                    updateCampaignSettings({ mode: e.target.value as CampaignMode })
                  }
                  className="w-full bg-[#07090d] border border-[#222936] rounded-lg px-2.5 py-1.5 text-xs text-[#f3ead8]"
                >
                  <option value="normal">Normal (Multi-Char)</option>
                  <option value="west_marches">West Marches (1 Active Char)</option>
                </select>
              </div>
              <div>
                <label className="block text-[11px] text-[#9aa3b2] mb-1">
                  Default Quest Party Cap
                </label>
                <input
                  type="number"
                  min={1}
                  max={20}
                  value={world.max_players_per_party ?? 5}
                  onChange={(e) =>
                    updateCampaignSettings({
                      max_players_per_party: Math.max(1, Number(e.target.value) || 5),
                    })
                  }
                  className="w-full bg-[#07090d] border border-[#222936] rounded-lg px-2.5 py-1.5 text-xs text-[#f3ead8]"
                />
              </div>
              <div>
                <label className="block text-[11px] text-[#9aa3b2] mb-1">
                  Default Roll20 Sheet Template
                </label>
                <select
                  value={world.active_sheet_template_id || ''}
                  onChange={(e) =>
                    updateCampaignSettings({
                      active_sheet_template_id: e.target.value || null,
                    })
                  }
                  className="w-full bg-[#07090d] border border-[#222936] rounded-lg px-2.5 py-1.5 text-xs text-[#f3ead8]"
                >
                  <option value="">None</option>
                  {sheetTemplates.map((st) => (
                    <option key={st.id} value={st.id}>
                      {st.name} ({st.system_label})
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Campaign Premise / Description */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between gap-2">
                <label
                  htmlFor="hub-campaign-description"
                  className="block text-[11px] text-[#9aa3b2]"
                >
                  Campaign Premise &amp; Description
                </label>
                {savedCampaignDesc && (
                  <span className="text-[11px] text-emerald-400 inline-flex items-center gap-1">
                    <Check className="w-3 h-3" /> Description saved
                  </span>
                )}
              </div>
              <div className="flex flex-col sm:flex-row gap-2 items-stretch sm:items-end">
                <textarea
                  id="hub-campaign-description"
                  rows={2}
                  value={campaignDescDraft}
                  onChange={(e) => setCampaignDescDraft(e.target.value)}
                  placeholder="Describe your setting, tone, house rules, or West Marches premise..."
                  className="flex-1 bg-[#07090d] border border-[#222936] rounded-lg px-3 py-2 text-xs text-[#e8e2d5] focus:outline-none focus:border-[#d4a853] resize-none"
                />
                <button
                  type="button"
                  disabled={savingCampaignDesc}
                  onClick={async () => {
                    setSavingCampaignDesc(true);
                    await updateCampaignSettings({ description: campaignDescDraft.trim() });
                    setSavingCampaignDesc(false);
                    setSavedCampaignDesc(true);
                    setTimeout(() => setSavedCampaignDesc(false), 2000);
                  }}
                  className="px-3.5 py-2 rounded-lg bg-[#161c28] border border-[#d4a853]/40 hover:bg-[#d4a853]/15 text-xs font-semibold text-[#f3ead8] shrink-0 disabled:opacity-50"
                >
                  {savingCampaignDesc ? 'Saving...' : 'Save Description'}
                </button>
              </div>
            </div>

            {/* Members Roster */}
            <div className="space-y-2.5">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-[#9aa3b2] flex items-center gap-1.5">
                <Users className="w-3.5 h-3.5 text-[#d4a853]" />
                <span>Campaign Roster ({campaignMembers.length})</span>
              </h3>

              {memberActionError && (
                <div className="p-2 rounded bg-red-950/60 border border-red-500/40 text-xs text-red-200">
                  {memberActionError}
                </div>
              )}

              <div className="divide-y divide-[#161b24] rounded-lg border border-[#1a202c] bg-[#07090d]">
                {campaignMembers.map((mem) => {
                  const isWorldOwner = world.owner_id === mem.user_id;
                  const label =
                    mem.profile?.display_name || mem.user_id.slice(0, 8);
                  return (
                    <div
                      key={mem.user_id}
                      className="px-3.5 py-2.5 flex items-center justify-between gap-3 text-xs"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        {isWorldOwner && (
                          <Crown className="w-3.5 h-3.5 text-[#d4a853] shrink-0" />
                        )}
                        <span className="font-medium text-[#f3ead8] truncate">{label}</span>
                        {mem.user_id === user?.id && (
                          <span className="text-[10px] text-[#7e8796]">(You)</span>
                        )}
                      </div>

                      <div className="flex items-center gap-2">
                        {isWorldOwner ? (
                          <span className="font-mono text-[10.5px] px-2 py-0.5 rounded bg-[#d4a853]/15 text-[#d4a853]">
                            Owner GM
                          </span>
                        ) : (
                          <>
                            <select
                              aria-label={`Role for ${label}`}
                              value={mem.role}
                              onChange={async (e) => {
                                setMemberActionError(null);
                                const res = await updateMemberRole(
                                  mem.user_id,
                                  e.target.value as CampaignRole
                                );
                                if (res.error) setMemberActionError(res.error);
                              }}
                              className="bg-[#0e121a] border border-[#242b38] rounded px-2 py-1 text-[11px] text-[#ded8cc]"
                            >
                              <option value="player">Player</option>
                              <option value="co_gm">Co-GM</option>
                              {myRole === 'gm' && <option value="gm">GM</option>}
                            </select>
                            <button
                              type="button"
                              title={`Kick ${label}`}
                              aria-label={`Kick ${label}`}
                              onClick={async () => {
                                setMemberActionError(null);
                                const res = await removeCampaignMember(mem.user_id);
                                if (res.error) setMemberActionError(res.error);
                              }}
                              className="p-1.5 rounded bg-[#151821] hover:bg-red-950/60 border border-[#242b38] hover:border-red-500/40 text-[#9aa3b2] hover:text-red-300"
                            >
                              <UserMinus className="w-3.5 h-3.5" />
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
