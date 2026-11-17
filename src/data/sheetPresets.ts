import { SheetFieldSchema } from '../types/vault';

export interface SheetPresetDefinition {
  id: string;
  name: string;
  system_label: string;
  html_template: string;
  css_template: string;
  schema_json: SheetFieldSchema;
}

export const SHEET_PRESET_5E: SheetPresetDefinition = {
  id: 'preset-5e-adventurer',
  name: '5e Fantasy Adventurer',
  system_label: '5e Fantasy',
  html_template: `<div class="sheet-wrap">
  <header class="sheet-header">
    <div class="field-group grow">
      <label>Character Name</label>
      <input type="text" name="attr_char_name" placeholder="Name..." />
    </div>
    <div class="field-group">
      <label>Class &amp; Level</label>
      <input type="text" name="attr_class_level" placeholder="Ranger 3" />
    </div>
    <div class="field-group small">
      <label>Prof</label>
      <input type="number" name="attr_prof" value="2" />
    </div>
    <div class="field-group small">
      <label>AC</label>
      <input type="number" name="attr_ac" value="14" />
    </div>
    <div class="field-group small">
      <label>HP</label>
      <input type="number" name="attr_hp" value="24" />
    </div>
    <div class="field-group small">
      <label>Max HP</label>
      <input type="number" name="attr_max_hp" value="24" />
    </div>
  </header>

  <section class="abilities-grid">
    <div class="ability-box">
      <span class="ability-title">STR</span>
      <input type="number" name="attr_str" value="14" />
      <span class="mod-badge" data-computed="str_mod">+2</span>
      <button type="button" data-roll="1d20+@{str_mod}" data-label="Strength Check">Check</button>
    </div>
    <div class="ability-box">
      <span class="ability-title">DEX</span>
      <input type="number" name="attr_dex" value="16" />
      <span class="mod-badge" data-computed="dex_mod">+3</span>
      <button type="button" data-roll="1d20+@{dex_mod}" data-label="Dexterity Check">Check</button>
    </div>
    <div class="ability-box">
      <span class="ability-title">CON</span>
      <input type="number" name="attr_con" value="14" />
      <span class="mod-badge" data-computed="con_mod">+2</span>
      <button type="button" data-roll="1d20+@{con_mod}" data-label="Constitution Check">Check</button>
    </div>
    <div class="ability-box">
      <span class="ability-title">INT</span>
      <input type="number" name="attr_int" value="10" />
      <span class="mod-badge" data-computed="int_mod">+0</span>
      <button type="button" data-roll="1d20+@{int_mod}" data-label="Intelligence Check">Check</button>
    </div>
    <div class="ability-box">
      <span class="ability-title">WIS</span>
      <input type="number" name="attr_wis" value="14" />
      <span class="mod-badge" data-computed="wis_mod">+2</span>
      <button type="button" data-roll="1d20+@{wis_mod}" data-label="Wisdom Check">Check</button>
    </div>
    <div class="ability-box">
      <span class="ability-title">CHA</span>
      <input type="number" name="attr_cha" value="10" />
      <span class="mod-badge" data-computed="cha_mod">+0</span>
      <button type="button" data-roll="1d20+@{cha_mod}" data-label="Charisma Check">Check</button>
    </div>
  </section>

  <section class="combat-bar">
    <button type="button" class="roll-primary" data-roll="1d20+@{dex_mod}" data-label="Initiative">Roll Initiative</button>
    <button type="button" class="roll-primary" data-roll="1d20+@{wis_mod}+@{prof}" data-label="Perception">Perception ([[1d20+@{wis_mod}+@{prof}]])</button>
    <button type="button" class="roll-primary" data-roll="1d20+@{str_mod}+@{prof}" data-label="Melee Attack">Melee Attack</button>
  </section>

  <section class="repeating-section">
    <h3>Attacks &amp; Gear</h3>
    <fieldset class="repeating_attacks">
      <div class="repeat-row">
        <input type="text" name="attr_name" placeholder="Weapon or Spell" />
        <input type="text" name="attr_attack_formula" placeholder="1d20+5" />
        <input type="text" name="attr_damage_formula" placeholder="1d8+3" />
        <button type="button" data-roll="@{attack_formula}" data-label="@{name} Attack">Hit</button>
        <button type="button" data-roll="@{damage_formula}" data-label="@{name} Damage">Dmg</button>
      </div>
    </fieldset>
  </section>

  <section class="notes-section">
    <h3>Features &amp; Background</h3>
    <textarea name="attr_notes" rows="4" placeholder="Class features, oath, inventory notes..."></textarea>
  </section>
</div>`,
  css_template: `.sheet-wrap {
  font-family: 'Inter', system-ui, sans-serif;
  color: #e7e2d8;
  background: #0c0f15;
  padding: 16px;
  border-radius: 10px;
  border: 1px solid #242b38;
}
.sheet-header {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  margin-bottom: 14px;
  padding-bottom: 12px;
  border-bottom: 1px solid #1e2430;
}
.field-group { display: flex; flex-direction: column; gap: 4px; min-width: 110px; }
.field-group.grow { flex: 1 1 180px; }
.field-group.small { min-width: 64px; width: 72px; }
label { font-size: 10px; text-transform: uppercase; letter-spacing: 0.08em; color: #9aa3b2; }
input, textarea {
  background: #07090d;
  border: 1px solid #222936;
  border-radius: 6px;
  color: #f3ead8;
  padding: 6px 8px;
  font-size: 13px;
}
input:focus, textarea:focus { outline: none; border-color: #d4a853; }
.abilities-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(92px, 1fr));
  gap: 10px;
  margin-bottom: 14px;
}
.ability-box {
  background: #10141c;
  border: 1px solid #1f2633;
  border-radius: 8px;
  padding: 8px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
}
.ability-title { font-size: 11px; font-weight: 700; color: #d4a853; letter-spacing: 0.08em; }
.ability-box input { width: 56px; text-align: center; font-weight: 600; }
.mod-badge {
  font-size: 12px;
  font-weight: 700;
  color: #f3ead8;
  background: #1a202c;
  padding: 2px 8px;
  border-radius: 999px;
}
button {
  background: #1a202c;
  color: #d4a853;
  border: 1px solid #d4a85355;
  border-radius: 6px;
  padding: 4px 10px;
  font-size: 11px;
  font-weight: 600;
  cursor: pointer;
}
button:hover { background: #d4a85322; }
.combat-bar { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 14px; }
.repeating-section, .notes-section { margin-top: 12px; }
h3 { font-size: 12px; text-transform: uppercase; letter-spacing: 0.08em; color: #d4a853; margin: 0 0 8px 0; }
.repeat-row { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; margin-bottom: 6px; }
.notes-section textarea { width: 100%; box-sizing: border-box; }`,
  schema_json: {
    defaults: {
      char_name: 'New Adventurer',
      class_level: 'Adventurer 1',
      prof: 2,
      ac: 14,
      hp: 20,
      max_hp: 20,
      str: 14,
      dex: 14,
      con: 12,
      int: 10,
      wis: 12,
      cha: 10,
      notes: '',
    },
    computed: {
      str_mod: 'floor((@{str} - 10) / 2)',
      dex_mod: 'floor((@{dex} - 10) / 2)',
      con_mod: 'floor((@{con} - 10) / 2)',
      int_mod: 'floor((@{int} - 10) / 2)',
      wis_mod: 'floor((@{wis} - 10) / 2)',
      cha_mod: 'floor((@{cha} - 10) / 2)',
    },
    rolls: {
      initiative: '1d20+@{dex_mod}',
      perception: '1d20+@{wis_mod}+@{prof}',
    },
  },
};

export const SHEET_PRESET_MINIMAL: SheetPresetDefinition = {
  id: 'preset-minimal-narrative',
  name: 'Minimal Narrative Sheet',
  system_label: 'Minimal Narrative',
  html_template: `<div class="min-sheet">
  <h2><input type="text" name="attr_char_name" placeholder="Character Name" /></h2>
  <div class="row">
    <label>Concept <input type="text" name="attr_concept" placeholder="Exiled Cartographer" /></label>
    <label>Resolve <input type="number" name="attr_resolve" value="3" /></label>
    <label>Stress <input type="number" name="attr_stress" value="0" /></label>
    <button type="button" data-roll="2d6+@{resolve}" data-label="Action Roll">Roll 2d6 + Resolve</button>
  </div>
  <fieldset class="repeating_traits">
    <div class="row">
      <input type="text" name="attr_trait" placeholder="Aspect or Trait" />
      <input type="number" name="attr_bonus" value="1" />
      <button type="button" data-roll="2d6+@{bonus}" data-label="@{trait}">Invoke</button>
    </div>
  </fieldset>
  <textarea name="attr_bonds" rows="4" placeholder="Bonds, scars, and inventory..."></textarea>
</div>`,
  css_template: `.min-sheet {
  font-family: Georgia, serif;
  color: #efe9dc;
  background: #0d1016;
  padding: 16px;
  border-radius: 10px;
  border: 1px solid #2b3240;
}
.row { display: flex; flex-wrap: wrap; gap: 10px; align-items: center; margin-bottom: 10px; }
label { display: flex; flex-direction: column; gap: 4px; font-size: 11px; color: #b68d40; }
input, textarea {
  background: #06080b;
  border: 1px solid #242a35;
  border-radius: 6px;
  color: #f3ead8;
  padding: 6px 8px;
}
textarea { width: 100%; box-sizing: border-box; margin-top: 8px; }
button {
  background: #b68d40;
  color: #090b0f;
  border: none;
  border-radius: 6px;
  padding: 7px 12px;
  font-weight: 700;
  cursor: pointer;
}`,
  schema_json: {
    defaults: {
      char_name: 'Wanderer',
      concept: 'Relic Seeker',
      resolve: 2,
      stress: 0,
      bonds: '',
    },
    computed: {
      remaining_resolve: 'max(0, @{resolve} - @{stress})',
    },
    rolls: {
      action: '2d6+@{resolve}',
    },
  },
};

export const SHEET_PRESETS: SheetPresetDefinition[] = [
  SHEET_PRESET_5E,
  SHEET_PRESET_MINIMAL,
];
