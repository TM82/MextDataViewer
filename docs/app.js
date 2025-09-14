// --- Helpers ---
function setStatus(msg){ const el=document.getElementById('status'); if(el) el.textContent = msg || ''; }
async function fetchText(url){ const res = await fetch(url); if(!res.ok) throw new Error(`HTTP ${res.status} for ${url}`); return await res.text(); }
async function fetchJSON(url){ const txt = await fetchText(url); try{ return JSON.parse(txt); }catch(e){ throw new Error(`JSON parse error for ${url}: `+e.message); } }
function parseTable(text){ if(text.length && text.charCodeAt(0) === 0xFEFF){ text = text.slice(1); } const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n').filter(l => l.trim()!==''); if(lines.length===0) return []; const delim = (lines[0].includes('\t')) ? '\t' : ','; return lines.map(line => line.split(delim)); }
function toNumber(val){ if(val==null) return NaN; const s = String(val).replace(/,/g,'').trim(); const m = s.match(/-?\d+(?:\.\d+)?/); return m ? parseFloat(m[0]) : NaN; }
function isNumericColumn(rows, c){ for(let r=1;r<rows.length;r++){ const v = rows[r][c]; if(v==='' || v==null) continue; if(!Number.isFinite(toNumber(v))) return false; } return true; }
function esc(t){ return String(t).replace(/[&<>"']/g, s => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[s])); }
function looksLikeUrl(s){ return /^https?:\/\//i.test(String(s||'')); }
function uniqueValues(rows, colIdx){ const set = new Set(); for(let i=1;i<rows.length;i++){ set.add(rows[i][colIdx] ?? ''); } return Array.from(set); }

// --- Elements & State ---
let folderSel, fileSel, rowSel, colSel, tableEl, notesBox, popoverEl;
let manifest=null, fullRows=null;
let sortState = { col:null, dir:null };
let metaByPath = Object.create(null);

// filters
let columnFilters = {}; // colIdx -> Set(allowed values)

// pipeline datasets
let baseRows = null;     // after row/col single-select
let filteredRows = null; // after column filters

// --- Rendering ---
function renderTable(rows){
  tableEl.innerHTML='';
  if(!rows || rows.length===0){ tableEl.textContent='データなし'; return; }
  const thead=document.createElement('thead'); const trh=document.createElement('tr');
  rows[0].forEach((h, idx) => { 
    const th=document.createElement('th'); 
    th.dataset.colIndex = String(idx);
    const inner = document.createElement('div'); inner.className='th-inner';
    const title = document.createElement('span'); title.className='col-title'; title.textContent = h;
    const sort = document.createElement('span'); sort.className='sort-ind';
    const btn = document.createElement('button'); btn.type='button'; btn.className='filter-btn'; btn.textContent='▾';
    btn.addEventListener('click', (ev)=>{ ev.stopPropagation(); openFilterPopover(idx, th); });
    inner.appendChild(title); inner.appendChild(sort); inner.appendChild(btn);
    th.appendChild(inner);
    if(columnFilters[idx]) th.classList.add('filtered');
    trh.appendChild(th); 
  });
  if(Number.isInteger(sortState.col)){
    const ths = trh.children;
    for(let i=0;i<ths.length;i++){ ths[i].classList.remove('sort-asc','sort-desc'); }
    const th = ths[sortState.col];
    if(th){ th.classList.add(sortState.dir === 'asc' ? 'sort-asc' : 'sort-desc'); }
  }
  thead.appendChild(trh); tableEl.appendChild(thead);

  const tbody=document.createElement('tbody');
  for(let r=1;r<rows.length;r++){
    const tr=document.createElement('tr');
    rows[r].forEach(v => { const td=document.createElement('td'); td.textContent=v; tr.appendChild(td); });
    tbody.appendChild(tr);
  }
  tableEl.appendChild(tbody);

  // sort handlers
  trh.querySelectorAll('th').forEach(th => {
    th.addEventListener('click', () => onSortHeaderClick(parseInt(th.dataset.colIndex,10)));
  });
}

// Sorting
function sortRows(rows, c, dir){
  if(rows.length<=2) return rows;
  const header = rows[0]; const body = rows.slice(1);
  const numeric = isNumericColumn(rows, c); const asc = dir === 'asc';
  body.sort((a,b)=>{ const va = a[c]; const vb = b[c];
    if(numeric){ const na = toNumber(va); const nb = toNumber(vb); const aNaN = !Number.isFinite(na); const bNaN = !Number.isFinite(nb);
      if(aNaN && bNaN) return 0; if(aNaN) return 1; if(bNaN) return -1; return asc ? (na-nb) : (nb-na); }
    else{ const sCmp = String(va).localeCompare(String(vb), 'ja', { numeric:true, sensitivity:'base' }); return asc ? sCmp : -sCmp; }
  });
  return [header, ...body];
}
function applySortAndRender(){
  let rows = filteredRows || baseRows || fullRows;
  if(!rows){ tableEl.innerHTML=''; return; }
  if(sortState.col==null || sortState.dir==null){
    renderTable(rows);
  }else{
    const sorted = sortRows(rows.map(r=>r.slice()), sortState.col, sortState.dir);
    renderTable(sorted);
  }
}
function onSortHeaderClick(colIdx){
  if(sortState.col !== colIdx){
    sortState = { col: colIdx, dir: 'asc' };
  }else{
    if(sortState.dir === 'asc') sortState.dir = 'desc';
    else if(sortState.dir === 'desc') sortState = { col: null, dir: null };
    else sortState.dir = 'asc';
  }
  applySortAndRender();
}

// --- Notes rendering ---
function renderNotesForPath(path){
  const meta = metaByPath[path];
  if(!meta || !meta.notes){ notesBox.innerHTML = ''; return; }
  const notes = meta.notes;
  let html = '<strong>出典:</strong> ';
  function itemToHtml(n){
    if(!n) return '';
    if(typeof n === 'string'){ if(looksLikeUrl(n)) return `<a href="${esc(n)}" target="_blank" rel="noopener">${esc(n)}</a>`; return esc(n); }
    if(typeof n === 'object'){ const url = n.url; const label = n.label || n.title || url || ''; const extra = n.desc ? ` — ${esc(n.desc)}` : ''; if(url && looksLikeUrl(url)){ return `<a href="${esc(url)}" target="_blank" rel="noopener">${esc(label)}</a>${extra}`; } else { return esc(label + (n.desc ? ' — ' + n.desc : '')); } }
    return '';
  }
  if(Array.isArray(notes)){ html += '<ul>'; for(const n of notes){ const li = itemToHtml(n); if(li) html += `<li>${li}</li>`; } html += '</ul>'; }
  else { html += itemToHtml(notes); }
  notesBox.innerHTML = html;
}

// --- Row/Col single-select filtering ---
function computeBaseRows(){
  if(!fullRows) return null;
  const header = fullRows[0];
  const body = fullRows.slice(1);
  const rowVal = rowSel.value;
  const colVal = colSel.value;

  if(!rowVal && !colVal){
    return fullRows;
  }
  if(rowVal && !colVal){
    const out = [header];
    for(const r of body){ if(r[0] === rowVal){ out.push(r); break; } }
    return out;
  }
  if(!rowVal && colVal){
    const cIdx = header.indexOf(colVal);
    const out = [[header[0], header[cIdx]]];
    for(const r of body){ out.push([r[0], r[cIdx]]); }
    return out;
  }
  const cIdx = header.indexOf(colVal);
  let cell = '';
  for(const r of body){ if(r[0] === rowVal){ cell = r[cIdx]; break; } }
  return [[header[0], colVal], [rowVal, cell]];
}

// --- Column filter logic ---
function applyColumnFilters(rows){
  if(!rows) return rows;
  const header = rows[0];
  const body = rows.slice(1);
  let filtered = body;
  for(const key in columnFilters){
    const c = parseInt(key,10);
    const set = columnFilters[key];
    if(!set || set.size===0) continue;
    filtered = filtered.filter(r => set.has(r[c] ?? ''));
  }
  return [header, ...filtered];
}
function resetAllColumnFilters(){ columnFilters = {}; }
function openFilterPopover(colIdx, anchorTh){
  const rows = baseRows || fullRows; if(!rows) return;
  const values = uniqueValues(rows, colIdx).map(v => String(v ?? '')); values.sort((a,b)=> a.localeCompare(b, 'ja', {numeric:true, sensitivity:'base'}));

  popoverEl.innerHTML = '';
  const header = document.createElement('header');
  const input = document.createElement('input'); input.type='text'; input.placeholder='検索…';
  const allBtn = document.createElement('button'); allBtn.textContent='全選択';
  const clrBtn = document.createElement('button'); clrBtn.textContent='クリア';
  header.appendChild(input); header.appendChild(allBtn); header.appendChild(clrBtn);
  popoverEl.appendChild(header);

  const list = document.createElement('div'); list.className='filter-list';
  const currentSet = columnFilters[colIdx] ? new Set(columnFilters[colIdx]) : null;

  function renderList(filter=''){
    list.innerHTML = '';
    const norm = filter.trim();
    const re = norm ? new RegExp(norm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i') : null;
    for(const v of values){
      if(re && !re.test(v)) continue;
      const label = document.createElement('label');
      const cb = document.createElement('input'); cb.type='checkbox'; cb.value=v;
      cb.checked = currentSet ? currentSet.has(v) : true;
      const txt = document.createElement('span'); txt.textContent = v === '' ? '(空欄)' : v;
      label.appendChild(cb); label.appendChild(txt);
      list.appendChild(label);
    }
  }
  renderList();

  input.addEventListener('input', ()=> renderList(input.value));
  allBtn.addEventListener('click', ()=> { list.querySelectorAll('input[type=checkbox]').forEach(cb=> cb.checked=true); });
  clrBtn.addEventListener('click', ()=> { list.querySelectorAll('input[type=checkbox]').forEach(cb=> cb.checked=false); });

  popoverEl.appendChild(list);

  const actions = document.createElement('div'); actions.className='filter-actions';
  const applyBtn = document.createElement('button'); applyBtn.textContent='適用';
  const resetBtn = document.createElement('button'); resetBtn.textContent='リセット';
  const closeBtn = document.createElement('button'); closeBtn.textContent='閉じる';
  actions.appendChild(applyBtn); actions.appendChild(resetBtn); actions.appendChild(closeBtn);
  popoverEl.appendChild(actions);

  applyBtn.addEventListener('click', ()=>{
    const checked = Array.from(list.querySelectorAll('input[type=checkbox]')).filter(cb=>cb.checked).map(cb=>cb.value);
    if(checked.length === values.length){ delete columnFilters[colIdx]; }
    else{ columnFilters[colIdx] = new Set(checked); }
    recomputeAndRender(); hidePopover();
  });
  resetBtn.addEventListener('click', ()=>{ delete columnFilters[colIdx]; recomputeAndRender(); hidePopover(); });
  closeBtn.addEventListener('click', hidePopover);

  const rect = anchorTh.getBoundingClientRect();
  const top = window.scrollY + rect.bottom + 4;
  const left = window.scrollX + rect.left;
  popoverEl.style.top = `${top}px`; popoverEl.style.left = `${left}px`;
  popoverEl.classList.remove('hidden');

  setTimeout(()=>{
    function handler(ev){ if(!popoverEl.contains(ev.target)){ hidePopover(); document.removeEventListener('mousedown', handler); } }
    document.addEventListener('mousedown', handler);
  }, 0);
}
function hidePopover(){ popoverEl.classList.add('hidden'); }

// --- UI helpers ---
function disableRowCol(){ rowSel.innerHTML = '<option value="">未選択（全行）</option>'; colSel.innerHTML = '<option value="">未選択（全列）</option>'; rowSel.disabled = true; colSel.disabled = true; }
function populateRowColSelects(rows){
  if(!rows || rows.length===0) return;
  const header = rows[0];
  colSel.innerHTML = '<option value="">未選択（全列）</option>'; header.slice(1).forEach(h => { const opt = document.createElement('option'); opt.value = h; opt.textContent = h; colSel.appendChild(opt); });
  rowSel.innerHTML = '<option value="">未選択（全行）</option>'; rows.slice(1).forEach(r => { const lab = r[0]; const opt = document.createElement('option'); opt.value = lab; opt.textContent = lab; rowSel.appendChild(opt); });
  rowSel.disabled = false; colSel.disabled = false;
}

// --- Events ---
async function onFolder(){
  const folder = folderSel.value;
  fileSel.innerHTML = '<option value="">選択</option>'; fileSel.disabled = true;
  disableRowCol(); tableEl.innerHTML = ''; notesBox.innerHTML = ''; resetAllColumnFilters(); sortState = { col:null, dir:null };
  if(!folder) return;
  const ds = manifest.datasets.find(d => d.folder===folder);
  for(const f of ds.files){ const title = f.title || (f.path ? (f.path.split('/').pop() || 'CSV') : 'CSV'); const opt = document.createElement('option'); opt.value = f.path || ''; opt.textContent = title; fileSel.appendChild(opt); }
  fileSel.disabled = false;
}

async function onFile(){
  disableRowCol(); tableEl.innerHTML = ''; notesBox.innerHTML = ''; resetAllColumnFilters(); sortState = { col:null, dir:null };
  const relPath = fileSel.value; if(!relPath) return;
  try{ const text = await fetchText(relPath); fullRows = parseTable(text); populateRowColSelects(fullRows); recomputeAndRender(); renderNotesForPath(relPath); setStatus(''); }
  catch(e){ setStatus('CSV読込エラー：' + e.message + '（パス：' + relPath + '）'); }
}

function onFilterChange(){ sortState = { col:null, dir:null }; recomputeAndRender(); }

function recomputeAndRender(){
  baseRows = computeBaseRows();
  filteredRows = applyColumnFilters(baseRows);
  applySortAndRender();
}

// --- Init ---
function init(){
  folderSel = document.getElementById('folderSelect'); fileSel = document.getElementById('fileSelect'); rowSel = document.getElementById('rowSelect'); colSel = document.getElementById('colSelect'); tableEl = document.getElementById('dataTable'); notesBox = document.getElementById('notesBox'); popoverEl = document.getElementById('filterPopover');
  if(!folderSel || !fileSel || !rowSel || !colSel || !tableEl || !notesBox || !popoverEl){ setStatus('初期化エラー: 必要な要素が見つかりません。index.htmlのIDを確認してください。'); return; }
  fetchJSON('data/index.json').then((m)=>{
    manifest = m; (manifest.datasets || []).forEach(ds => { (ds.files || []).forEach(f => { if(f.path){ metaByPath[f.path] = f; } }); });
    const folders = manifest.datasets.map(d => d.folder); for(const f of folders){ const opt=document.createElement('option'); opt.value=f; opt.textContent=f; folderSel.appendChild(opt); }
    folderSel.addEventListener('change', onFolder); fileSel.addEventListener('change', onFile); rowSel.addEventListener('change', onFilterChange); colSel.addEventListener('change', onFilterChange);
  }).catch(e => { setStatus('index.json 取得エラー：' + e.message); });
}
if(document.readyState === 'loading'){ document.addEventListener('DOMContentLoaded', init); } else { init(); }
