function setStatus(msg){ const el=document.getElementById('status'); if(el) el.textContent = msg || ''; }
async function fetchText(url){ const res = await fetch(url); if(!res.ok) throw new Error(`HTTP ${res.status} for ${url}`); return await res.text(); }
async function fetchJSON(url){ const txt = await fetchText(url); try{ return JSON.parse(txt); }catch(e){ throw new Error(`JSON parse error for ${url}: `+e.message); } }
function parseTable(text){ if(text.length && text.charCodeAt(0) === 0xFEFF){ text = text.slice(1); } const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n').filter(l => l.trim()!==''); if(lines.length===0) return []; const delim = (lines[0].includes('\t')) ? '\t' : ','; return lines.map(line => line.split(delim)); }
function toNumber(val){ if(val==null) return NaN; const s = String(val).replace(/,/g,'').trim(); const m = s.match(/-?\d+(?:\.\d+)?/); return m ? parseFloat(m[0]) : NaN; }
function isNumericColumn(rows, c){ for(let r=1;r<rows.length;r++){ const v = rows[r][c]; if(v==='' || v==null) continue; if(!Number.isFinite(toNumber(v))) return false; } return true; }
function esc(t){ return String(t).replace(/[&<>"']/g, s => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[s])); }
function looksLikeUrl(s){ return /^https?:\/\//i.test(String(s||'')); }

let folderSel, fileSel, rowSel, colSel, tableEl, notesBox;
let manifest=null, fullRows=null, lastFiltered=null;
let sortState = { col:null, dir:null };
let metaByPath = Object.create(null);

function renderTable(rows){
  tableEl.innerHTML='';
  if(!rows || rows.length===0){ tableEl.textContent='データなし'; return; }
  const thead=document.createElement('thead'); const trh=document.createElement('tr');
  rows[0].forEach((h, idx) => { const th=document.createElement('th'); th.textContent=h; th.dataset.colIndex = String(idx); const span=document.createElement('span'); span.className='sort-ind'; th.appendChild(span); trh.appendChild(th); });
  if(Number.isInteger(sortState.col)){ const ths = trh.children; for(let i=0;i<ths.length;i++){ ths[i].classList.remove('sort-asc','sort-desc'); } const th = ths[sortState.col]; if(th){ th.classList.add(sortState.dir === 'asc' ? 'sort-asc' : 'sort-desc'); } }
  thead.appendChild(trh); tableEl.appendChild(thead);
  const tbody=document.createElement('tbody'); for(let r=1;r<rows.length;r++){ const tr=document.createElement('tr'); rows[r].forEach(v => { const td=document.createElement('td'); td.textContent=v; tr.appendChild(td); }); tbody.appendChild(tr); } tableEl.appendChild(tbody);
  trh.querySelectorAll('th').forEach(th => { th.addEventListener('click', () => onSortHeaderClick(parseInt(th.dataset.colIndex,10))); });
}

function sortRows(rows, c, dir){
  if(rows.length<=2) return rows;
  const header = rows[0]; const body = rows.slice(1);
  const numeric = isNumericColumn(rows, c); const asc = dir === 'asc';
  body.sort((a,b)=>{ const va = a[c]; const vb = b[c];
    if(numeric){ const na = toNumber(va); const nb = toNumber(vb); const aNaN = !Number.isFinite(na); const bNaN = !Number.isFinite(nb); if(aNaN && bNaN) return 0; if(aNaN) return 1; if(bNaN) return -1; return asc ? (na-nb) : (nb-na); }
    else{ const sCmp = String(va).localeCompare(String(vb), 'ja', { numeric:true, sensitivity:'base' }); return asc ? sCmp : -sCmp; }
  });
  return [header, ...body];
}
function applySort(){ if(!lastFiltered){ return; } if(sortState.col==null || sortState.dir==null){ renderTable(lastFiltered); } else { const sorted = sortRows(lastFiltered.map(r=>r.slice()), sortState.col, sortState.dir); renderTable(sorted); } }
function onSortHeaderClick(colIdx){ if(sortState.col !== colIdx){ sortState = { col: colIdx, dir: 'asc' }; } else { if(sortState.dir === 'asc') sortState.dir = 'desc'; else if(sortState.dir === 'desc') sortState = { col: null, dir: null }; else sortState.dir = 'asc'; } applySort(); }

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

function disableRowCol(){ rowSel.innerHTML = '<option value="">未選択（全行）</option>'; colSel.innerHTML = '<option value="">未選択（全列）</option>'; rowSel.disabled = true; colSel.disabled = true; }
function populateRowColSelects(rows){
  if(!rows || rows.length===0) return;
  const header = rows[0];
  colSel.innerHTML = '<option value="">未選択（全列）</option>'; header.slice(1).forEach(h => { const opt = document.createElement('option'); opt.value = h; opt.textContent = h; colSel.appendChild(opt); });
  rowSel.innerHTML = '<option value="">未選択（全行）</option>'; rows.slice(1).forEach(r => { const lab = r[0]; const opt = document.createElement('option'); opt.value = lab; opt.textContent = lab; rowSel.appendChild(opt); });
  rowSel.disabled = false; colSel.disabled = false;
}

async function onFolder(){
  const folder = folderSel.value;
  fileSel.innerHTML = '<option value="">選択</option>'; fileSel.disabled = true;
  disableRowCol(); tableEl.innerHTML = ''; notesBox.innerHTML = '';
  if(!folder) return;
  const ds = manifest.datasets.find(d => d.folder===folder);
  for(const f of ds.files){ const title = f.title || (f.path ? (f.path.split('/').pop() || 'CSV') : 'CSV'); const opt = document.createElement('option'); opt.value = f.path || ''; opt.textContent = title; fileSel.appendChild(opt); }
  fileSel.disabled = false;
}

async function onFile(){
  disableRowCol(); tableEl.innerHTML = ''; notesBox.innerHTML = ''; sortState = { col: null, dir: null };
  const relPath = fileSel.value; if(!relPath) return;
  try{ const text = await fetchText(relPath); const rows = parseTable(text); fullRows = rows; populateRowColSelects(rows); lastFiltered = rows; applySort(); renderNotesForPath(relPath); setStatus(''); }
  catch(e){ setStatus('CSV読込エラー：' + e.message + '（パス：' + relPath + '）'); }
}

function onFilterChange(){
  if(!fullRows) return; sortState = { col: null, dir: null };
  const header = fullRows[0]; const body = fullRows.slice(1);
  const rowVal = rowSel.value; const colVal = colSel.value;
  if(!rowVal && !colVal){ lastFiltered = fullRows; applySort(); return; }
  if(rowVal && !colVal){ const out = [header]; for(const r of body){ if(r[0] === rowVal){ out.push(r); break; } } lastFiltered = out; applySort(); return; }
  if(!rowVal && colVal){ const cIdx = header.indexOf(colVal); const out = [[header[0], header[cIdx]]]; for(const r of body){ out.push([r[0], r[cIdx]]); } lastFiltered = out; applySort(); return; }
  const cIdx = header.indexOf(colVal); let cell = ''; for(const r of body){ if(r[0] === rowVal){ cell = r[cIdx]; break; } } lastFiltered = [[header[0], colVal], [rowVal, cell]]; applySort();
}

function init(){
  folderSel = document.getElementById('folderSelect'); fileSel = document.getElementById('fileSelect'); rowSel = document.getElementById('rowSelect'); colSel = document.getElementById('colSelect'); tableEl = document.getElementById('dataTable'); notesBox = document.getElementById('notesBox');
  if(!folderSel || !fileSel || !rowSel || !colSel || !tableEl || !notesBox){ setStatus('初期化エラー: 必要な要素が見つかりません。index.htmlのIDを確認してください。'); return; }
  fetchJSON('data/index.json').then((m)=>{
    manifest = m; (manifest.datasets || []).forEach(ds => { (ds.files || []).forEach(f => { if(f.path){ metaByPath[f.path] = f; } }); });
    const folders = manifest.datasets.map(d => d.folder); for(const f of folders){ const opt=document.createElement('option'); opt.value=f; opt.textContent=f; folderSel.appendChild(opt); }
    folderSel.addEventListener('change', onFolder); fileSel.addEventListener('change', onFile); rowSel.addEventListener('change', onFilterChange); colSel.addEventListener('change', onFilterChange);
  }).catch(e => { setStatus('index.json 取得エラー：' + e.message); });
}
if(document.readyState === 'loading'){ document.addEventListener('DOMContentLoaded', init); } else { init(); }
