// The "Edit this bar" form and the version history. Edits go live as soon as
// they're saved; history lets anyone put an earlier version back.
import { DAYS, DAY_LABELS, fmtDate } from './time.js';
import { CATEGORIES, validateEdit } from './edit-model.js';
import { EDITS_API } from './config.js';

const CAT_NAME = { beer: 'Beer', wine: 'Wine', cocktail: 'Cocktails', spirits: 'Rail drinks', food: 'Food', other: 'Other' };
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export const editsEnabled = () => !!EDITS_API;

export async function fetchEdits() {
  if (!EDITS_API) return [];
  try {
    const res = await fetch(`${EDITS_API}/edits`);
    if (!res.ok) return [];
    return (await res.json()).edits || [];
  } catch { return []; }
}

async function post(path, body) {
  const res = await fetch(`${EDITS_API}${path}`, { method: 'POST', body, headers: body instanceof FormData ? {} : { 'Content-Type': 'application/json' } });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Something went wrong saving that. Try again in a minute.');
  return data.edit;
}

// Phone photos are big; shrink to something a menu is still readable at.
async function shrink(file) {
  if (!file || !/^image\/(jpeg|png|webp)$/.test(file.type)) return file;
  try {
    const bmp = await createImageBitmap(file);
    const scale = Math.min(1, 1800 / Math.max(bmp.width, bmp.height));
    if (scale === 1 && file.size < 2.5e6) return file;
    const c = document.createElement('canvas');
    c.width = Math.round(bmp.width * scale);
    c.height = Math.round(bmp.height * scale);
    c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
    const blob = await new Promise((r) => c.toBlob(r, 'image/jpeg', 0.85));
    return blob ? new File([blob], 'menu.jpg', { type: 'image/jpeg' }) : file;
  } catch { return file; }
}

function priceText(d) {
  if (d.price_text) return d.price_text;
  const p = d.price;
  switch (d.kind) {
    case 'flat_price': return p != null ? `$${p}` : '';
    case 'dollars_off': return p != null ? `$${p} off` : '';
    case 'percent_off': return p != null ? `${p}% off` : '';
    case 'half_off': return 'half off';
    case 'bogo': return 'BOGO';
    case 'free': return 'free';
    default: return '';
  }
}

function windowRow(w = { days: [], start: '16:00', end: '19:00', end_label: null }) {
  const endMode = w.end_label === 'all day' ? 'allday' : w.end_label === 'close' ? 'close' : 'time';
  return `<fieldset class="ed-window">
    <legend class="visually-hidden">Days and times</legend>
    <div class="ed-days">${DAYS.map((d) => `<label><input type="checkbox" value="${d}"${w.days?.includes(d) ? ' checked' : ''}><span>${DAY_LABELS[d].slice(0, 2)}</span></label>`).join('')}</div>
    <div class="ed-times">
      <label class="ed-start"${endMode === 'allday' ? ' hidden' : ''}><span>From</span><input type="time" name="start" value="${esc(w.start || '')}"></label>
      <label><span>Until</span><select name="endmode">
        <option value="time"${endMode === 'time' ? ' selected' : ''}>a time</option>
        <option value="close"${endMode === 'close' ? ' selected' : ''}>close</option>
        <option value="allday"${endMode === 'allday' ? ' selected' : ''}>all day</option>
      </select></label>
      <label class="ed-end"${endMode !== 'time' ? ' hidden' : ''}><span class="visually-hidden">End time</span><input type="time" name="end" value="${esc(w.end || '')}"></label>
      <button type="button" class="ed-remove" aria-label="Remove these times">×</button>
    </div>
  </fieldset>`;
}

function dealRow(d = { category: 'beer' }) {
  return `<div class="ed-deal">
    <select name="category" aria-label="Type">${CATEGORIES.map((c) => `<option value="${c}"${d.category === c ? ' selected' : ''}>${CAT_NAME[c]}</option>`).join('')}</select>
    <input name="item" placeholder="What (e.g. draft beers)" value="${esc(d.item || (d.kind || d.price != null ? '' : d.text) || '')}" aria-label="What">
    <input name="price" placeholder="$5, $2 off, half off" value="${esc(priceText(d))}" aria-label="Price">
    <button type="button" class="ed-remove" aria-label="Remove this deal">×</button>
  </div>`;
}

let dialog;
let onSaved;

function ensureDialog() {
  if (dialog) return dialog;
  dialog = document.createElement('dialog');
  dialog.className = 'editor';
  document.body.append(dialog);
  dialog.addEventListener('click', (e) => {
    if (e.target === dialog || e.target.closest('[data-close]')) dialog.close();
    if (e.target.closest('.ed-remove')) e.target.closest('.ed-window, .ed-deal').remove();
    if (e.target.closest('[data-add-window]')) dialog.querySelector('.ed-windows').insertAdjacentHTML('beforeend', windowRow());
    if (e.target.closest('[data-add-deal]')) dialog.querySelector('.ed-deals').insertAdjacentHTML('beforeend', dealRow());
    const restore = e.target.closest('[data-restore]');
    if (restore) doRestore(restore);
  });
  dialog.addEventListener('change', (e) => {
    if (e.target.name === 'endmode') {
      const row = e.target.closest('.ed-window');
      row.querySelector('.ed-end').hidden = e.target.value !== 'time';
      row.querySelector('.ed-start').hidden = e.target.value === 'allday';
    }
    if (e.target.name === 'no_happy_hour') dialog.querySelector('.ed-schedule').hidden = e.target.checked;
    if (e.target.name === 'photo') {
      const f = e.target.files[0];
      dialog.querySelector('.ed-photo-name').textContent = f ? f.name : '';
    }
  });
  dialog.addEventListener('submit', (e) => { e.preventDefault(); save(); });
  return dialog;
}

function readForm(venueId) {
  const f = dialog.querySelector('form');
  return {
    venue_id: venueId,
    no_happy_hour: f.no_happy_hour.checked,
    windows: [...f.querySelectorAll('.ed-window')].map((row) => {
      const mode = row.querySelector('[name=endmode]').value;
      return {
        days: [...row.querySelectorAll('.ed-days input:checked')].map((i) => i.value),
        start: mode === 'allday' ? null : row.querySelector('[name=start]').value,
        end: mode === 'time' ? row.querySelector('[name=end]').value : null,
        end_label: mode === 'allday' ? 'all day' : mode === 'close' ? 'close' : null
      };
    }),
    deals: [...f.querySelectorAll('.ed-deal')].map((row) => ({
      category: row.querySelector('[name=category]').value,
      item: row.querySelector('[name=item]').value,
      price: row.querySelector('[name=price]').value
    })),
    source_url: f.source_url.value,
    staff: f.staff.checked,
    note: f.note.value
  };
}

async function save() {
  const f = dialog.querySelector('form');
  const err = dialog.querySelector('.ed-error');
  const venueId = f.dataset.venue;
  const input = readForm(venueId);
  const photo = f.photo.files[0];
  const { error } = validateEdit(input, { hasPhoto: !!photo });
  err.textContent = error || '';
  if (error) return;
  const btn = f.querySelector('[type=submit]');
  btn.disabled = true;
  btn.textContent = 'Saving…';
  try {
    const body = new FormData();
    body.set('edit', JSON.stringify(input));
    if (photo) body.set('photo', await shrink(photo));
    const edit = await post('/edits', body);
    dialog.close();
    onSaved?.(edit);
  } catch (e) {
    err.textContent = e.message;
  } finally {
    btn.disabled = false;
    btn.textContent = 'Save';
  }
}

export function openEditor(v, saved) {
  ensureDialog();
  onSaved = saved;
  const windows = v.windows.length ? v.windows : [undefined];
  dialog.innerHTML = `<form data-venue="${esc(v.id)}" novalidate>
    <header class="ed-head"><h2>Edit ${esc(v.name)}</h2><button type="button" class="ed-x" data-close aria-label="Close">×</button></header>
    <p class="ed-lede">Your changes show up for everyone right away. Every version is saved, so mistakes are easy to undo.</p>
    <label class="ed-check"><input type="checkbox" name="no_happy_hour"${v.noHappyHour ? ' checked' : ''}> No happy hour here anymore</label>
    <div class="ed-schedule"${v.noHappyHour ? ' hidden' : ''}>
      <h3>When</h3>
      <div class="ed-windows">${windows.map(windowRow).join('')}</div>
      <button type="button" class="ed-add" data-add-window>+ Add other days or times</button>
      <h3>Deals</h3>
      <div class="ed-deals">${(v.deals.length ? v.deals : [undefined]).map(dealRow).join('')}</div>
      <button type="button" class="ed-add" data-add-deal>+ Add a deal</button>
    </div>
    <h3>Where you saw it <span class="ed-req">needed</span></h3>
    <p class="ed-hint">A link to the bar's menu or post, or a photo of the menu or chalkboard.</p>
    <input type="url" name="source_url" placeholder="https://" inputmode="url" aria-label="Link">
    <label class="ed-photo"><input type="file" name="photo" accept="image/*"><span>Add a photo</span><span class="ed-photo-name"></span></label>
    <label class="ed-check"><input type="checkbox" name="staff"> I work here</label>
    <input name="note" placeholder="Anything else? (optional)" aria-label="Note">
    <p class="ed-error" role="alert"></p>
    <div class="ed-actions"><button type="button" class="ed-cancel" data-close>Cancel</button><button type="submit" class="ed-save">Save</button></div>
  </form>`;
  dialog.showModal();
}

function describe(e) {
  if (e.restored_original) return 'Put back to the original listing';
  if (e.no_happy_hour) return 'Marked as no happy hour';
  const n = (e.deals || []).length;
  return `${(e.windows || []).length} time slot${e.windows?.length === 1 ? '' : 's'}, ${n} deal${n === 1 ? '' : 's'}`;
}

export async function openHistory(v, saved) {
  ensureDialog();
  onSaved = saved;
  dialog.innerHTML = `<div class="history" data-venue="${esc(v.id)}">
    <header class="ed-head"><h2>Edit history</h2><button type="button" class="ed-x" data-close aria-label="Close">×</button></header>
    <p class="ed-lede">${esc(v.name)}. If an edit looks wrong, put an earlier version back.</p>
    <ol class="hist-list"><li class="hist-loading">Loading…</li></ol>
    <p class="ed-error" role="alert"></p>
  </div>`;
  dialog.showModal();
  let edits = [];
  try {
    const res = await fetch(`${EDITS_API}/history?venue=${encodeURIComponent(v.id)}`);
    edits = (await res.json()).edits || [];
  } catch { /* shown as empty */ }
  const items = edits.map((e, i) => {
    const src = e.photo_url ? `<a href="${esc(e.photo_url)}" target="_blank" rel="noopener">photo</a>`
      : e.source_url ? `<a href="${esc(e.source_url)}" target="_blank" rel="noopener">link</a>` : '';
    return `<li class="${i === 0 ? 'is-current' : ''}">
      <div><strong>${esc(fmtDate(e.created_at.slice(0, 10)))}</strong> · ${e.staff ? 'staff' : 'visitor'}${src ? ` · ${src}` : ''}${i === 0 ? ' · <em>current</em>' : ''}</div>
      <div class="hist-what">${esc(describe(e))}${e.note ? ` · “${esc(e.note)}”` : ''}</div>
      ${i === 0 ? '' : `<button type="button" class="ed-add" data-restore data-id="${e.id}">Put this version back</button>`}
    </li>`;
  });
  items.push(`<li><div><strong>Original listing</strong> · from the bar's website or menu</div>
    ${edits.length && !edits[0].restored_original ? '<button type="button" class="ed-add" data-restore data-original>Put this version back</button>' : ''}</li>`);
  dialog.querySelector('.hist-list').innerHTML = items.join('');
}

async function doRestore(btn) {
  const venueId = dialog.querySelector('.history').dataset.venue;
  btn.disabled = true;
  try {
    const edit = await post('/restore', JSON.stringify(btn.dataset.original != null ? { original: true, venue_id: venueId } : { edit_id: Number(btn.dataset.id) }));
    dialog.close();
    onSaved?.(edit);
  } catch (e) {
    dialog.querySelector('.ed-error').textContent = e.message;
    btn.disabled = false;
  }
}
