import { EntityTemplate, EntityType } from '../types/vault';

function makeTemplate(
  type: EntityType,
  label: string,
  summaryPlaceholder: string,
  defaultTags: string[],
  metadata: Record<string, string | number | boolean>,
  content: string,
  customCss = ''
): EntityTemplate {
  return {
    type,
    label,
    summaryPlaceholder,
    defaultTags,
    metadata,
    content,
    customCss,
  };
}

export const DEFAULT_TEMPLATES: Record<EntityType, EntityTemplate> = {
  Character: makeTemplate(
    'Character',
    'Character Dossier',
    'Role • Faction or Title. One-line hook summarizing appearance and motivation.',
    ['npc', 'character'],
    {
      Title: 'Unknown',
      Ancestry: 'Human',
      Allegiance: 'Independent',
      Disposition: 'Neutral',
      Location: 'Oakhaven',
      Status: 'Alive',
    },
    `<div class="dossier-banner">
  <strong>Role & Archetype:</strong> Fill in title, voice, and immediate impression.
</div>

## Appearance & Mannerisms
- **Distinctive Feature:** Describe clothing, scars, or sigils.
- **Speech & Demeanor:** Tone, cadence, or recurring gesture.

## Goals & Connections
- Allied with [[Oakhaven]] or [[The Shadow Guild]].
- Seeks information regarding [[The Sunken Reliquary]].

<details>
<summary>Quick Roleplay Notes & Quotes</summary>
<p>"Add memorable dialogue lines or negotiation leverage here."</p>
</details>`,
    `.dossier-banner {
  background: rgba(212, 168, 83, 0.08);
  border-left: 3px solid #d4a853;
  padding: 0.75rem 1rem;
  border-radius: 0 6px 6px 0;
  margin-bottom: 1rem;
  color: #f0e6d2;
}`
  ),

  Location: makeTemplate(
    'Location',
    'Location Gazetteer',
    'Settlement / Landmark • Controlling Faction. Brief 1-2 sentence map tooltip summary.',
    ['location', 'landmark'],
    {
      Region: 'The Shattered Reach',
      Population: 'Unknown',
      Ruler: 'Local Council',
      'Danger Level': 'Moderate',
      Weather: 'Temperate / Coastal',
    },
    `## Overview
Describe the silhouette, sensory details (smells, sounds, lighting), and strategic importance within [[Shattered Reach — West Marches]].

## Key Landmarks
- **Landmark 1:** Purpose and notable NPCs.
- **Landmark 2:** Rumors, trade goods, or hazards.

## Rumors & Hooks
- Travelers arriving from [[Oakhaven]] speak of strange lights nearby.`,
    ''
  ),

  Faction: makeTemplate(
    'Faction',
    'Faction Charter',
    'Syndicate / Order • Sphere of Influence. Core agenda and public reputation.',
    ['faction'],
    {
      Headquarters: 'Oakhaven',
      Leader: 'Unknown',
      Influence: 'Regional',
      Alignment: 'Pragmatic',
    },
    `## Creed & Agenda
What does this faction publicly claim to uphold, and what do they truly pursue?

## Hierarchy & Assets
- **Leadership:** Key figures and lieutenants.
- **Strongholds:** Safehouses, ships, or keeps.

## Rivalries & Alliances
- Tension with [[The Shadow Guild]] or [[Oakhaven Harbor Magistracy]].`,
    ''
  ),

  Organization: makeTemplate(
    'Organization',
    'Guild / Civic Organization',
    'Civic or Mercantile Body • Seat of Operations.',
    ['organization'],
    {
      Seat: 'Oakhaven',
      Mandate: 'Trade & Governance',
      Standing: 'Official',
    },
    `## Mandate & Jurisdiction
Outline laws, charters, or services this organization administers.

## Notable Members
- List key magistrates, scholars, or captains.`,
    ''
  ),

  Item: makeTemplate(
    'Item',
    'Relic / Item Card',
    'Rarity • Type (Wondrous Item, Weapon, Relic). Brief arcane property.',
    ['item', 'loot'],
    {
      Rarity: 'Rare',
      Attunement: 'Required',
      Origin: 'First Age of Cinders',
      Value: '1,200 gp',
    },
    `<div class="relic-card">
  <strong>Arcane Signature:</strong> Describe faint runes, weight, and aura.
</div>

## Properties & Charges
- **Passive Effect:** Describe continuous boon.
- **Active Ability (1/Dawn):** Describe tactical trigger or spell effect.

## Provenance
Last glimpsed near [[Ashen Spire]] or [[The Sunken Reliquary]].`,
    `.relic-card {
  background: linear-gradient(135deg, rgba(212,168,83,0.12), rgba(14,17,23,0.9));
  border: 1px solid rgba(212,168,83,0.4);
  padding: 0.8rem 1rem;
  border-radius: 8px;
  margin-bottom: 1rem;
}`
  ),

  Bestiary: makeTemplate(
    'Bestiary',
    'Bestiary Statblock',
    'Size & Creature Type • Habitat & Threat Rating.',
    ['bestiary', 'monster'],
    {
      CR: '5',
      Type: 'Monstrosity',
      Habitat: 'The Glass Shoals',
      AC: 16,
      HP: '110 (13d10 + 39)',
    },
    `<div class="statblock">
  <div class="statblock-row"><span><strong>STR</strong> 18 (+4)</span><span><strong>DEX</strong> 14 (+2)</span><span><strong>CON</strong> 16 (+3)</span><span><strong>INT</strong> 6 (-2)</span><span><strong>WIS</strong> 12 (+1)</span><span><strong>CHA</strong> 8 (-1)</span></div>
</div>

## Traits & Vulnerabilities
- **Amphibious / Darkvision:** Note key senses and resistances.

## Combat Tactics
- Opens with an ambush from fog or reef channels near [[The Glass Shoals]].`,
    `.statblock {
  border: 1px solid rgba(220, 38, 38, 0.45);
  background: rgba(42, 12, 16, 0.55);
  border-radius: 8px;
  padding: 0.75rem 1rem;
  margin-bottom: 1rem;
}
.statblock-row {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  gap: 0.75rem;
  font-family: 'JetBrains Mono', monospace;
  font-size: 0.8rem;
  color: #fca5a5;
}`
  ),

  Deity: makeTemplate(
    'Deity',
    'Deity Pantheon Entry',
    'Domains • Cosmic Epithet & Tenets.',
    ['deity', 'mythology'],
    {
      Domains: 'Tempest, Knowledge',
      Symbol: 'Sunken Crown',
      Alignment: 'Neutral',
    },
    `## Dogma & Edicts
- Core commandments revered by followers.

## Shrines & Clergy
- Worshipped in coastal chapels and ancient ruins like [[The Sunken Reliquary]].`,
    ''
  ),

  Event: makeTemplate(
    'Event',
    'Historical Event',
    'Year / Era • Defining turning point or battle.',
    ['event', 'history'],
    {
      Date: '462 AC',
      Location: 'Oakhaven',
      Outcome: 'Ongoing',
    },
    `## Prelude
What tensions or omens preceded this event?

## Turning Point & Aftermath
Summarize key figures, treaties, and lasting scars on [[Aethelgard (Root World)]].`,
    ''
  ),

  Chronicle: makeTemplate(
    'Chronicle',
    'Chronicle Timeline',
    'Age / Ledger • Chronological record of major campaign milestones.',
    ['chronicle', 'timeline'],
    {
      Era: 'Current Age',
      Calendar: 'After Cinders (AC)',
    },
    `## Timeline Entries
- **Year 0 AC:** Major founding event.
- **Year 462 AC:** Present day.`,
    ''
  ),

  Session: makeTemplate(
    'Session',
    'Session Log',
    'Session # • Key scenes, NPCs met, and loot/clues uncovered.',
    ['session-log'],
    {
      Session: 15,
      Date: 'Next Session',
      PartyLevel: 6,
    },
    `## Session Recap
1. Opening scene in [[Oakhaven]].
2. Major encounter or discovery.

## Clues & Loot
- Track recovered artifacts, gold, and [[WikiLinks]].

## Next Hooks
- Immediate player decisions for next session.`,
    ''
  ),

  PlotThread: makeTemplate(
    'PlotThread',
    'Plot Thread',
    'Mystery or Arc • Active stakes and countdown clock.',
    ['plot', 'arc'],
    {
      Urgency: 'Medium',
      Status: 'Active',
    },
    `## Central Mystery
What question drives this plot thread?

## Escalation Clock
- **Tick 1:** Initial omen.
- **Tick 2:** Faction response.
- **Tick 3:** Crisis point.`,
    ''
  ),

  Quest: makeTemplate(
    'Quest',
    'Quest Contract',
    'Patron • Objective & Offered Reward.',
    ['quest'],
    {
      Patron: 'Kaelen Voss',
      Reward: '500 gp',
      Tier: '2',
      Status: 'Open',
    },
    `## Objective
Clearly state the contract terms and target location.

## Complications
- Rival expedition or environmental hazard.`,
    ''
  ),

  PlayerNote: makeTemplate(
    'PlayerNote',
    'Party Note',
    'Shared party log, inventory, or rumor tracker.',
    ['party-note'],
    {
      Author: 'The Party',
    },
    `## Notes & Reminders
- Track party gold, mounts, and leads.`,
    ''
  ),

  Region: makeTemplate(
    'Region',
    'Region Atlas',
    'Biome & Climate • Defining geography and borders.',
    ['region', 'geography'],
    {
      Climate: 'Temperate',
      HazardLevel: 'Moderate',
    },
    `## Geography & Borders
Describe terrain ridges, waterways, and neighboring zones.

## Settlements & Ruins
- Link notable map pins here.`,
    ''
  ),

  Culture: makeTemplate(
    'Culture',
    'Culture Profile',
    'Traditions, craft, and social structure.',
    ['culture'],
    {
      Homeland: 'The Glass Shoals',
      Language: 'Low Thalassian',
    },
    `## Customs & Craft
- Hospitality rites, attire, and specialized trades.`,
    ''
  ),

  History: makeTemplate(
    'History',
    'Historical Epoch',
    'Time Span • Defining civilization or cataclysm.',
    ['history'],
    {
      Span: 'Unknown Era',
    },
    `## Rise & Legacy
Summarize major empires, monuments, and ruins left behind.`,
    ''
  ),

  Magic: makeTemplate(
    'Magic',
    'Arcane Tradition',
    'School / Phenomenon • Laws, costs, and practitioners.',
    ['magic', 'arcana'],
    {
      Source: 'Ley-Lines',
      Risk: 'Moderate',
    },
    `## Principles & Components
Explain how casters channel this tradition and what happens when it surges.`,
    ''
  ),

  Language: makeTemplate(
    'Language',
    'Language & Script',
    'Spoken Regions • Alphabet and loanwords.',
    ['language'],
    {
      Script: 'Runic',
      Speakers: 'Coastal Scholars',
    },
    `## Phonetics & Sample Phrases
- Common greetings, naval terms, or carved inscriptions.`,
    ''
  ),

  Campaign: makeTemplate(
    'Campaign',
    'Campaign Hub',
    'Sandbox / Adventure Overview • Core premise and house rules.',
    ['campaign'],
    {
      System: '5e / Dark Fantasy Grimoire',
      Status: 'Active',
    },
    `## Campaign Premise
Summarize the central tension and starting hub.`,
    ''
  ),
};
