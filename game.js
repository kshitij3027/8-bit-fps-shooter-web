// game.js - external module containing game logic
// --- DOM Elements ---
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const instructions = document.getElementById('instructions');
const gameOverScreen = document.getElementById('gameOver');
const scoreElement = document.getElementById('score');
const highScoreElement = document.getElementById('highScore');
const activeUpgradesDiv = document.getElementById('activeUpgrades');
const scoreDisplay = document.getElementById('scoreDisplay');
const highScoreDisplay = document.getElementById('highScoreDisplay');

// Audio elements
const backgroundMusic = document.getElementById('backgroundMusic');
const shootSound = document.getElementById('shootSound');
const explosionSound = document.getElementById('explosionSound');
const powerUpSound = document.getElementById('powerUpSound');
const healSound = document.getElementById('healSound');
const aoeSound = document.getElementById('aoeSound');

// --- Canvas size ---
canvas.width = window.innerWidth;
canvas.height = window.innerHeight;

// --- Game State ---
let keys = Object.create(null);
let bullets = [];
let enemies = [];
let powerUps = [];
let explosions = [];
let particles = [];
let stars = [];
let score = 0;
let gameRunning = false;
let lastShotTime = 0;
let shootInterval = 500; // ms

const player = {
  x: canvas.width / 2,
  y: canvas.height / 2,
  size: 32,
  color: '#00FFFF',
  speed: 5,
  shield: false,
  health: 100,
};

let activeUpgrades = {};
const upgradeDisplayElements = {};

// ---- Object pools ----
const bulletPool = [];
const particlePool = [];

function getBullet() {
  return bulletPool.pop() || { x: 0, y: 0, dx: 0, dy: 0, size: 6, color: '#FFFF00', honing: false };
}
function recycleBullet(b) {
  bulletPool.push(b);
}
function getParticle() {
  return (
    particlePool.pop() || { x: 0, y: 0, radius: 1, color: '#FFFFFF', dx: 0, dy: 0, life: 30 }
  );
}
function recycleParticle(p) {
  particlePool.push(p);
}

const MAX_PARTICLES = 600;

// Initialize star background
function initStars() {
  stars = [];
  for (let i = 0; i < 100; i++) {
    stars.push({
      x: Math.random() * canvas.width,
      y: Math.random() * canvas.height,
      radius: Math.random() * 1.5,
      alpha: Math.random(),
      dx: Math.random() * 0.5 - 0.25,
      dy: Math.random() * 0.5 - 0.25,
    });
  }
}
initStars();

// ---- Input handlers ----
window.addEventListener('keydown', (e) => (keys[e.key.toLowerCase()] = true));
window.addEventListener('keyup', (e) => (keys[e.key.toLowerCase()] = false));
canvas.addEventListener('mousedown', (e) => {
  if (gameRunning && e.button === 0) shoot(e.clientX, e.clientY);
});

// ---- Music ----
export function toggleMusic() {
  backgroundMusic.paused ? backgroundMusic.play() : backgroundMusic.pause();
}

// ---- Game lifecycle helpers ----
export function startGame() {
  instructions.classList.remove('active');
  gameOverScreen.classList.remove('active');
  resetGame();
  gameRunning = true;
  backgroundMusic.play();
  requestAnimationFrame(gameLoop);
}
export function restartGame() {
  gameOverScreen.classList.remove('active');
  resetGame();
  gameRunning = true;
  backgroundMusic.play();
  requestAnimationFrame(gameLoop);
}
function resetGame() {
  Object.assign(player, { x: canvas.width / 2, y: canvas.height / 2, shield: false, health: 100 });
  bullets.length = enemies.length = powerUps.length = explosions.length = particles.length = 0;
  score = 0;
  shootInterval = 500;
  lastShotTime = 0;
  activeUpgrades = {};
  updateActiveUpgrades();
  scoreDisplay.textContent = 'Score: 0';
  highScoreDisplay.textContent = getHighScore();
  initStars();
  enemySpawnInterval = 2000;
  lastEnemySpawnTime = Date.now();
  difficultyIncreaseInterval = 10000;
  lastDifficultyIncreaseTime = Date.now();
}

// ---- Local-storage helpers ----
function getHighScore() {
  return localStorage.getItem('highScore') || 0;
}
function setHighScore(val) {
  localStorage.setItem('highScore', val);
  highScoreDisplay.textContent = val;
}

// ---- Shooting & bullets ----
function shoot(x, y) {
  const now = Date.now();
  if (now - lastShotTime < shootInterval) return;
  lastShotTime = now;
  createBullet(x, y);
}
function createBullet(x, y) {
  const angle = Math.atan2(y - player.y, x - player.x);
  const speed = activeUpgrades.bulletSpeed ? 15 : 10;
  const bulletCount = activeUpgrades.multiBullets ? 3 : 1;
  const spread = activeUpgrades.multiBullets ? Math.PI / 12 : 0;
  for (let i = 0; i < bulletCount; i++) {
    const a = angle + spread * (i - Math.floor(bulletCount / 2));
    const b = getBullet();
    Object.assign(b, {
      x: player.x,
      y: player.y,
      dx: Math.cos(a) * speed,
      dy: Math.sin(a) * speed,
      honing: !!activeUpgrades.bulletHoning,
    });
    bullets.push(b);
    shootSound.currentTime = 0;
    shootSound.play();
  }
}
function handleAutomaticFire() {
  if (!activeUpgrades.automaticFire) return;
  const now = Date.now();
  if (now - lastShotTime > shootInterval) {
    const target = getNearestEnemy();
    if (target) shoot(target.x, target.y);
    else shoot(player.x + 1, player.y);
  }
}

// ---- Enemy helpers ----
let enemySpawnInterval = 2000;
let lastEnemySpawnTime = Date.now();
let difficultyIncreaseInterval = 10000;
let lastDifficultyIncreaseTime = Date.now();
function spawnEnemy() {
  const edge = Math.floor(Math.random() * 4);
  const margin = 60;
  let x, y;
  if (edge === 0) {
    x = Math.random() * canvas.width;
    y = -margin;
  } else if (edge === 1) {
    x = canvas.width + margin;
    y = Math.random() * canvas.height;
  } else if (edge === 2) {
    x = Math.random() * canvas.width;
    y = canvas.height + margin;
  } else {
    x = -margin;
    y = Math.random() * canvas.height;
  }
  const angle = Math.atan2(player.y - y, player.x - x);
  const baseSpeed = 2 + Math.random() * 1.5;
  const speed = activeUpgrades.difficultyMultiplier ? baseSpeed * activeUpgrades.difficultyMultiplier.multiplier : baseSpeed;
  const r = Math.random();
  const type = r > 0.8 ? 'heavy' : r > 0.6 ? 'fast' : 'normal';
  enemies.push({
    x,
    y,
    dx: Math.cos(angle) * speed,
    dy: Math.sin(angle) * speed,
    size: type === 'heavy' ? 35 : type === 'fast' ? 25 : 28,
    color: type === 'heavy' ? '#8B0000' : type === 'fast' ? '#FF4500' : '#FF0000',
    type,
    health: type === 'heavy' ? 3 : 1,
  });
}

// ---- Power-up helpers ----
function spawnPowerUp() {
  const types = ['rapidFire', 'bulletSpeed', 'shield', 'automaticFire', 'multiBullets', 'bulletHoning', 'healthRegen', 'aoeAttack'];
  const type = types[(Math.random() * types.length) | 0];
  const x = Math.random() * (canvas.width - 100) + 50;
  const y = Math.random() * (canvas.height - 100) + 50;
  powerUps.push({
    x,
    y,
    size: 24,
    type,
    color: getPowerUpColor(type),
    duration: type === 'healthRegen' ? 15000 : 10000,
  });
}
function getPowerUpColor(t) {
  return {
    rapidFire: '#00FF00',
    bulletSpeed: '#FFA500',
    shield: '#0000FF',
    automaticFire: '#FF00FF',
    multiBullets: '#00FFFF',
    bulletHoning: '#FFFF00',
    healthRegen: '#FF69B4',
    aoeAttack: '#800080',
  }[t] || '#FFFFFF';
}

// ---- Utility helpers ----
function getNearestEnemy() {
  if (!enemies.length) return null;
  let nearest = enemies[0];
  let minDist = Number.MAX_VALUE;
  for (const e of enemies) {
    const d = Math.hypot(e.x - player.x, e.y - player.y);
    if (d < minDist) {
      minDist = d;
      nearest = e;
    }
  }
  return nearest;
}
function updateBulletHoning() {
  for (const b of bullets) {
    if (!b.honing) continue;
    const target = getNearestEnemy();
    if (!target) continue;
    const angleToTarget = Math.atan2(target.y - b.y, target.x - b.x);
    const currentAngle = Math.atan2(b.dy, b.dx);
    let diff = ((angleToTarget - currentAngle + Math.PI) % (2 * Math.PI)) - Math.PI;
    const rotSpeed = 0.05;
    const newAngle = currentAngle + Math.min(rotSpeed, Math.abs(diff)) * Math.sign(diff);
    const s = Math.hypot(b.dx, b.dy);
    b.dx = Math.cos(newAngle) * s;
    b.dy = Math.sin(newAngle) * s;
  }
}

// ---- Update / Draw helpers ----
function update() {
  // Player movement
  if (keys.w) player.y = Math.max(0, player.y - player.speed);
  if (keys.s) player.y = Math.min(canvas.height, player.y + player.speed);
  if (keys.a) player.x = Math.max(0, player.x - player.speed);
  if (keys.d) player.x = Math.min(canvas.width, player.x + player.speed);

  // Bullets
  bullets.forEach((b, i) => {
    b.x += b.dx;
    b.y += b.dy;
    if (b.x < 0 || b.x > canvas.width || b.y < 0 || b.y > canvas.height) {
      recycleBullet(b);
      bullets.splice(i, 1);
    }
  });
  updateBulletHoning();
  handleAutomaticFire();

  // Enemies
  enemies.forEach((e, ei) => {
    e.x += e.dx;
    e.y += e.dy;
    if (Math.hypot(e.x - player.x, e.y - player.y) < e.size + player.size) {
      if (player.shield) {
        createExplosion(e.x, e.y);
        enemies.splice(ei, 1);
        score += 2;
        updateScore();
      } else {
        endGame();
      }
      return;
    }
    bullets.forEach((b, bi) => {
      if (Math.hypot(e.x - b.x, e.y - b.y) < e.size + b.size) {
        e.health -= 1;
        recycleBullet(b);
        bullets.splice(bi, 1);
        if (e.health <= 0) {
          createExplosion(e.x, e.y);
          enemies.splice(ei, 1);
          score += 1;
          updateScore();
        }
      }
    });
  });

  // Power-ups
  powerUps.forEach((p, pi) => {
    if (Math.hypot(p.x - player.x, p.y - player.y) < p.size + player.size) {
      applyPowerUp(p);
      powerUpSound.currentTime = 0;
      powerUpSound.play();
      powerUps.splice(pi, 1);
    }
  });

  // Timed spawns & difficulty
  const now = Date.now();
  if (now - lastEnemySpawnTime > enemySpawnInterval) {
    spawnEnemy();
    lastEnemySpawnTime = now;
  }
  if (Math.random() < 0.002) spawnPowerUp();
  if (now - lastDifficultyIncreaseTime > difficultyIncreaseInterval) {
    increaseDifficulty();
    lastDifficultyIncreaseTime = now;
  }

  // Explosions
  explosions.forEach((ex, i) => {
    if (--ex.life <= 0) explosions.splice(i, 1);
  });

  // Stars
  stars.forEach((s) => {
    s.x = (s.x + s.dx + canvas.width) % canvas.width;
    s.y = (s.y + s.dy + canvas.height) % canvas.height;
  });

  // Active upgrades expiration
  for (const type in activeUpgrades) {
    if (now > activeUpgrades[type].expiresAt) removeUpgrade(type);
  }

  generateParticles();

  if (score > getHighScore()) setHighScore(score);
}

function generateParticles() {
  particles.forEach((p, i) => {
    p.x += p.dx;
    p.y += p.dy;
    p.life -= 1;
    p.radius *= 0.95;
    if (p.life <= 0 || p.radius <= 0.5) {
      recycleParticle(p);
      particles.splice(i, 1);
    }
  });
  if (particles.length > MAX_PARTICLES) particles.splice(0, particles.length - MAX_PARTICLES);
}

// ---- Difficulty ----
function increaseDifficulty() {
  enemySpawnInterval = Math.max(500, enemySpawnInterval - 200);
  if (activeUpgrades.difficultyMultiplier) activeUpgrades.difficultyMultiplier.multiplier += 0.1;
  else activeUpgrades.difficultyMultiplier = { multiplier: 1.1, expiresAt: Infinity };
  updateActiveUpgrades();
}

// ---- Explosions & particles ----
function createExplosion(x, y) {
  explosions.push({ x, y, size: 30, life: 15 });
  explosionSound.currentTime = 0;
  explosionSound.play();
  for (let i = 0; i < 20; i++) {
    const p = getParticle();
    Object.assign(p, {
      x,
      y,
      radius: Math.random() * 2 + 1,
      color: '#FF4500',
      dx: (Math.random() - 0.5) * 4,
      dy: (Math.random() - 0.5) * 4,
      life: Math.random() * 30 + 30,
    });
    particles.push(p);
  }
}

// ---- Power-up apply/remove ----
function applyPowerUp(p) {
  const now = Date.now();
  switch (p.type) {
    case 'rapidFire':
      shootInterval = 200;
      activeUpgrades.rapidFire = { expiresAt: now + p.duration };
      break;
    case 'bulletSpeed':
      activeUpgrades.bulletSpeed = { expiresAt: now + p.duration };
      break;
    case 'shield':
      player.shield = true;
      activeUpgrades.shield = { expiresAt: now + p.duration };
      break;
    case 'automaticFire':
      activeUpgrades.automaticFire = { expiresAt: now + p.duration };
      break;
    case 'multiBullets':
      activeUpgrades.multiBullets = { expiresAt: now + p.duration };
      break;
    case 'bulletHoning':
      activeUpgrades.bulletHoning = { expiresAt: now + p.duration };
      break;
    case 'healthRegen':
      activeUpgrades.healthRegen = { expiresAt: now + p.duration };
      player.health = Math.min(player.health + 30, 100);
      healSound.currentTime = 0;
      healSound.play();
      break;
    case 'aoeAttack':
      performAOEAttack();
      activeUpgrades.aoeAttack = { expiresAt: now + p.duration };
      break;
  }
  updateActiveUpgrades();
}
function performAOEAttack() {
  enemies.forEach((e, ei) => {
    if (Math.hypot(e.x - player.x, e.y - player.y) < 150) {
      e.health -= 2;
      if (e.health <= 0) {
        createExplosion(e.x, e.y);
        enemies.splice(ei, 1);
        score += 3;
        updateScore();
      }
    }
  });
  aoeSound.currentTime = 0;
  aoeSound.play();
  for (let i = 0; i < 30; i++) {
    const p = getParticle();
    Object.assign(p, {
      x: player.x,
      y: player.y,
      radius: Math.random() * 2 + 1,
      color: '#800080',
      dx: (Math.random() - 0.5) * 6,
      dy: (Math.random() - 0.5) * 6,
      life: Math.random() * 30 + 30,
    });
    particles.push(p);
  }
}
function removeUpgrade(type) {
  if (type === 'rapidFire') shootInterval = 500;
  if (type === 'shield') player.shield = false;
  delete activeUpgrades[type];
  updateActiveUpgrades();
}

// ---- Upgrade DOM ----
function getUpgradeDisplayName(t) {
  return {
    rapidFire: 'Rapid Fire',
    bulletSpeed: 'Bullet Speed',
    shield: 'Shield',
    automaticFire: 'Auto Fire',
    multiBullets: 'Multi-Bullets',
    bulletHoning: 'Bullet Honing',
    healthRegen: 'Health Regen',
    aoeAttack: 'AOE Attack',
  }[t] || t;
}
function updateActiveUpgrades() {
  const now = Date.now();
  // Remove outdated elements
  for (const t in upgradeDisplayElements) {
    if (!activeUpgrades[t] || t === 'difficultyMultiplier') {
      activeUpgradesDiv.removeChild(upgradeDisplayElements[t]);
      delete upgradeDisplayElements[t];
    }
  }
  // Add/update current ones
  for (const t in activeUpgrades) {
    if (t === 'difficultyMultiplier') continue;
    const remaining = Math.max(0, ((activeUpgrades[t].expiresAt - now) / 1000) | 0);
    let el = upgradeDisplayElements[t];
    if (!el) {
      el = document.createElement('div');
      el.classList.add('upgrade');
      upgradeDisplayElements[t] = el;
      activeUpgradesDiv.appendChild(el);
    }
    el.textContent = `${getUpgradeDisplayName(t)}: ${remaining}s`;
  }
}

// ---- Score ----
function updateScore() {
  scoreDisplay.textContent = `Score: ${score}`;
  scoreElement.textContent = score;
}

// ---- Main loop ----
function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  // Stars
  stars.forEach((s) => {
    ctx.beginPath();
    ctx.arc(s.x, s.y, s.radius, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(255,255,255,${s.alpha})`;
    ctx.fill();
  });
  // Player
  ctx.fillStyle = player.color;
  ctx.fillRect(player.x - player.size / 2, player.y - player.size / 2, player.size, player.size);
  ctx.strokeStyle = '#FFFFFF';
  ctx.lineWidth = 2;
  ctx.strokeRect(player.x - player.size / 2, player.y - player.size / 2, player.size, player.size);
  if (player.shield) {
    ctx.strokeStyle = '#0000FF';
    ctx.lineWidth = 4;
    ctx.strokeRect(player.x - player.size / 2 - 10, player.y - player.size / 2 - 10, player.size + 20, player.size + 20);
  }
  // Bullets
  bullets.forEach((b) => {
    ctx.fillStyle = b.color;
    ctx.fillRect(b.x - b.size / 2, b.y - b.size / 2, b.size, b.size);
    ctx.strokeStyle = '#FFFF00';
    ctx.lineWidth = 1;
    ctx.strokeRect(b.x - b.size / 2, b.y - b.size / 2, b.size, b.size);
    // Trail particle
    const p = getParticle();
    Object.assign(p, { x: b.x, y: b.y, radius: 2, color: '#FFFF00', dx: 0, dy: 0, life: 15 });
    particles.push(p);
  });
  // Enemies
  enemies.forEach((e) => {
    ctx.fillStyle = e.color;
    ctx.fillRect(e.x - e.size / 2, e.y - e.size / 2, e.size, e.size);
    ctx.strokeStyle = '#FFFFFF';
    ctx.lineWidth = 2;
    ctx.strokeRect(e.x - e.size / 2, e.y - e.size / 2, e.size, e.size);
    // eyes
    ctx.fillStyle = '#FFFFFF';
    const eye = 4;
    ctx.fillRect(e.x - e.size / 4 - eye / 2, e.y - e.size / 4 - eye / 2, eye, eye);
    ctx.fillRect(e.x + e.size / 4 - eye / 2, e.y - e.size / 4 - eye / 2, eye, eye);
  });
  // Power-ups
  powerUps.forEach((p) => {
    ctx.fillStyle = p.color;
    ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
    ctx.strokeStyle = '#FFFFFF';
    ctx.lineWidth = 2;
    ctx.strokeRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
    ctx.fillStyle = '#000';
    ctx.font = '14px "Press Start 2P"';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(getUpgradeDisplayName(p.type)[0], p.x, p.y + 2);
  });
  // Explosions
  explosions.forEach((ex) => {
    ctx.fillStyle = 'rgba(255,69,0,0.5)';
    ctx.beginPath();
    ctx.arc(ex.x, ex.y, ex.size, 0, Math.PI * 2);
    ctx.fill();
  });
  // Particles
  particles.forEach((p) => {
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
    ctx.fillStyle = p.color;
    ctx.fill();
  });
  // HUD
  ctx.font = "16px 'Press Start 2P'";
  ctx.fillStyle = '#FFFFFF';
  ctx.textAlign = 'left';
  ctx.fillText(`Score: ${score}`, 20, 40);
  ctx.fillText(`High Score: ${getHighScore()}`, canvas.width - 220, 40);
  // Health bar
  ctx.fillStyle = '#555';
  ctx.fillRect(20, 50, 200, 20);
  ctx.fillStyle = '#00FF00';
  ctx.fillRect(20, 50, 2 * player.health, 20);
  ctx.strokeStyle = '#FFFFFF';
  ctx.strokeRect(20, 50, 200, 20);
  ctx.font = "12px 'Press Start 2P'";
  ctx.fillText(`Health: ${player.health}`, 20, 45);
}

function gameLoop() {
  if (!gameRunning) return;
  update();
  draw();
  requestAnimationFrame(gameLoop);
}
function endGame() {
  gameRunning = false;
  gameOverScreen.classList.add('active');
  scoreElement.textContent = score;
  if (score > getHighScore()) setHighScore(score);
  backgroundMusic.pause();
}

// ---- Resize handler ----
window.addEventListener('resize', () => {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  player.x = canvas.width / 2;
  player.y = canvas.height / 2;
  initStars();
});

window.startGame = startGame;
window.restartGame = restartGame;
window.toggleMusic = toggleMusic;