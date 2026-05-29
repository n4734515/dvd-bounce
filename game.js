// ── DOM refs ──
const menuEl       = document.getElementById('menu');
const menuCard     = document.getElementById('menu-card');
const menuEyebrow  = document.getElementById('menu-eyebrow');
const menuTitle    = document.getElementById('menu-title');
const menuTagline  = document.getElementById('menu-tagline');
const statsContent = document.getElementById('stats-content');
const menuBtn      = document.getElementById('menu-btn');
const wrap         = document.getElementById('canvas-wrap');
const canvas       = document.getElementById('canvas');
const logo         = document.getElementById('logo');
const flash        = document.getElementById('corner-flash');
const vignette     = document.getElementById('damage-vignette');
const bossFill     = document.getElementById('boss-hp-fill');
const playerFill   = document.getElementById('player-hp-fill');
const roundLabel   = document.getElementById('round-label');
const countdownEl  = document.getElementById('countdown');
const countdownNum = document.getElementById('countdown-num');

// ── Constants ──
const LOGO_W        = 120;
const LOGO_H        = 60;
const MIN_W         = LOGO_W + 60;
const MIN_H         = LOGO_H + 60;
const BORDER        = 2;
const BASE_SPEED    = 3.5;
const COOLDOWN_MS   = 3000;
const PLAYER_MAX_HP = 100;
const BASE_LOGO_HP  = 5;
const BOUNCE_DAMAGE = 5;
const CORNER_DAMAGE = 1;

const COLORS = [
  '#e74c3c', '#e67e22', '#f1c40f',
  '#2ecc71', '#1abc9c', '#3498db',
  '#9b59b6', '#e91e8c', '#00bcd4',
];

// ── Run state ──
let currentRound, playerHP, logoHP, logoMaxHP, speed;
let cornersThisRound, bouncesThisRound;

// ── Physics state ──
let x, y, vx, vy, colorIndex, gameActive;

// ── Canvas geometry ──
let cLeft, cTop, cWidth, cHeight;

function applyWrapGeometry() {
  wrap.style.left   = cLeft   + 'px';
  wrap.style.top    = cTop    + 'px';
  wrap.style.width  = cWidth  + 'px';
  wrap.style.height = cHeight + 'px';
}

// ── Per-corner cooldowns ──
const cornerZoneEls = {};
document.querySelectorAll('.corner-zone[data-corner]').forEach(el => {
  cornerZoneEls[el.dataset.corner] = el;
});
const cooldowns = { tl: 0, tr: 0, bl: 0, br: 0 };

function cornerKey(hitLeft, hitRight, hitTop, hitBottom) {
  return (hitTop ? 't' : 'b') + (hitLeft ? 'l' : 'r');
}

function tryCornerHit(key, color) {
  if (Date.now() < cooldowns[key]) return false;
  cooldowns[key] = Date.now() + COOLDOWN_MS;
  const el = cornerZoneEls[key];
  el.style.setProperty('--hit-color', color);
  el.style.setProperty('--cd', COOLDOWN_MS + 'ms');
  el.classList.remove('cooling');
  void el.offsetWidth;
  el.classList.add('cooling');
  return true;
}

// ── Menu helpers ──
function pips(filled, total, color) {
  let html = '<div class="pip-row">';
  for (let i = 0; i < total; i++) {
    const cls = i < filled ? 'pip filled' : 'pip';
    html += `<span class="${cls}" style="--pip-color:${color}"></span>`;
  }
  return html + '</div>';
}

function stat(label, value, cls = '') {
  return `<div class="stat-row">
    <span class="stat-label">${label}</span>
    <span class="stat-value ${cls}">${value}</span>
  </div>`;
}

function showMenu(state) {
  menuCard.style.animation = 'none';
  void menuCard.offsetWidth;
  menuCard.style.animation = '';

  if (state === 'start') {
    menuCard.style.setProperty('--accent', 'white');
    menuEyebrow.textContent = 'ROUND 1';
    menuTitle.textContent   = 'DVD';
    menuTagline.textContent = 'corner the logo before it corners you';
    statsContent.innerHTML  =
      stat('Player HP', PLAYER_MAX_HP) +
      pips(PLAYER_MAX_HP / 10, PLAYER_MAX_HP / 10, '#2ecc71') +
      '<div style="height:10px"></div>' +
      stat('Logo HP', BASE_LOGO_HP + ' hits') +
      pips(BASE_LOGO_HP, BASE_LOGO_HP, '#e74c3c');
    menuBtn.textContent = 'BEGIN';

  } else if (state === 'round-clear') {
    menuCard.style.setProperty('--accent', '#2ecc71');
    menuEyebrow.textContent = `ROUND ${currentRound} CLEARED`;
    menuTitle.textContent   = 'CORNERED';
    menuTagline.textContent = `next: round ${currentRound + 1}`;
    const hpColor = playerHP > 50 ? '#2ecc71' : playerHP > 25 ? '#f1c40f' : '#e74c3c';
    const hpCls   = playerHP > 50 ? 'good' : 'bad';
    statsContent.innerHTML  =
      stat('Corners landed', cornersThisRound, 'good') +
      stat('Wall bounces',   bouncesThisRound) +
      '<div style="height:10px"></div>' +
      stat('HP into next round', `${playerHP} / ${PLAYER_MAX_HP}`, hpCls) +
      pips(Math.round(playerHP / 10), PLAYER_MAX_HP / 10, hpColor) +
      '<div style="height:6px"></div>' +
      stat('Logo HP (next round)', logoMaxHP + 1 + ' hits', 'bad');
    menuBtn.textContent = 'CONTINUE';

  } else if (state === 'dead') {
    menuCard.style.setProperty('--accent', '#e74c3c');
    menuEyebrow.textContent = `FELL ON ROUND ${currentRound}`;
    menuTitle.textContent   = 'GAME OVER';
    menuTagline.textContent = 'the dvd logo wins this round';
    statsContent.innerHTML  =
      stat('Rounds cleared',   currentRound - 1) +
      stat('Corners this run', cornersThisRound) +
      stat('Wall bounces',     bouncesThisRound) +
      '<div style="height:10px"></div>' +
      stat('HP remaining', `${playerHP} / ${PLAYER_MAX_HP}`, 'bad') +
      pips(Math.round(playerHP / 10), PLAYER_MAX_HP / 10, '#e74c3c');
    menuBtn.textContent = 'NEW RUN';
  }

  menuEl.classList.remove('hidden');
}

// ── HP bars ──
function updateHPBars() {
  bossFill.style.width   = (logoHP / logoMaxHP * 100) + '%';
  playerFill.style.width = (playerHP / PLAYER_MAX_HP * 100) + '%';
  const pct = playerHP / PLAYER_MAX_HP;
  playerFill.style.backgroundColor =
    pct > 0.5 ? '#2ecc71' : pct > 0.25 ? '#f1c40f' : '#e74c3c';
}

function flashDamage() {
  vignette.classList.remove('flash');
  void vignette.offsetWidth;
  vignette.classList.add('flash');
  setTimeout(() => vignette.classList.remove('flash'), 280);
}

function flashCorner() {
  flash.classList.remove('flash');
  void flash.offsetWidth;
  flash.classList.add('flash');
  setTimeout(() => flash.classList.remove('flash'), 300);
}

// ── Countdown ──
function runCountdown(callback) {
  const steps = [
    { text: '3', go: false },
    { text: '2', go: false },
    { text: '1', go: false },
    { text: 'GO', go: true },
  ];
  let i = 0;
  countdownEl.classList.remove('hidden');

  function step() {
    if (i >= steps.length) {
      countdownEl.classList.add('hidden');
      callback();
      return;
    }
    const { text, go } = steps[i++];
    countdownNum.className    = go ? 'go' : '';
    countdownNum.textContent  = text;
    countdownNum.style.animation = 'none';
    void countdownNum.offsetWidth;
    countdownNum.style.animation = '';
    setTimeout(step, 850);
  }
  step();
}

// ── Start a round ──
function startRound() {
  menuEl.classList.add('hidden');

  cWidth  = 800;
  cHeight = 500;
  cLeft   = (window.innerWidth  - cWidth)  / 2;
  cTop    = (window.innerHeight - cHeight) / 2;
  applyWrapGeometry();

  Object.keys(cooldowns).forEach(k => cooldowns[k] = 0);
  document.querySelectorAll('.corner-zone').forEach(el => el.classList.remove('cooling'));

  cornersThisRound = 0;
  bouncesThisRound = 0;
  logoMaxHP = BASE_LOGO_HP + (currentRound - 1);
  logoHP    = logoMaxHP;
  speed     = BASE_SPEED + (currentRound - 1) * 0.25;

  roundLabel.textContent = `ROUND ${currentRound}`;
  updateHPBars();

  colorIndex = 0;
  logo.style.color = COLORS[0];

  x = cLeft + cWidth  / 3 + Math.random() * (cWidth  / 3);
  y = cTop  + cHeight / 3 + Math.random() * (cHeight / 3);
  logo.style.left = x + 'px';
  logo.style.top  = y + 'px';

  const angle = (Math.PI / 4) + (Math.random() - 0.5) * 0.3;
  vx = Math.cos(angle) * speed * (Math.random() < 0.5 ? 1 : -1);
  vy = Math.sin(angle) * speed * (Math.random() < 0.5 ? 1 : -1);

  runCountdown(() => {
    gameActive = true;
    requestAnimationFrame(tick);
  });
}

// ── Menu button ──
menuBtn.addEventListener('click', () => {
  const text = menuBtn.textContent;
  if (text === 'BEGIN' || text === 'CONTINUE') {
    if (text === 'CONTINUE') currentRound++;
    startRound();
  } else {
    currentRound = 1;
    playerHP     = PLAYER_MAX_HP;
    startRound();
  }
});

// ── Main loop ──
function tick() {
  if (!gameActive) return;

  const wallL = cLeft   + BORDER;
  const wallR = cLeft   + cWidth  - BORDER;
  const wallT = cTop    + BORDER;
  const wallB = cTop    + cHeight - BORDER;

  let nx = x + vx;
  let ny = y + vy;
  let hitLeft = false, hitRight = false, hitTop = false, hitBottom = false;

  if (nx <= wallL) {
    nx = wallL; vx = Math.abs(vx); hitLeft = true;
  } else if (nx + LOGO_W >= wallR) {
    nx = wallR - LOGO_W; vx = -Math.abs(vx); hitRight = true;
  }
  if (ny <= wallT) {
    ny = wallT; vy = Math.abs(vy); hitTop = true;
  } else if (ny + LOGO_H >= wallB) {
    ny = wallB - LOGO_H; vy = -Math.abs(vy); hitBottom = true;
  }

  if (hitLeft || hitRight || hitTop || hitBottom) {
    colorIndex = (colorIndex + 1) % COLORS.length;
    logo.style.color = COLORS[colorIndex];

    const isCorner = (hitLeft || hitRight) && (hitTop || hitBottom);

    if (isCorner) {
      const key = cornerKey(hitLeft, hitRight, hitTop, hitBottom);
      if (tryCornerHit(key, COLORS[colorIndex])) {
        logoHP = Math.max(0, logoHP - CORNER_DAMAGE);
        cornersThisRound++;
        flashCorner();
        updateHPBars();
        if (logoHP <= 0) {
          gameActive = false;
          showMenu('round-clear');
          return;
        }
      }
    } else {
      playerHP = Math.max(0, playerHP - BOUNCE_DAMAGE);
      bouncesThisRound++;
      flashDamage();
      updateHPBars();
      if (playerHP <= 0) {
        gameActive = false;
        showMenu('dead');
        return;
      }
    }
  }

  x = nx; y = ny;
  logo.style.left = x + 'px';
  logo.style.top  = y + 'px';

  requestAnimationFrame(tick);
}

// ── Resize drag ──
let drag = null;

document.querySelectorAll('.handle').forEach(handle => {
  handle.addEventListener('mousedown', e => {
    e.preventDefault();
    drag = {
      dir: handle.dataset.dir,
      startX: e.clientX, startY: e.clientY,
      startLeft: cLeft, startTop: cTop,
      startW: cWidth, startH: cHeight,
    };
    document.body.style.userSelect = 'none';
    document.body.style.cursor = getComputedStyle(handle).cursor;
  });
});

document.addEventListener('mousemove', e => {
  if (!drag) return;
  const dx = e.clientX - drag.startX;
  const dy = e.clientY - drag.startY;
  const dir = drag.dir;

  let newLeft = drag.startLeft, newTop = drag.startTop;
  let newW = drag.startW, newH = drag.startH;

  if (dir.includes('e')) newW = drag.startW + dx;
  if (dir.includes('s')) newH = drag.startH + dy;
  if (dir.includes('w')) { newW = drag.startW - dx; newLeft = drag.startLeft + dx; }
  if (dir.includes('n')) { newH = drag.startH - dy; newTop  = drag.startTop  + dy; }

  if (newW < MIN_W) { if (dir.includes('w')) newLeft = drag.startLeft + drag.startW - MIN_W; newW = MIN_W; }
  if (newH < MIN_H) { if (dir.includes('n')) newTop  = drag.startTop  + drag.startH - MIN_H; newH = MIN_H; }

  cLeft = newLeft; cTop = newTop; cWidth = newW; cHeight = newH;
  applyWrapGeometry();
});

document.addEventListener('mouseup', () => {
  if (!drag) return;
  drag = null;
  document.body.style.userSelect = '';
  document.body.style.cursor = '';
});

// ── Boot ──
currentRound = 1;
playerHP     = PLAYER_MAX_HP;
showMenu('start');
