// ── DOM refs ──
const menuEl       = document.getElementById('menu');
const menuCard     = document.getElementById('menu-card');
const menuEyebrow  = document.getElementById('menu-eyebrow');
const menuTitle    = document.getElementById('menu-title');
const menuTagline  = document.getElementById('menu-tagline');
const menuBody     = document.getElementById('menu-body');
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

const edgeFlashEls = {};
document.querySelectorAll('.edge-flash[data-edge]').forEach(el => {
  edgeFlashEls[el.dataset.edge] = el;
});

const hitSound = document.getElementById('hit-sound');

// ── Constants ──
const LOGO_W        = 160;
const LOGO_H        = 75;
const MIN_W         = LOGO_W + 60;
const MIN_H         = LOGO_H + 60;
const BORDER        = 2;
const BASE_SPEED    = 2;
const COOLDOWN_MS   = 3000;
const PLAYER_MAX_HP         = 100;
const BASE_LOGO_HP          = 50;
const LOGO_HP_PER_ROUND     = 20;
const BOUNCE_DAMAGE_MAX     = 5;
const CORNER_DAMAGE_MIN     = 2;
const SPEED_SCALE_PER_ROUND = 0.5;

const CORNER_HITBOX_BASE  = 32;
const CORNER_HITBOX_MAX   = 80;
const CORNER_HITBOX_STEP  = 12;
const CORNER_DAMAGE_BASE  = 12;
const CORNER_DAMAGE_STEP  = 3;
const COST_HITBOX         = 20;
const COST_DAMAGE         = 30;
const COST_HEAL           = 25;
const HEAL_AMOUNT         = 20;
const TOKEN_VALUE         = 10;
const TOKEN_LIFETIME      = 6000;
const TOKEN_SPAWN_INTERVAL= 4500;
const MAX_TOKENS          = 3;

const COLORS = [
  '#e74c3c', '#e67e22', '#f1c40f',
  '#2ecc71', '#1abc9c', '#3498db',
  '#9b59b6', '#e91e8c', '#00bcd4',
];

// ── Per-corner stats ──
function makeCornerStats() {
  return {
    tl: { hitbox: CORNER_HITBOX_BASE, damage: 12 },
    tr: { hitbox: CORNER_HITBOX_BASE, damage: 12 },
    bl: { hitbox: CORNER_HITBOX_BASE, damage: 12 },
    br: { hitbox: CORNER_HITBOX_BASE, damage: 12 },
  };
}
let cornerStats = makeCornerStats();

// ── Run state ──
let currentRound, playerHP, logoHP, logoMaxHP, speed;
let cornersThisRound, bouncesThisRound;
let currency = 0;
let tokens = [];
let tokenInterval = null;

// ── Physics state ──
let x, y, vx, vy, colorIndex, gameActive;

// ── Canvas geometry ──
let cLeft, cTop, cWidth, cHeight;

function applyWrapGeometry() {
  wrap.style.left   = cLeft   + 'px';
  wrap.style.top    = cTop    + 'px';
  wrap.style.width  = cWidth  + 'px';
  wrap.style.height = cHeight + 'px';
  updateTokenVisibility();
}

function updateTokenVisibility() {
  const left   = cLeft  + BORDER;
  const right  = cLeft  + cWidth  - BORDER;
  const top    = cTop   + BORDER;
  const bottom = cTop   + cHeight - BORDER;
  tokens.forEach(t => {
    const inside = t.vx >= left && t.vx + 30 <= right &&
                   t.vy >= top  && t.vy + 32 <= bottom;
    t.el.style.visibility = inside ? '' : 'hidden';
  });
}

// ── Per-corner cooldowns ──
const cornerZoneEls = {};
document.querySelectorAll('.corner-zone[data-corner]').forEach(el => {
  cornerZoneEls[el.dataset.corner] = el;
});

const canvasCornerEls = {};
document.querySelectorAll('.canvas-corner[data-corner]').forEach(el => {
  canvasCornerEls[el.dataset.corner] = el;
});

function syncCornerSize(key) {
  const s = cornerStats[key].hitbox;
  cornerZoneEls[key].style.width    = s + 'px';
  cornerZoneEls[key].style.height   = s + 'px';
  canvasCornerEls[key].style.width  = s + 'px';
  canvasCornerEls[key].style.height = s + 'px';
}

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

// ── Token functions ──
function spawnToken() {
  if (!gameActive) return;
  if (tokens.length >= MAX_TOKENS) return;

  const el = document.createElement('div');
  el.className = 'token';

  const margin = 40;
  const posLeft = cLeft + BORDER + margin + Math.random() * (cWidth  - BORDER * 2 - margin * 2 - 30);
  const posTop  = cTop  + BORDER + margin + Math.random() * (cHeight - BORDER * 2 - margin * 2 - 32);
  el.style.left = posLeft + 'px';
  el.style.top  = posTop  + 'px';

  el.innerHTML = `
    <div class="token-icon">◈</div>
    <div class="token-timer"><div class="token-timer-fill"></div></div>
  `;

  const fill = el.querySelector('.token-timer-fill');
  requestAnimationFrame(() => {
    fill.style.transition = `width ${TOKEN_LIFETIME}ms linear`;
    fill.style.width = '0%';
  });

  el.addEventListener('click', e => {
    e.stopPropagation();
    currency += TOKEN_VALUE;
    removeToken(token);
  });

  const token = {
    el,
    vx: posLeft,
    vy: posTop,
    timeout: setTimeout(() => removeToken(token), TOKEN_LIFETIME),
  };

  document.body.appendChild(el);
  tokens.push(token);
}

function removeToken(token) {
  clearTimeout(token.timeout);
  if (token.el.parentNode) token.el.parentNode.removeChild(token.el);
  const idx = tokens.indexOf(token);
  if (idx !== -1) tokens.splice(idx, 1);
}

function clearAllTokens() {
  tokens.slice().forEach(t => removeToken(t));
  tokens = [];
}

// ── Key badge helper ──
function keyBadge(label) {
  return `<span class="key-badge">${label}</span>`;
}

// ── Shop / between-rounds render ──
function renderShop() {
  const totalSegs  = PLAYER_MAX_HP / 2;
  const filledSegs = Math.round(playerHP / 2);

  let segsHtml = '<div class="seg-hp-bar">';
  for (let i = 0; i < totalSegs; i++) {
    segsHtml += `<div class="seg${i < filledSegs ? ' on' : ''}"></div>`;
  }
  segsHtml += '</div>';

  const canHeal = currency >= COST_HEAL && playerHP < PLAYER_MAX_HP;

  const ICON_CLASS = { tl: 'ci-tl', tr: 'ci-tr', bl: 'ci-bl', br: 'ci-br' };

  let cornersHtml = '<div id="powerup-grid">';
  ['tl', 'tr', 'bl', 'br'].forEach(key => {
    const cs = cornerStats[key];
    const rangeLevel  = Math.round((cs.hitbox - CORNER_HITBOX_BASE) / CORNER_HITBOX_STEP) + 1;
    const powerLevel  = Math.round((cs.damage - CORNER_DAMAGE_BASE) / CORNER_DAMAGE_STEP) + 1;
    const hitboxAtMax = cs.hitbox >= CORNER_HITBOX_MAX;
    const canRange    = currency >= COST_HITBOX && !hitboxAtMax;
    const canPower    = currency >= COST_DAMAGE;

    cornersHtml += `
      <div class="corner-card">
        <div class="corner-icon ${ICON_CLASS[key]}"></div>
        <div class="corner-stats">
          <div class="corner-stat-row">
            RANGE: ${rangeLevel}
            <button class="upgrade-xp-btn range-btn" data-key="${key}" ${canRange ? '' : 'disabled'}>+ ${COST_HITBOX}XP</button>
          </div>
          <div class="corner-stat-row">
            POWER: ${powerLevel}
            <button class="upgrade-xp-btn power-btn" data-key="${key}" ${canPower ? '' : 'disabled'}>+ ${COST_DAMAGE}XP</button>
          </div>
        </div>
      </div>
    `;
  });
  cornersHtml += '</div>';

  menuBody.innerHTML = `
    <div class="menu-section-label">Stats:</div>
    <div class="fm-stat-row">XP: <span class="fm-highlight">${currency}XP</span></div>
    <div class="fm-stat-row">HP: <span class="fm-highlight">${playerHP}/${PLAYER_MAX_HP}</span></div>
    ${segsHtml}
    <button id="heal-btn" ${canHeal ? '' : 'disabled'}>HEAL ${HEAL_AMOUNT} HP — ${COST_HEAL}XP</button>
    <div class="menu-section-label" style="margin-top:20px">Corners:</div>
    ${cornersHtml}
  `;

  document.getElementById('heal-btn').onclick = () => {
    if (currency < COST_HEAL || playerHP >= PLAYER_MAX_HP) return;
    currency -= COST_HEAL;
    playerHP = Math.min(PLAYER_MAX_HP, playerHP + HEAL_AMOUNT);
    updateHPBars();
    renderShop();
  };

  menuBody.querySelectorAll('.range-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const key = btn.dataset.key;
      if (currency < COST_HITBOX || cornerStats[key].hitbox >= CORNER_HITBOX_MAX) return;
      currency -= COST_HITBOX;
      cornerStats[key].hitbox = Math.min(CORNER_HITBOX_MAX, cornerStats[key].hitbox + CORNER_HITBOX_STEP);
      syncCornerSize(key);
      renderShop();
    });
  });

  menuBody.querySelectorAll('.power-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const key = btn.dataset.key;
      if (currency < COST_DAMAGE) return;
      currency -= COST_DAMAGE;
      cornerStats[key].damage += CORNER_DAMAGE_STEP;
      renderShop();
    });
  });
}

// ── Show menu ──
function showMenu(state) {
  clearAllTokens();
  clearInterval(tokenInterval);
  tokenInterval = null;

  menuCard.style.animation = 'none';
  void menuCard.offsetWidth;
  menuCard.style.animation = '';

  if (state === 'start') {
    menuTitle.textContent   = 'DVD ARENA';
    menuEyebrow.textContent = '';
    menuTagline.textContent = 'Resize the arena to battle the DVD logo';
    menuBody.innerHTML      = '';
    menuBtn.innerHTML       = `Press ${keyBadge('SPACE')} to begin`;
    menuBtn.dataset.state   = 'begin';

  } else if (state === 'round-clear') {
    menuTitle.textContent   = 'DVD ARENA';
    menuEyebrow.textContent = `ROUND ${currentRound + 1}`;
    menuTagline.textContent = 'Resize the arena and battle the DVD logo';
    renderShop();
    menuBtn.innerHTML       = `Press ${keyBadge('SPACE')} to begin next battle`;
    menuBtn.dataset.state   = 'continue';

  } else if (state === 'dead') {
    clearDeathState();
    menuTitle.textContent   = 'DEFEATED';
    menuEyebrow.textContent = `ROUND ${currentRound}`;
    menuTagline.textContent = '';
    menuBody.innerHTML      = '';
    menuBtn.innerHTML       = `Press ${keyBadge('SPACE')} to replay`;
    menuBtn.dataset.state   = 'restart';
  }

  menuEl.classList.remove('hidden');
}

// ── HP bars ──
function updateHPBars() {
  bossFill.style.width   = (logoHP / logoMaxHP * 100) + '%';
  playerFill.style.width = (playerHP / PLAYER_MAX_HP * 100) + '%';
  const pct = playerHP / PLAYER_MAX_HP;
  playerFill.style.backgroundColor =
    pct > 0.5 ? 'white' : pct > 0.25 ? '#f1c40f' : '#e74c3c';
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

function flashWall(hitLeft, hitRight, hitTop, hitBottom, lethal) {
  const sides = [];
  if (hitLeft)   sides.push('w');
  if (hitRight)  sides.push('e');
  if (hitTop)    sides.push('n');
  if (hitBottom) sides.push('s');
  sides.forEach(edge => {
    const el = edgeFlashEls[edge];
    if (lethal) {
      el.classList.remove('flash');
      el.classList.add('lethal');
    } else {
      el.classList.remove('flash', 'lethal');
      void el.offsetWidth;
      el.classList.add('flash');
    }
  });
}

function showDeathScreen(hitLeft, hitRight, hitTop, hitBottom) {
  clearAllTokens();
  clearInterval(tokenInterval);
  tokenInterval = null;
  flashWall(hitLeft, hitRight, hitTop, hitBottom, true);
  showMenu('dead');
}

function clearDeathState() {
  Object.values(edgeFlashEls).forEach(el => {
    el.classList.remove('flash', 'lethal');
  });
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

  ['tl', 'tr', 'bl', 'br'].forEach(key => syncCornerSize(key));

  cornersThisRound = 0;
  bouncesThisRound = 0;
  logoMaxHP = BASE_LOGO_HP + (currentRound - 1) * LOGO_HP_PER_ROUND;
  logoHP    = logoMaxHP;
  speed     = BASE_SPEED + (currentRound - 1) * SPEED_SCALE_PER_ROUND;

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
    tokenInterval = setInterval(spawnToken, TOKEN_SPAWN_INTERVAL);
    requestAnimationFrame(tick);
  });
}

// ── Menu button ──
menuBtn.addEventListener('click', () => {
  hitSound.play().then(() => { hitSound.pause(); hitSound.currentTime = 0; }).catch(() => {});
  const s = menuBtn.dataset.state;
  if (s === 'begin') {
    startRound();
  } else if (s === 'continue') {
    currentRound++;
    startRound();
  } else if (s === 'restart') {
    currentRound = 1;
    playerHP     = PLAYER_MAX_HP;
    currency     = 0;
    cornerStats  = makeCornerStats();
    ['tl', 'tr', 'bl', 'br'].forEach(key => syncCornerSize(key));
    showMenu('start');
  }
});

// Space key shortcut for menu
document.addEventListener('keydown', e => {
  if (e.code === 'Space' && !menuEl.classList.contains('hidden')) {
    e.preventDefault();
    menuBtn.click();
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

    let detectedCorner = null;
    let detectedCornerDist = Infinity;
    const checkC = (key, dist) => {
      if (dist >= 0 && dist < cornerStats[key].hitbox && dist < detectedCornerDist) {
        detectedCorner = key; detectedCornerDist = dist;
      }
    };
    if (hitLeft)         { checkC('tl', ny - wallT); checkC('bl', wallB - (ny + LOGO_H)); }
    else if (hitRight)   { checkC('tr', ny - wallT); checkC('br', wallB - (ny + LOGO_H)); }
    if (!detectedCorner) {
      if (hitTop)        { checkC('tl', nx - wallL); checkC('tr', wallR - (nx + LOGO_W)); }
      else if (hitBottom){ checkC('bl', nx - wallL); checkC('br', wallR - (nx + LOGO_W)); }
    }
    const isCorner = detectedCorner !== null;

    const damage = detectedCorner
      ? Math.round((detectedCornerDist / cornerStats[detectedCorner].hitbox) * BOUNCE_DAMAGE_MAX)
      : BOUNCE_DAMAGE_MAX;

    if (isCorner) {
      if (tryCornerHit(detectedCorner, COLORS[colorIndex])) {
        const tCorner    = 1 - detectedCornerDist / cornerStats[detectedCorner].hitbox;
        const logoDamage = Math.round(CORNER_DAMAGE_MIN + tCorner * (cornerStats[detectedCorner].damage - CORNER_DAMAGE_MIN));
        logoHP = Math.max(0, logoHP - logoDamage);
        cornersThisRound++;
        hitSound.currentTime = 0;
        hitSound.play().catch(() => {});
        flashCorner();
        updateHPBars();
        if (logoHP <= 0) {
          gameActive = false;
          showMenu('round-clear');
          return;
        }
      }
    } else {
      bouncesThisRound++;
    }

    if (damage > 0) {
      playerHP = Math.max(0, playerHP - damage);
      flashDamage();
      flashWall(hitLeft, hitRight, hitTop, hitBottom, false);
      updateHPBars();
      if (playerHP <= 0) {
        gameActive = false;
        showDeathScreen(hitLeft, hitRight, hitTop, hitBottom);
        return;
      }
    }
  }

  x = nx; y = ny;
  logo.style.left = x + 'px';
  logo.style.top  = y + 'px';

  requestAnimationFrame(tick);
}


// ── Corner drag to resize ──
const CORNER_DIRS = { tl: 'nw', tr: 'ne', bl: 'sw', br: 'se' };
let drag = null;

Object.entries(canvasCornerEls).forEach(([corner, el]) => {
  el.addEventListener('mousedown', e => {
    e.preventDefault();
    drag = {
      dir: CORNER_DIRS[corner],
      startX: e.clientX, startY: e.clientY,
      startLeft: cLeft, startTop: cTop,
      startW: cWidth, startH: cHeight,
    };
    document.body.style.userSelect = 'none';
    document.body.style.cursor = getComputedStyle(el).cursor;
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
