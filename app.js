// CSV列 → 軸の定義（上から時計回り：画像と同じ並び）
const AXES = [
  { match: '人気度',         ja: '人気度',         en: 'Popularity' },
  { match: 'happiness',      ja: '幸福度',         en: 'Happiness' },
  { match: 'dance',          ja: 'ダンスのしやすさ', en: 'Danceability' },
  { match: 'energy',         ja: 'エネルギー',     en: 'Energy' },
  { match: 'acoustic',       ja: '音響性能',       en: 'Acousticness' },
  { match: 'instrumental',   ja: 'インスト度',     en: 'Instrumentalness' },
  { match: 'liveness',       ja: 'ライブ感',       en: 'Liveness' },
  { match: 'speechiness',    ja: '話しやすさ',     en: 'Speechiness' },
];
const $ = id => document.getElementById(id);
let songs = [], selected = null;

// ---- CSVパーサ（引用符対応・BOM除去）----
function parseCSV(text) {
  text = text.replace(/^\uFEFF/, '');
  const rows = []; let row = [], cur = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"') { if (text[i+1] === '"') { cur += '"'; i++; } else q = false; } else cur += c; }
    else if (c === '"') q = true;
    else if (c === ',') { row.push(cur); cur = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && text[i+1] === '\n') i++; row.push(cur); rows.push(row); row = []; cur = ''; }
    else cur += c;
  }
  if (cur || row.length) { row.push(cur); rows.push(row); }
  return rows;
}

function buildSongs(rows) {
  const head = rows[0];
  const idx = k => head.findIndex(h => h.toLowerCase().includes(k.toLowerCase()));
  const col = { title: idx('曲名'), artist: idx('アーティスト'), g1: idx('Chosic_ジャンル'), g2: idx('ジャンル2'),
                g3: idx('Chosic_テイスト'), bpm: idx('BPM'), len: idx('長さ'), no: idx('調査No') };
  const ax = AXES.map(a => idx(a.match));
  return rows.slice(1)
    .filter(r => /^\d+$/.test((r[col.no] || '').trim()) && r[col.title])   // 平均行・集計行を除外
    .map(r => {
      const [m, s] = (r[col.len] || '0:0').split(':').map(Number);
      return {
        title: r[col.title], artist: r[col.artist], bpm: +r[col.bpm] || 0, sec: (m || 0) * 60 + (s || 0),
        genres: [...new Set([r[col.g1], r[col.g2], r[col.g3]].map(x => (x || '').trim()).filter(Boolean))],
        values: ax.map(i => +r[i] || 0),
      };
    });
}

const avg = arr => arr.reduce((a, b) => a + b, 0) / (arr.length || 1);
const avgValues = () => AXES.map((_, i) => avg(songs.map(s => s.values[i])));

// ---- レーダーチャート（SVG）----
function polar(i, v, R, cx, cy) {
  const a = -Math.PI / 2 + (2 * Math.PI * i) / AXES.length, r = R * v / 100;
  return [cx + r * Math.cos(a), cy + r * Math.sin(a), a];
}
function drawRadar() {
  const W = 640, H = 640, cx = W / 2, cy = H / 2, R = 200, n = AXES.length, A = avgValues();
  let s = `<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">`;
  for (let lv = 20; lv <= 100; lv += 20) {
    s += `<polygon class="ring" points="${AXES.map((_, i) => polar(i, lv, R, cx, cy).slice(0, 2).join(',')).join(' ')}"/>`;
    s += `<text class="tick" x="${cx + 4}" y="${cy - R * lv / 100 + 12}">${lv}</text>`;
  }
  AXES.forEach((a, i) => {
    const [x, y, ang] = polar(i, 100, R, cx, cy);
    s += `<line class="axis" x1="${cx}" y1="${cy}" x2="${x}" y2="${y}"/>`;
    const lx = cx + (R + 38) * Math.cos(ang), ly = cy + (R + 38) * Math.sin(ang);
    s += `<text class="lbl" x="${lx}" y="${ly - 4}">${a.ja}<tspan class="lbl-en" x="${lx}" dy="15">${a.en}</tspan></text>`;
  });
  const poly = (vals, cls, pt) => {
    const p = vals.map((v, i) => polar(i, v, R, cx, cy));
    return `<polygon class="${cls}" points="${p.map(q => q[0] + ',' + q[1]).join(' ')}"/>` +
           p.map(q => `<circle class="${pt}" cx="${q[0]}" cy="${q[1]}" r="5"/>`).join('');
  };
  s += poly(A, 'poly-avg', 'pt-avg');
  if (selected !== null) s += poly(songs[selected].values, 'poly-sel', 'pt-sel');
  // 値ラベル
  A.forEach((v, i) => {
    const [x, y, ang] = polar(i, Math.min(v + 12, 112), R, cx, cy);
    s += `<text class="val" x="${x}" y="${y + 5}">${v.toFixed(1)}</text>`;
  });
  $('radar').innerHTML = s + '</svg>';
  $('legend-sel').hidden = selected === null;
  if (selected !== null) $('sel-name').textContent = songs[selected].title;
}

// ---- 傾向テキスト・統計 ----
function level(v) { return v >= 70 ? '高め' : v >= 45 ? '中程度' : '低め'; }
function drawInsight() {
  const A = avgValues(), ranked = AXES.map((a, i) => ({ ...a, v: A[i] })).sort((a, b) => b.v - a.v);
  const E = A[3], H = A[1], D = A[2], AC = A[4], IN = A[5], SP = A[7];
  const tags = [];
  if (E >= 65) tags.push('🔥 エネルギッシュ'); else if (E < 40) tags.push('🌙 落ち着き系');
  if (D >= 60) tags.push('💃 ノれる曲好き');
  if (H >= 55) tags.push('😊 ポジティブ'); else if (H < 40) tags.push('🌧 エモーショナル');
  if (AC < 25) tags.push('🎸 バンドサウンド派'); else if (AC >= 50) tags.push('🪕 アコースティック派');
  if (IN < 5 && SP < 8) tags.push('🎤 歌モノ中心');
  if (A[0] >= 60) tags.push('📈 王道ヒット好き'); else if (A[0] < 45) tags.push('🔍 ニッチ志向');
  $('tags').innerHTML = tags.map(t => `<span class="tag">${t}</span>`).join('');
  $('summary').textContent =
    `${songs.length}曲の平均では「${ranked[0].ja}（${ranked[0].v.toFixed(1)}）」と「${ranked[1].ja}（${ranked[1].v.toFixed(1)}）」が特に高く、` +
    `エネルギーは${level(E)}、幸福度は${level(H)}の傾向です。「${ranked[ranked.length - 1].ja}」は最も低い項目です。`;
  const sec = avg(songs.map(s => s.sec)), bpm = avg(songs.map(s => s.bpm));
  $('stats').innerHTML = [['曲数', songs.length], ['平均BPM', Math.round(bpm)],
    ['平均の長さ', `${Math.floor(sec / 60)}:${String(Math.round(sec % 60)).padStart(2, '0')}`]]
    .map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join('');
}

function drawGenres() {
  const cnt = {};
  songs.forEach(s => s.genres.forEach(g => cnt[g] = (cnt[g] || 0) + 1));
  const list = Object.entries(cnt).sort((a, b) => b[1] - a[1]), max = list[0] ? list[0][1] : 1;
  $('genres').innerHTML = list.slice(0, 10).map(([g, c]) =>
    `<div class="g-row"><span>${g}</span><div class="g-bar"><i style="width:${c / max * 100}%"></i></div><b>${c}</b></div>`).join('');
}

function drawTable() {
  const fmt = s => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  $('song-table').innerHTML =
    `<thead><tr><th>曲名</th><th>アーティスト</th><th>BPM</th><th>長さ</th>${AXES.map(a => `<th>${a.ja}</th>`).join('')}</tr></thead><tbody>` +
    songs.map((s, i) => `<tr data-i="${i}" class="${i === selected ? 'active' : ''}"><td>${s.title}</td><td>${s.artist}</td><td>${s.bpm}</td><td>${fmt(s.sec)}</td>${s.values.map(v => `<td>${v}</td>`).join('')}</tr>`).join('') + '</tbody>';
  $('song-table').querySelectorAll('tbody tr').forEach(tr => tr.onclick = () => {
    const i = +tr.dataset.i; selected = selected === i ? null : i; drawRadar(); drawTable();
  });
}

function render(rows) {
  songs = buildSongs(rows); selected = null;
  $('subtitle').textContent = `${songs.length}曲平均 ／ 各項目を0〜100のスケールで表示`;
  drawRadar(); drawInsight(); drawGenres(); drawTable();
}

fetch('songs.csv').then(r => r.text()).then(t => render(parseCSV(t)))
  .catch(() => $('subtitle').textContent = 'songs.csv を読み込めませんでした');
$('file').onchange = e => { const f = e.target.files[0]; if (f) f.text().then(t => render(parseCSV(t))); };
