// The dialogs: logging a Diet Coke at a place, adding a spot that's missing,
// and your own log.
import { fmtDate } from '../../js/time.js';
import { FIZZ, TAGS, STATUSES, validateReport, validatePlace } from './report-model.js';
import { sharing, sendReport, sendPlace, addToLog, removeFromLog, readLog, logStats } from './reports.js';
import { esc, fizzHtml } from './ui.js';

const REPO = 'tobinjstone/dc-happy-hour-map';

let dialog;

function ensureDialog() {
  if (dialog) return dialog;
  dialog = document.createElement('dialog');
  dialog.className = 'dlg';
  document.body.append(dialog);
  dialog.addEventListener('click', (e) => {
    if (e.target === dialog || e.target.closest('[data-close]')) dialog.close();
  });
  dialog.addEventListener('change', (e) => {
    if (e.target.name === 'status') {
      dialog.querySelector('.when-pouring').hidden = e.target.value !== 'pouring';
    }
  });
  return dialog;
}

const head = (title) => `<header class="dlg-head"><h2>${esc(title)}</h2><button type="button" class="dlg-x" data-close aria-label="Close">×</button></header>`;

function fizzFields() {
  return `<div class="when-pouring">
    <h3>How fizzy?</h3>
    <div class="fizz-pick" role="radiogroup" aria-label="Fizz">
      ${[1, 2, 3, 4, 5].map((n) => `<label><input type="radio" name="fizz" value="${n}"><span><b>${n}</b><small>${FIZZ[n]}</small></span></label>`).join('')}
    </div>
    <h3>Anything to know?</h3>
    <div class="tag-pick">${Object.entries(TAGS).map(([k, label]) => `<label><input type="checkbox" name="tags" value="${k}"><span>${esc(label)}</span></label>`).join('')}</div>
    <label class="field"><span>What you paid <em>optional</em></span><input name="price" inputmode="decimal" placeholder="1.29" autocomplete="off"></label>
  </div>`;
}

const noteField = () => '<label class="field"><span>Note <em>optional</em></span><input name="note" maxlength="140" placeholder="Extra syrupy, ask for light ice, etc." autocomplete="off"></label>';

function readReport(form) {
  return {
    status: form.querySelector('[name=status]:checked')?.value || 'pouring',
    fizz: form.querySelector('[name=fizz]:checked')?.value ?? null,
    tags: [...form.querySelectorAll('[name=tags]:checked')].map((i) => i.value),
    price: form.price?.value || '',
    note: form.note.value
  };
}

function hint() {
  return sharing()
    ? 'Shows up for everyone right away, and goes in your log.'
    : 'Goes in your log on this device.';
}

async function busy(form, fn) {
  const err = form.querySelector('.dlg-error');
  const btn = form.querySelector('[type=submit]');
  const label = btn.textContent;
  btn.disabled = true;
  btn.textContent = 'Saving…';
  try {
    await fn();
  } catch (e) {
    err.textContent = e.message;
  } finally {
    btn.disabled = false;
    btn.textContent = label;
  }
}

// ---------- Log a Diet Coke at a place ----------

export function openReport(place, saved) {
  ensureDialog();
  dialog.innerHTML = `<form novalidate>
    ${head('How was it?')}
    <p class="dlg-lede"><strong>${esc(place.name)}</strong>${place.address ? ` · ${esc(place.address)}` : ''}</p>
    <div class="status-pick" role="radiogroup" aria-label="At the fountain">
      <label><input type="radio" name="status" value="pouring" checked><span><b>Got one</b><small>${esc(STATUSES.pouring)}</small></span></label>
      <label><input type="radio" name="status" value="out"><span><b>Out or broken</b><small>Fountain was empty or down</small></span></label>
      <label><input type="radio" name="status" value="none"><span><b>Not here</b><small>${esc(STATUSES.none)}</small></span></label>
    </div>
    ${fizzFields()}
    ${noteField()}
    <p class="dlg-error" role="alert"></p>
    <p class="dlg-hint">${hint()}</p>
    <div class="dlg-actions"><button type="button" class="ghost" data-close>Cancel</button><button type="submit" class="solid">Save</button></div>
  </form>`;
  const form = dialog.querySelector('form');
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const { report, error } = validateReport({ ...readReport(form), place_id: place.id });
    form.querySelector('.dlg-error').textContent = error || '';
    if (error) return;
    busy(form, async () => {
      const entry = { ...report, place_name: place.name, place_address: place.address || '', chain: place.chainKey };
      if (sharing()) {
        const sent = await sendReport(report);
        addToLog({ ...entry, shared_id: sent.id, created_at: sent.created_at });
      } else {
        addToLog(entry);
      }
      dialog.close();
      saved();
    });
  });
  dialog.showModal();
}

// ---------- Add a spot that's missing ----------

export function openAddSpot([lng, lat], saved) {
  ensureDialog();
  dialog.innerHTML = `<form novalidate>
    ${head('Add a spot')}
    <p class="dlg-lede">A place with Diet Coke on the fountain that isn't on the map. The pin goes where you tapped.</p>
    <label class="field"><span>Name</span><input name="name" maxlength="80" required placeholder="Joe's Pizza" autocomplete="off"></label>
    <label class="field"><span>Address <em>optional</em></span><input name="address" maxlength="120" placeholder="1234 14th St NW" autocomplete="off"></label>
    <input type="hidden" name="status" value="pouring">
    ${fizzFields()}
    ${noteField()}
    <p class="dlg-error" role="alert"></p>
    <p class="dlg-hint">${sharing() ? 'Shows up on everyone\'s map right away.' : 'Goes on your map, on this device.'}</p>
    <div class="dlg-actions"><button type="button" class="ghost" data-close>Cancel</button><button type="submit" class="solid">Add it</button></div>
  </form>`;
  const form = dialog.querySelector('form');
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const err = form.querySelector('.dlg-error');
    const checked = validatePlace({ name: form.name.value, address: form.address.value, lat, lng });
    const input = { ...readReport(form), status: 'pouring' };
    const rep = validateReport({ ...input, place_id: 'spot-new' });
    err.textContent = checked.error || rep.error || '';
    if (checked.error || rep.error) return;
    busy(form, async () => {
      const { place } = checked;
      let entry;
      if (sharing()) {
        const out = await sendPlace(place, input);
        entry = { ...rep.report, place_id: out.place.id, shared_id: out.report.id, created_at: out.report.created_at, spot: out.place };
      } else {
        entry = { ...rep.report, place_id: `spot-local-${Math.random().toString(36).slice(2, 10)}`, spot: place };
      }
      addToLog({ ...entry, place_name: place.name, place_address: place.address || '', chain: 'spot' });
      if (sharing()) { dialog.close(); saved(); return; }
      const issue = `https://github.com/${REPO}/issues/new?` + new URLSearchParams({
        title: `Fountain Diet Coke spot: ${place.name}`,
        body: `Name: ${place.name}\nAddress: ${place.address || ''}\nPin: ${place.lat}, ${place.lng}\n\nHow do you know they have fountain Diet Coke?\n`
      });
      dialog.innerHTML = `<div class="dlg-body">
        ${head('Added to your map')}
        <p class="dlg-lede"><strong>${esc(place.name)}</strong> is on your map now, on this device.</p>
        <p class="dlg-lede">Want it on everyone's map? <a href="${esc(issue)}" target="_blank" rel="noopener">Suggest it on GitHub</a> and it'll be added.</p>
        <div class="dlg-actions"><button type="button" class="solid" data-close>Done</button></div>
      </div>`;
      saved();
    });
  });
  dialog.showModal();
  form.name.focus();
}

// ---------- Your log ----------

function csv(list) {
  const cell = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const rows = [['date', 'place', 'address', 'result', 'fizz', 'paid', 'note']];
  for (const e of list) rows.push([e.created_at, e.place_name, e.place_address, e.status, e.fizz ?? '', e.price ?? '', e.note ?? '']);
  return rows.map((r) => r.map(cell).join(',')).join('\n');
}

export function openLog(places, done) {
  ensureDialog();
  const draw = () => {
    const list = readLog();
    const s = logStats(list);
    const known = new Set(places.map((p) => p.id));
    dialog.innerHTML = `<div class="dlg-body">
      ${head('Your Diet Coke log')}
      <div class="stats">
        <div><b>${s.total}</b><span>logged</span></div>
        <div><b>${s.thisMonth}</b><span>this month</span></div>
        <div><b>${s.places}</b><span>${s.places === 1 ? 'place' : 'places'}</span></div>
        <div><b>${s.fizz ?? '–'}</b><span>avg fizz</span></div>
      </div>
      ${s.favorite && s.favorite.count > 1 ? `<p class="dlg-lede">Your regular: <strong>${esc(s.favorite.name)}</strong>, ${s.favorite.count} times.</p>` : ''}
      ${list.length ? `<ol class="log-list">${list.map((e) => `<li>
          <div class="log-top"><strong>${esc(e.place_name || 'A place')}</strong><span class="log-when">${esc(fmtDate(String(e.created_at).slice(0, 10)))}</span></div>
          <div class="log-what">${e.status === 'pouring' ? (e.fizz ? `${fizzHtml(e.fizz)} ${esc(FIZZ[e.fizz])}` : 'Got one') : esc(STATUSES[e.status] || '')}${typeof e.price === 'number' ? ` · $${e.price.toFixed(2)}` : ''}${e.note ? ` · “${esc(e.note)}”` : ''}</div>
          <div class="log-btns">${known.has(e.place_id) ? `<button type="button" class="link" data-show="${esc(e.place_id)}">Show on map</button>` : ''}<button type="button" class="link danger" data-remove="${esc(e.local_id)}">Remove</button></div>
        </li>`).join('')}</ol>`
        : '<p class="dlg-lede">Nothing yet. Tap a place on the map, then "Log a Diet Coke here" each time you get one.</p>'}
      <p class="dlg-hint">Your log lives in this browser. ${sharing() ? 'Your reports are also shared on the map, without your name.' : ''}</p>
      <div class="dlg-actions">
        ${list.length ? '<button type="button" class="ghost" data-csv>Download as CSV</button>' : ''}
        <button type="button" class="solid" data-close>Done</button>
      </div>
    </div>`;
  };
  draw();
  dialog.onclick = (e) => {
    const show = e.target.closest('[data-show]');
    if (show) { dialog.close(); done(show.dataset.show); return; }
    const rm = e.target.closest('[data-remove]');
    if (rm) { removeFromLog(rm.dataset.remove); draw(); done(); return; }
    if (e.target.closest('[data-csv]')) {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([csv(readLog())], { type: 'text/csv' }));
      a.download = 'diet-coke-log.csv';
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    }
  };
  dialog.addEventListener('close', () => { dialog.onclick = null; }, { once: true });
  dialog.showModal();
}
