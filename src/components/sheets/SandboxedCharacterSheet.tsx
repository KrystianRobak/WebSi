import React, { useEffect, useId, useMemo, useRef, useState } from 'react';
import { computeSheetState, interpolateSheetRoll, sanitizeSheetCss, sanitizeSheetHtml } from '../../lib/sheetEngine';
import { useVaultStore } from '../../store/useVaultStore';
import { CharacterSheetTemplate, SheetAttributeValue } from '../../types/vault';

interface SandboxedCharacterSheetProps {
  template: Pick<CharacterSheetTemplate, 'id' | 'name' | 'html_template' | 'css_template' | 'schema_json'>;
  attributes: Record<string, SheetAttributeValue>;
  characterId?: string | null;
  readOnly?: boolean;
  onChangeAttributes?: (nextAttrs: Record<string, SheetAttributeValue>) => void;
  onRollTriggered?: (expression: string, label: string) => void;
  minHeight?: number;
}

export const SandboxedCharacterSheet: React.FC<SandboxedCharacterSheetProps> = ({
  template,
  attributes,
  characterId = null,
  readOnly = false,
  onChangeAttributes,
  onRollTriggered,
  minHeight = 420,
}) => {
  const instanceId = useId();
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const rollDiceAndPublish = useVaultStore((s) => s.rollDiceAndPublish);
  const setDiceDrawerOpen = useVaultStore((s) => s.setDiceDrawerOpen);
  const [frameHeight, setFrameHeight] = useState(minHeight);
  const [readyDocKey, setReadyDocKey] = useState<string | null>(null);
  const [hydratedDocKey, setHydratedDocKey] = useState<string | null>(null);

  const docKey = useMemo(() => {
    const raw = `${template.html_template || ''}\0${template.css_template || ''}`;
    let hash = 5381;
    for (let i = 0; i < raw.length; i += 1) {
      hash = ((hash << 5) + hash) ^ raw.charCodeAt(i);
    }
    return `${instanceId}:${hash >>> 0}`;
  }, [instanceId, template.html_template, template.css_template]);

  const iframeReady = readyDocKey === docKey;
  const iframeHydrated = hydratedDocKey === docKey;

  const latestPropsRef = useRef({
    attributes,
    schema: template.schema_json,
    characterId,
    readOnly,
    docKey,
    onChangeAttributes,
    onRollTriggered,
  });
  latestPropsRef.current = {
    attributes,
    schema: template.schema_json,
    characterId,
    readOnly,
    docKey,
    onChangeAttributes,
    onRollTriggered,
  };

  const { merged, computed } = useMemo(
    () => computeSheetState(attributes, template.schema_json),
    [attributes, template.schema_json]
  );

  const srcDoc = useMemo(() => {
    const cleanHtml = sanitizeSheetHtml(template.html_template || '<div class="sheet-empty">Empty sheet HTML</div>');
    const cleanCss = sanitizeSheetCss(template.css_template || '');
    const safeInstanceId = JSON.stringify(instanceId);
    const safeDocKey = JSON.stringify(docKey);

    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; img-src https: data: blob:;" />
<style>
  html, body {
    margin: 0;
    padding: 0;
    background: transparent;
    color: #e7e2d8;
    font-family: 'Inter', system-ui, sans-serif;
  }
  * { box-sizing: border-box; }
  .vault-repeat-item {
    display: flex;
    align-items: center;
    gap: 6px;
    margin-bottom: 6px;
  }
  .vault-repeat-item > .vault-repeat-body { flex: 1; min-width: 0; }
  .vault-repeat-del {
    background: #281416;
    color: #f87171;
    border: 1px solid rgba(248, 113, 113, 0.35);
    border-radius: 5px;
    padding: 4px 8px;
    cursor: pointer;
    font-size: 11px;
    line-height: 1;
    flex-shrink: 0;
  }
  .vault-repeat-add {
    margin-top: 6px;
    background: #141821;
    color: #d4a853;
    border: 1px solid rgba(212, 168, 83, 0.45);
    border-radius: 6px;
    padding: 5px 10px;
    font-size: 11px;
    font-weight: 600;
    cursor: pointer;
  }
  ${cleanCss}
</style>
</head>
<body>
<div id="vault-sheet-root">${cleanHtml}</div>
<script>
(function() {
  var INSTANCE_ID = ${safeInstanceId};
  var DOC_KEY = ${safeDocKey};
  var root = document.getElementById('vault-sheet-root');
  var currentAttrs = {};
  var currentComputed = {};
  var isReadOnly = false;
  var repeatingTemplates = {};

  function post(type, extra) {
    var msg = { type: type, instanceId: INSTANCE_ID, docKey: DOC_KEY };
    if (extra) {
      for (var k in extra) {
        if (Object.prototype.hasOwnProperty.call(extra, k)) msg[k] = extra[k];
      }
    }
    window.parent.postMessage(msg, '*');
  }

  function setupRepeatingSections() {
    var fieldsets = root.querySelectorAll('fieldset');
    for (var i = 0; i < fieldsets.length; i++) {
      var fs = fieldsets[i];
      var cls = Array.prototype.find.call(fs.classList || [], function(c) {
        return c.indexOf('repeating_') === 0;
      });
      if (!cls) continue;
      repeatingTemplates[cls] = fs.innerHTML;
      fs.innerHTML = '';
      fs.setAttribute('data-repeating-section', cls);
      var listEl = document.createElement('div');
      listEl.className = 'vault-repeat-list';
      listEl.setAttribute('data-repeat-list', cls);
      fs.appendChild(listEl);

      var addBtn = document.createElement('button');
      addBtn.type = 'button';
      addBtn.className = 'vault-repeat-add';
      addBtn.setAttribute('data-repeat-add', cls);
      addBtn.textContent = '+ Add Row';
      fs.appendChild(addBtn);
    }
  }

  function setInputVal(el, val) {
    if (!el) return;
    if (document.activeElement === el) return;
    if (el.type === 'checkbox') {
      el.checked = Boolean(val);
    } else if (el.type === 'radio') {
      el.checked = String(el.value) === String(val);
    } else {
      var str = val === undefined || val === null ? '' : String(val);
      if (el.value !== str) el.value = str;
    }
  }

  function formatComputed(key, val) {
    if (typeof val === 'number') {
      if (key.slice(-4) === '_mod' || key.indexOf('bonus') >= 0) {
        return (val >= 0 ? '+' : '') + String(val);
      }
      return String(val);
    }
    return val === undefined || val === null ? '' : String(val);
  }

  function renderRepeatingSection(sectionKey, rows) {
    var listEl = root.querySelector('[data-repeat-list="' + sectionKey + '"]');
    var addBtn = root.querySelector('[data-repeat-add="' + sectionKey + '"]');
    if (!listEl) return;
    if (addBtn) addBtn.style.display = isReadOnly ? 'none' : '';

    var arr = Array.isArray(rows) ? rows : [];
    var existingNodes = Array.prototype.slice.call(listEl.children);
    var existingIds = existingNodes.map(function(n) { return n.getAttribute('data-row-id'); });
    var nextIds = arr.map(function(r, idx) { return (r && r.id) ? String(r.id) : 'row-' + idx; });
    var sameShape = existingIds.length === nextIds.length && existingIds.every(function(id, idx) { return id === nextIds[idx]; });

    if (!sameShape) {
      listEl.innerHTML = '';
      for (var i = 0; i < arr.length; i++) {
        var rowObj = arr[i] || {};
        var rowId = nextIds[i];
        var wrapper = document.createElement('div');
        wrapper.className = 'vault-repeat-item';
        wrapper.setAttribute('data-row-id', rowId);
        wrapper.setAttribute('data-section', sectionKey);

        var body = document.createElement('div');
        body.className = 'vault-repeat-body';
        body.innerHTML = repeatingTemplates[sectionKey] || '';
        wrapper.appendChild(body);

        if (!isReadOnly) {
          var delBtn = document.createElement('button');
          delBtn.type = 'button';
          delBtn.className = 'vault-repeat-del';
          delBtn.setAttribute('data-repeat-del', rowId);
          delBtn.setAttribute('data-section', sectionKey);
          delBtn.title = 'Remove row';
          delBtn.textContent = '×';
          wrapper.appendChild(delBtn);
        }
        listEl.appendChild(wrapper);
      }
    }

    var rowWrappers = listEl.querySelectorAll('.vault-repeat-item');
    for (var j = 0; j < rowWrappers.length; j++) {
      var wrap = rowWrappers[j];
      var rData = arr[j] || {};
      var fields = wrap.querySelectorAll('[name^="attr_"]');
      for (var k = 0; k < fields.length; k++) {
        var fieldEl = fields[k];
        var attrName = fieldEl.getAttribute('name').slice(5);
        setInputVal(fieldEl, rData[attrName]);
        fieldEl.disabled = isReadOnly;
      }
    }
  }

  function hydrate(payload) {
    currentAttrs = payload.attributes || {};
    currentComputed = payload.computed || {};
    isReadOnly = Boolean(payload.readOnly);

    var topInputs = root.querySelectorAll('[name^="attr_"]');
    for (var i = 0; i < topInputs.length; i++) {
      var el = topInputs[i];
      if (el.closest('[data-repeating-section]')) continue;
      var key = el.getAttribute('name').slice(5);
      var hasAttr = Object.prototype.hasOwnProperty.call(currentAttrs, key) && currentAttrs[key] !== undefined;
      var hasComp = Object.prototype.hasOwnProperty.call(currentComputed, key);
      var inputVal;
      if (hasComp && (el.readOnly || !hasAttr)) {
        inputVal = currentComputed[key];
      } else if (hasAttr) {
        inputVal = currentAttrs[key];
      } else if (el.type === 'checkbox') {
        inputVal = el.defaultChecked;
      } else if (el.type === 'radio') {
        inputVal = el.defaultChecked ? el.value : undefined;
      } else {
        inputVal = el.getAttribute('value') !== null ? el.defaultValue : undefined;
      }
      setInputVal(el, inputVal);
      el.disabled = isReadOnly;
    }

    var compEls = root.querySelectorAll('[data-computed]');
    for (var c = 0; c < compEls.length; c++) {
      var cel = compEls[c];
      var ckey = cel.getAttribute('data-computed');
      if (ckey && Object.prototype.hasOwnProperty.call(currentComputed, ckey)) {
        cel.textContent = formatComputed(ckey, currentComputed[ckey]);
      }
    }

    for (var sec in repeatingTemplates) {
      if (Object.prototype.hasOwnProperty.call(repeatingTemplates, sec)) {
        renderRepeatingSection(sec, currentAttrs[sec]);
      }
    }
  }

  function readInputVal(el) {
    if (el.type === 'checkbox') return Boolean(el.checked);
    if (el.type === 'number') {
      var trimmed = el.value.trim();
      if (trimmed === '') return '';
      var n = Number(trimmed);
      return isNaN(n) ? el.value : n;
    }
    return el.value;
  }

  root.addEventListener('input', function(e) {
    if (isReadOnly) return;
    var el = e.target;
    if (!el || !el.getAttribute) return;
    var name = el.getAttribute('name');
    if (!name || name.indexOf('attr_') !== 0) return;
    var key = name.slice(5);
    var next = Object.assign({}, currentAttrs);
    var repeatItem = el.closest('.vault-repeat-item');
    if (repeatItem) {
      var sec = repeatItem.getAttribute('data-section');
      var rowId = repeatItem.getAttribute('data-row-id');
      var rows = Array.isArray(next[sec]) ? next[sec].slice() : [];
      for (var i = 0; i < rows.length; i++) {
        if (String(rows[i].id) === String(rowId)) {
          rows[i] = Object.assign({}, rows[i]);
          rows[i][key] = readInputVal(el);
        }
      }
      next[sec] = rows;
    } else {
      next[key] = readInputVal(el);
    }
    currentAttrs = next;
    post('sheet:update', { attributes: next });
  });

  root.addEventListener('change', function(e) {
    if (isReadOnly) return;
    var el = e.target;
    if (!el || (el.type !== 'checkbox' && el.type !== 'radio' && el.tagName !== 'SELECT')) return;
    el.dispatchEvent(new Event('input', { bubbles: true }));
  });

  root.addEventListener('click', function(e) {
    var target = e.target;
    if (!target || !target.closest) return;

    var addBtn = target.closest('[data-repeat-add]');
    if (addBtn && !isReadOnly) {
      var sec = addBtn.getAttribute('data-repeat-add');
      var rows = Array.isArray(currentAttrs[sec]) ? currentAttrs[sec].slice() : [];
      rows.push({ id: 'row-' + Date.now() + '-' + Math.floor(Math.random() * 1000) });
      var next = Object.assign({}, currentAttrs);
      next[sec] = rows;
      currentAttrs = next;
      renderRepeatingSection(sec, rows);
      post('sheet:update', { attributes: next });
      reportHeight();
      return;
    }

    var delBtn = target.closest('[data-repeat-del]');
    if (delBtn && !isReadOnly) {
      var delSec = delBtn.getAttribute('data-section');
      var delId = delBtn.getAttribute('data-repeat-del');
      var rows2 = Array.isArray(currentAttrs[delSec]) ? currentAttrs[delSec].filter(function(r) {
        return String(r.id) !== String(delId);
      }) : [];
      var next2 = Object.assign({}, currentAttrs);
      next2[delSec] = rows2;
      currentAttrs = next2;
      renderRepeatingSection(delSec, rows2);
      post('sheet:update', { attributes: next2 });
      reportHeight();
      return;
    }

    var rollBtn = target.closest('[data-roll]');
    if (rollBtn) {
      var expr = rollBtn.getAttribute('data-roll') || '';
      var label = rollBtn.getAttribute('data-label') || rollBtn.getAttribute('data-roll-label') || rollBtn.textContent || 'Sheet Roll';
      var rowAttrs = null;
      var repeatWrap = rollBtn.closest('.vault-repeat-item');
      if (repeatWrap) {
        var rSec = repeatWrap.getAttribute('data-section');
        var rId = repeatWrap.getAttribute('data-row-id');
        var list = Array.isArray(currentAttrs[rSec]) ? currentAttrs[rSec] : [];
        for (var k = 0; k < list.length; k++) {
          if (String(list[k].id) === String(rId)) {
            rowAttrs = list[k];
            break;
          }
        }
      }
      post('sheet:roll', { expression: expr, label: label.trim(), rowAttrs: rowAttrs });
    }
  });

  window.addEventListener('message', function(ev) {
    if (!ev.data || ev.data.instanceId !== INSTANCE_ID) return;
    if (ev.data.type === 'sheet:hydrate') {
      hydrate(ev.data);
      var finalH = reportHeight();
      post('sheet:hydrated', { height: finalH });
    }
  });

  function reportHeight() {
    var contentH = (root && root.scrollHeight) || (document.body && document.body.scrollHeight) || 420;
    var h = Math.max(260, contentH);
    var finalH = h + 16;
    post('sheet:resize', { height: finalH });
    return finalH;
  }

  setupRepeatingSections();
  if (typeof ResizeObserver !== 'undefined') {
    var ro = new ResizeObserver(reportHeight);
    ro.observe(root);
  }
  post('sheet:ready');
})();
</script>
</body>
</html>`;
  }, [instanceId, docKey, template.html_template, template.css_template]);

  useEffect(() => {
    if (!iframeReady || !iframeRef.current?.contentWindow) return;
    iframeRef.current.contentWindow.postMessage(
      {
        type: 'sheet:hydrate',
        instanceId,
        docKey,
        attributes: merged,
        computed,
        readOnly,
      },
      '*'
    );
  }, [iframeReady, instanceId, docKey, merged, computed, readOnly]);

  useEffect(() => {
    const onMessage = async (event: MessageEvent) => {
      if (!iframeRef.current || event.source !== iframeRef.current.contentWindow) return;
      const data = event.data;
      if (!data || data.instanceId !== instanceId) return;

      if (data.type === 'sheet:ready') {
        if (typeof data.docKey === 'string' && data.docKey === latestPropsRef.current.docKey) {
          setReadyDocKey(data.docKey);
        }
        return;
      }

      if (data.type === 'sheet:hydrated') {
        if (typeof data.height === 'number') {
          setFrameHeight(Math.max(minHeight, Math.min(2600, Math.round(data.height))));
        }
        if (typeof data.docKey === 'string' && data.docKey === latestPropsRef.current.docKey) {
          setHydratedDocKey(data.docKey);
        }
        return;
      }

      if (data.type === 'sheet:resize' && typeof data.height === 'number') {
        setFrameHeight(Math.max(minHeight, Math.min(2600, Math.round(data.height))));
        return;
      }

      if (data.type === 'sheet:update' && data.attributes && typeof data.attributes === 'object') {
        if (latestPropsRef.current.readOnly) return;
        latestPropsRef.current.onChangeAttributes?.(data.attributes as Record<string, SheetAttributeValue>);
        return;
      }

      if (data.type === 'sheet:roll' && typeof data.expression === 'string') {
        const cur = latestPropsRef.current;
        const resolvedExpr = interpolateSheetRoll(
          data.expression,
          cur.attributes,
          cur.schema,
          data.rowAttrs || undefined
        );
        const resolvedLabel = interpolateSheetRoll(
          typeof data.label === 'string' && data.label ? data.label : 'Sheet Roll',
          cur.attributes,
          cur.schema,
          data.rowAttrs || undefined
        );
        if (cur.onRollTriggered) {
          cur.onRollTriggered(resolvedExpr, resolvedLabel);
        } else {
          setDiceDrawerOpen(true);
          await rollDiceAndPublish(resolvedExpr, {
            label: resolvedLabel,
            characterId: cur.characterId,
          });
        }
      }
    };

    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [instanceId, minHeight, rollDiceAndPublish, setDiceDrawerOpen]);

  return (
    <iframe
      ref={iframeRef}
      title={`${template.name} Sheet`}
      sandbox="allow-scripts"
      data-hydrated={iframeHydrated ? 'true' : 'false'}
      srcDoc={srcDoc}
      style={{ height: `${frameHeight}px` }}
      className="w-full border-0 rounded-lg bg-transparent"
    />
  );
};
