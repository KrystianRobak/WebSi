import React, { useMemo, useState } from 'react';
import {
  ArrowUpRight,
  Calendar,
  ChevronLeft,
  ChevronRight,
  Clock,
  EyeOff,
  Plus,
  Settings2,
  Trash2,
  X,
} from 'lucide-react';
import { normalizeCalendarConfig } from '../../data/seedData';
import { useVaultStore } from '../../store/useVaultStore';
import type { CampaignCalendarConfig, ViewportSurface } from '../../types/vault';

export const CampaignTimelinePane: React.FC<{ surface?: ViewportSurface }> = ({
  surface = 'studio',
}) => {
  const {
    world,
    timelineEvents,
    entities,
    isEffectiveGm,
    createTimelineEvent,
    deleteTimelineEvent,
    stepCampaignCalendar,
    updateCalendarConfig,
    openEntityTab,
  } = useVaultStore();

  const canEdit = isEffectiveGm();
  const canAuthorTimeline = surface === 'studio' && canEdit;
  const cal: CampaignCalendarConfig = normalizeCalendarConfig(world.calendar_config);
  const months = cal.months;
  const activeMonth = months[cal.currentMonthIndex % months.length] || months[0];
  const weekdays = cal.weekdays;
  const activeWeekday = weekdays[Math.max(0, cal.currentDay - 1) % weekdays.length];

  const [addingEvent, setAddingEvent] = useState(false);
  const [title, setTitle] = useState('');
  const [era, setEra] = useState(cal.eraName || 'Age of Embers');
  const [dateLabel, setDateLabel] = useState(
    `${cal.currentDay} ${activeMonth?.name || 'Frostfall'}, Year ${cal.currentYear}`
  );
  const [sortOrder, setSortOrder] = useState((timelineEvents[timelineEvents.length - 1]?.sort_order ?? 0) + 10);
  const [description, setDescription] = useState('');
  const [linkedEntityId, setLinkedEntityId] = useState('');
  const [isGmOnly, setIsGmOnly] = useState(false);

  const [editingCal, setEditingCal] = useState(false);
  const [eraInput, setEraInput] = useState(cal.eraName);
  const [yearInput, setYearInput] = useState(cal.currentYear);

  const visibleEvents = useMemo(
    () =>
      timelineEvents
        .filter((ev) => canEdit || !ev.is_gm_only)
        .sort((a, b) => a.sort_order - b.sort_order),
    [timelineEvents, canEdit]
  );

  const chronicleEntities = useMemo(
    () =>
      entities.filter((e) =>
        ['Chronicle', 'Event', 'History', 'Session'].includes(e.type)
      ),
    [entities]
  );

  const handleCreateEvent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    await createTimelineEvent({
      title,
      era,
      date_label: dateLabel,
      sort_order: sortOrder,
      description,
      linked_entity_id: linkedEntityId || null,
      is_gm_only: isGmOnly,
    });
    setTitle('');
    setDescription('');
    setLinkedEntityId('');
    setIsGmOnly(false);
    setAddingEvent(false);
    setSortOrder((s) => s + 10);
  };

  return (
    <div className="h-full w-full overflow-y-auto bg-[#06070a] text-[#ded8cc] p-6">
      <div className="max-w-5xl mx-auto space-y-6">
        {/* Fantasy Calendar Card */}
        <section className="rounded-xl bg-[#0a0d13] border border-[#d4a853]/30 p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-[11px] font-mono uppercase tracking-[0.18em] text-[#d4a853]">
              <Calendar className="w-3.5 h-3.5" />
              <span>{cal.eraName}</span>
            </div>
            <h1 className="font-serif text-2xl font-bold text-[#f3ead8]">
              {activeWeekday}, {cal.currentDay} {activeMonth?.name} — Year {cal.currentYear}
            </h1>
            <p className="text-xs text-[#8c95a4]">
              Current campaign date for {world.name} ({months.length} months/year)
            </p>
          </div>

          {canEdit && (
            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={() => stepCampaignCalendar(-1)}
                className="px-2.5 py-1.5 rounded-lg bg-[#050608] border border-[#1d222b] hover:border-[#d4a853]/50 text-xs flex items-center gap-1"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
                <span>-1 Day</span>
              </button>
              <button
                onClick={() => stepCampaignCalendar(1)}
                className="px-2.5 py-1.5 rounded-lg bg-[#050608] border border-[#1d222b] hover:border-[#d4a853]/50 text-xs flex items-center gap-1 text-[#e6c687]"
              >
                <span>+1 Day</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => stepCampaignCalendar(7)}
                className="px-2.5 py-1.5 rounded-lg bg-[#050608] border border-[#1d222b] hover:border-[#d4a853]/50 text-xs"
              >
                +1 Week
              </button>
              {canAuthorTimeline && (
                <button
                  onClick={() => {
                    setEraInput(cal.eraName);
                    setYearInput(cal.currentYear);
                    setEditingCal((v) => !v);
                  }}
                  title="Configure Era & Year"
                  className="p-2 rounded-lg bg-[#050608] border border-[#1d222b] hover:border-[#d4a853]/50 text-[#9b9384]"
                >
                  <Settings2 className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          )}
        </section>

        {canAuthorTimeline && editingCal && (
          <section className="rounded-xl bg-[#090c11] border border-[#1d222b] p-4 flex flex-wrap items-end gap-3">
            <label className="space-y-1 flex-1 min-w-[180px]">
              <span className="text-[11px] text-[#8c95a4]">Era Name</span>
              <input
                value={eraInput}
                onChange={(e) => setEraInput(e.target.value)}
                className="w-full bg-[#050608] border border-[#1d222b] rounded px-2.5 py-1.5 text-xs text-[#f3ead8]"
              />
            </label>
            <label className="space-y-1 w-28">
              <span className="text-[11px] text-[#8c95a4]">Current Year</span>
              <input
                type="number"
                value={yearInput}
                onChange={(e) => setYearInput(Number(e.target.value) || 1)}
                className="w-full bg-[#050608] border border-[#1d222b] rounded px-2.5 py-1.5 text-xs text-[#f3ead8]"
              />
            </label>
            <button
              onClick={async () => {
                await updateCalendarConfig({
                  ...cal,
                  eraName: eraInput.trim() || cal.eraName,
                  currentYear: yearInput,
                });
                setEditingCal(false);
              }}
              className="px-4 py-1.5 rounded-lg btn-gold-metallic text-xs font-semibold"
            >
              Save Calendar
            </button>
          </section>
        )}

        {/* Timeline Header + Add Form */}
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-[#d4a853]" />
              <h2 className="font-serif text-lg font-semibold text-[#f3ead8]">
                Campaign Timeline ({visibleEvents.length})
              </h2>
            </div>
            {canAuthorTimeline && (
              <button
                onClick={() => setAddingEvent((v) => !v)}
                className="px-3 py-1.5 rounded-lg btn-gold-metallic text-xs font-semibold flex items-center gap-1"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add Timeline Event</span>
              </button>
            )}
          </div>

          {canAuthorTimeline && addingEvent && (
            <form
              onSubmit={handleCreateEvent}
              className="rounded-xl bg-[#0a0d13] border border-[#d4a853]/35 p-4 space-y-3"
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-[#e6c687]">New Historical Event</span>
                <button type="button" onClick={() => setAddingEvent(false)} className="text-[#7c8594]">
                  <X className="w-4 h-4" />
                </button>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                <input
                  required
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Event title..."
                  className="md:col-span-2 bg-[#050608] border border-[#1d222b] rounded px-3 py-1.5 text-xs text-[#f3ead8]"
                />
                <input
                  value={dateLabel}
                  onChange={(e) => setDateLabel(e.target.value)}
                  placeholder="Date label..."
                  className="bg-[#050608] border border-[#1d222b] rounded px-3 py-1.5 text-xs text-[#f3ead8]"
                />
                <input
                  type="number"
                  value={sortOrder}
                  onChange={(e) => setSortOrder(Number(e.target.value) || 0)}
                  placeholder="Order"
                  className="bg-[#050608] border border-[#1d222b] rounded px-3 py-1.5 text-xs text-[#f3ead8]"
                />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <input
                  value={era}
                  onChange={(e) => setEra(e.target.value)}
                  placeholder="Era..."
                  className="bg-[#050608] border border-[#1d222b] rounded px-3 py-1.5 text-xs text-[#f3ead8]"
                />
                <select
                  value={linkedEntityId}
                  onChange={(e) => setLinkedEntityId(e.target.value)}
                  className="bg-[#050608] border border-[#1d222b] rounded px-3 py-1.5 text-xs text-[#f3ead8]"
                >
                  <option value="">No linked Vault note</option>
                  {entities.map((ent) => (
                    <option key={ent.id} value={ent.id}>
                      [{ent.type}] {ent.title}
                    </option>
                  ))}
                </select>
              </div>
              <textarea
                rows={2}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="What happened during this event..."
                className="w-full bg-[#050608] border border-[#1d222b] rounded px-3 py-1.5 text-xs text-[#f3ead8]"
              />
              <div className="flex items-center justify-between">
                <label className="flex items-center gap-2 text-xs text-red-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={isGmOnly}
                    onChange={(e) => setIsGmOnly(e.target.checked)}
                    className="accent-red-500"
                  />
                  <span>GM Secret Event (hidden from players)</span>
                </label>
                <button
                  type="submit"
                  className="px-4 py-1.5 rounded-lg btn-gold-metallic text-xs font-semibold"
                >
                  Save Event
                </button>
              </div>
            </form>
          )}

          {visibleEvents.length === 0 ? (
            <div className="rounded-xl border border-dashed border-[#1d222b] p-8 text-center text-xs text-[#7c8594]">
              No timeline events recorded yet.
            </div>
          ) : (
            <div className="relative pl-6 border-l border-[#b68d40]/35 space-y-4">
              {visibleEvents.map((ev) => {
                const linked = ev.linked_entity_id
                  ? entities.find((e) => e.id === ev.linked_entity_id)
                  : null;
                return (
                  <div
                    key={ev.id}
                    className="relative rounded-xl bg-[#0a0d13] border border-[#181d27] p-4 space-y-1.5"
                  >
                    <span className="absolute -left-[29px] top-5 w-2.5 h-2.5 rounded-full bg-[#d4a853] ring-4 ring-[#06070a]" />
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-[10.5px] font-mono text-[#d4a853]">
                            {ev.date_label}
                          </span>
                          {ev.era && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-[#050608] border border-[#1d222b] text-[#8c95a4]">
                              {ev.era}
                            </span>
                          )}
                          {ev.is_gm_only && (
                            <span className="inline-flex items-center gap-1 text-[10px] text-red-300 bg-red-950/30 border border-red-500/30 px-1.5 py-0.5 rounded">
                              <EyeOff className="w-2.5 h-2.5" /> GM Only
                            </span>
                          )}
                        </div>
                        <h3 className="font-serif text-base font-semibold text-[#f3ead8] mt-0.5">
                          {ev.title}
                        </h3>
                      </div>

                      <div className="flex items-center gap-1.5">
                        {linked && (
                          <button
                            onClick={() => openEntityTab(linked.id)}
                            className="px-2 py-1 rounded bg-[#050608] border border-[#1d222b] hover:border-[#d4a853]/50 text-[11px] text-[#e6c687] flex items-center gap-1"
                          >
                            <span>{linked.title}</span>
                            <ArrowUpRight className="w-3 h-3" />
                          </button>
                        )}
                        {canAuthorTimeline && (
                          <button
                            onClick={() => deleteTimelineEvent(ev.id)}
                            className="p-1.5 rounded text-[#6c7585] hover:text-red-400"
                            title="Delete Event"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </div>
                    {ev.description && (
                      <p className="text-xs text-[#9aa3b2] leading-relaxed whitespace-pre-wrap">
                        {ev.description}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* Linked Chronicle & Session Entities */}
        {chronicleEntities.length > 0 && (
          <section className="space-y-3 pt-2 border-t border-[#141821]">
            <h3 className="text-xs font-mono uppercase tracking-wider text-[#8c95a4]">
              Chronicle &amp; Session Vault Entries ({chronicleEntities.length})
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {chronicleEntities.map((ent) => (
                <button
                  key={ent.id}
                  onClick={() => openEntityTab(ent.id)}
                  className="text-left rounded-lg bg-[#0a0d13] border border-[#181d27] hover:border-[#b68d40]/50 p-3 transition-colors"
                >
                  <div className="text-[10px] font-mono uppercase text-[#d4a853]">{ent.type}</div>
                  <div className="font-serif text-sm font-semibold text-[#f3ead8] truncate">
                    {ent.title}
                  </div>
                  {ent.summary && (
                    <p className="text-[11px] text-[#8c95a4] line-clamp-2 mt-1">{ent.summary}</p>
                  )}
                </button>
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  );
};
