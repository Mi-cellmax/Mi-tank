"use client";

import { useEffect, useRef, useState, useCallback } from "react";

// ==================== Types ====================
interface Position {
  x: number;
  y: number;
}

interface Bullet {
  x: number;
  y: number;
  dx: number;
  dy: number;
  speed: number;
  owner: "player" | "enemy";
  active: boolean;
}

interface Tank {
  x: number;
  y: number;
  width: number;
  height: number;
  direction: Direction;
  speed: number;
  color: string;
  alive: boolean;
  shootCooldown: number;
  maxShootCooldown: number;
}

type Direction = "up" | "down" | "left" | "right";

interface GameState {
  player: Tank;
  enemies: Tank[];
  bullets: Bullet[];
  walls: { x: number; y: number; width: number; height: number }[];
  score: number;
  gameOver: boolean;
  win: boolean;
  level: number;
}

// ==================== Constants ====================
const CANVAS_WIDTH = 780;
const CANVAS_HEIGHT = 600;
const CELL_SIZE = 40;
const COLS = CANVAS_WIDTH / CELL_SIZE;
const ROWS = CANVAS_HEIGHT / CELL_SIZE;
const TANK_SIZE = 36;
const BULLET_SPEED = 8;
const PLAYER_SPEED = 3;
const ENEMY_SPEED = 1.5;
const MAX_ENEMIES = 5;
const SHOOT_COOLDOWN = 20;
const ENEMY_SHOOT_COOLDOWN = 50;

// ==================== Helper Functions ====================
function rectCollision(
  ax: number, ay: number, aw: number, ah: number,
  bx: number, by: number, bw: number, bh: number
): boolean {
  return ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by;
}

function generateWalls(level: number) {
  const walls: { x: number; y: number; width: number; height: number }[] = [];
  
  // Border walls
  for (let i = 0; i < COLS; i++) {
    walls.push({ x: i * CELL_SIZE, y: 0, width: CELL_SIZE, height: CELL_SIZE });
    walls.push({ x: i * CELL_SIZE, y: (ROWS - 1) * CELL_SIZE, width: CELL_SIZE, height: CELL_SIZE });
  }
  for (let i = 0; i < ROWS; i++) {
    walls.push({ x: 0, y: i * CELL_SIZE, width: CELL_SIZE, height: CELL_SIZE });
    walls.push({ x: (COLS - 1) * CELL_SIZE, y: i * CELL_SIZE, width: CELL_SIZE, height: CELL_SIZE });
  }

  // Inner obstacles - different patterns per level
  const patterns = [
    // Level 1
    [
      [5, 3], [5, 4], [5, 5], [5, 6],
      [13, 3], [13, 4], [13, 5], [13, 6],
      [5, 8], [5, 9], [5, 10], [5, 11],
      [13, 8], [13, 9], [13, 10], [13, 11],
      [9, 7],
    ],
    // Level 2+
    [
      [3, 3], [3, 4], [4, 3],
      [15, 3], [15, 4], [14, 3],
      [3, 11], [3, 10], [4, 11],
      [15, 11], [15, 10], [14, 11],
      [9, 5], [9, 6], [9, 7], [9, 8], [9, 9],
      [5, 7], [6, 7], [7, 7], [11, 7], [12, 7], [13, 7],
    ],
  ];

  const pattern = patterns[Math.min(level - 1, patterns.length - 1)];
  for (const [col, row] of pattern) {
    walls.push({
      x: col * CELL_SIZE,
      y: row * CELL_SIZE,
      width: CELL_SIZE,
      height: CELL_SIZE,
    });
  }

  return walls;
}

function createInitialState(level: number): GameState {
  const player: Tank = {
    x: 9 * CELL_SIZE + (CELL_SIZE - TANK_SIZE) / 2,
    y: 13 * CELL_SIZE + (CELL_SIZE - TANK_SIZE) / 2,
    width: TANK_SIZE,
    height: TANK_SIZE,
    direction: "up",
    speed: PLAYER_SPEED,
    color: "#4ade80",
    alive: true,
    shootCooldown: 0,
    maxShootCooldown: SHOOT_COOLDOWN,
  };

  const enemyColors = ["#f87171", "#fb923c", "#facc15", "#60a5fa", "#c084fc"];
  const enemySpawns = [
    [1, 1], [17, 1], [1, 13], [17, 13], [9, 1],
  ];

  const enemies: Tank[] = [];
  const count = Math.min(level + 2, MAX_ENEMIES);
  for (let i = 0; i < count; i++) {
    const [col, row] = enemySpawns[i];
    enemies.push({
      x: col * CELL_SIZE + (CELL_SIZE - TANK_SIZE) / 2,
      y: row * CELL_SIZE + (CELL_SIZE - TANK_SIZE) / 2,
      width: TANK_SIZE,
      height: TANK_SIZE,
      direction: "down" as Direction,
      speed: ENEMY_SPEED + level * 0.2,
      color: enemyColors[i],
      alive: true,
      shootCooldown: Math.floor(Math.random() * ENEMY_SHOOT_COOLDOWN),
      maxShootCooldown: Math.max(10, ENEMY_SHOOT_COOLDOWN - level * 3),
    });
  }

  return {
    player,
    enemies,
    bullets: [],
    walls: generateWalls(level),
    score: 0,
    gameOver: false,
    win: false,
    level,
  };
}

// ==================== Component ====================
export default function TankBattle() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gameStateRef = useRef<GameState>(createInitialState(1));
  const keysRef = useRef<Set<string>>(new Set());
  const [score, setScore] = useState(0);
  const [gameOver, setGameOver] = useState(false);
  const [win, setWin] = useState(false);
  const [level, setLevel] = useState(1);
  const [enemiesLeft, setEnemiesLeft] = useState(0);
  const animFrameRef = useRef<number>(0);

  const restartGame = useCallback(() => {
    const state = createInitialState(1);
    gameStateRef.current = state;
    setScore(0);
    setGameOver(false);
    setWin(false);
    setLevel(1);
    setEnemiesLeft(state.enemies.filter((e) => e.alive).length);
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // --- Input Handling ---
    const handleKeyDown = (e: KeyboardEvent) => {
      keysRef.current.add(e.key);
      if (e.key === " " || e.key === "Spacebar") {
        e.preventDefault();
      }
    };
    const handleKeyUp = (e: KeyboardEvent) => {
      keysRef.current.delete(e.key);
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);

    // --- Game Loop ---
    const gameLoop = (time: number) => {
      if (!ctx) return;
      const state = gameStateRef.current;

      if (!state.gameOver && !state.win) {
        updateGame(state, keysRef.current);
      }

      render(ctx, state);

      // Always sync React state so overlay shows immediately
      setScore(state.score);
      setGameOver(state.gameOver);
      setWin(state.win);
      setLevel(state.level);
      setEnemiesLeft(state.enemies.filter((e) => e.alive).length);

      animFrameRef.current = requestAnimationFrame(gameLoop);
    };

    animFrameRef.current = requestAnimationFrame(gameLoop);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    };
  }, []);

  useEffect(() => {
    setEnemiesLeft(gameStateRef.current.enemies.filter((e) => e.alive).length);
  }, []);

  const nextLevel = useCallback(() => {
    const nextLvl = gameStateRef.current.level + 1;
    const state = createInitialState(nextLvl);
    state.score = gameStateRef.current.score;
    gameStateRef.current = state;
    setLevel(nextLvl);
    setWin(false);
    setGameOver(false);
    setEnemiesLeft(state.enemies.filter((e) => e.alive).length);
  }, []);

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gray-950 py-4 select-none">
      {/* Title */}
      <h1 className="text-4xl font-bold text-green-400 mb-4 tracking-wider">
        🍑 通关可看李瑞铭屁股 🍑
      </h1>
      <p className="text-gray-400 mb-4 text-sm">TANK BATTLE</p>

      {/* Game Canvas */}
      <div className="relative border-4 border-gray-700 rounded-lg overflow-hidden shadow-2xl shadow-green-900/30">
        <canvas
          ref={canvasRef}
          width={CANVAS_WIDTH}
          height={CANVAS_HEIGHT}
          className="block bg-gray-900"
        />

        {/* Overlay for game over / win */}
        {(gameOver || win) && (
          <div className="absolute inset-0 bg-black/70 flex flex-col items-center justify-center">
            <h2 className={`text-5xl font-bold mb-6 ${win ? "text-yellow-400" : "text-red-500"}`}>
              {win ? "🍑 可以看李瑞铭屁股了！" : "💥 游戏结束"}
            </h2>
            <p className="text-gray-300 text-xl mb-2">得分: {score}</p>
            <p className="text-gray-400 mb-8">第 {level} 关</p>
            {win ? (
              <button
                onClick={nextLevel}
                className="px-8 py-3 bg-green-600 hover:bg-green-500 text-white font-bold text-lg rounded-lg transition-colors"
              >
                下一关 →
              </button>
            ) : (
              <button
                onClick={restartGame}
                className="px-8 py-3 bg-red-600 hover:bg-red-500 text-white font-bold text-lg rounded-lg transition-colors"
              >
                重新开始
              </button>
            )}
          </div>
        )}
      </div>

      {/* HUD */}
      <div className="mt-4 flex gap-8 text-sm text-gray-300">
        <div className="bg-gray-800 px-4 py-2 rounded-lg">
          🏆 得分: <span className="text-green-400 font-bold">{score}</span>
        </div>
        <div className="bg-gray-800 px-4 py-2 rounded-lg">
          📊 关卡: <span className="text-yellow-400 font-bold">{level}</span>
        </div>
        <div className="bg-gray-800 px-4 py-2 rounded-lg">
          🎯 剩余敌人: <span className="text-red-400 font-bold">{enemiesLeft}</span>
        </div>
      </div>

      {/* Controls */}
      <div className="mt-4 bg-gray-800/50 px-6 py-3 rounded-lg text-xs text-gray-400">
        <span className="text-white font-bold">操作:</span>{" "}
        <kbd className="bg-gray-700 px-2 py-0.5 rounded">↑ ↓ ← →</kbd> 移动 &nbsp;|&nbsp;
        <kbd className="bg-gray-700 px-2 py-0.5 rounded">空格</kbd> 射击
      </div>
    </div>
  );
}

// ==================== Game Update ====================
function updateGame(state: GameState, keys: Set<string>) {
  const { player, enemies, bullets, walls } = state;

  // --- Player Movement ---
  let dx = 0,
    dy = 0;
  let newDir: Direction | null = null;

  if (keys.has("ArrowUp") || keys.has("w")) {
    dy = -1;
    newDir = "up";
  } else if (keys.has("ArrowDown") || keys.has("s")) {
    dy = 1;
    newDir = "down";
  } else if (keys.has("ArrowLeft") || keys.has("a")) {
    dx = -1;
    newDir = "left";
  } else if (keys.has("ArrowRight") || keys.has("d")) {
    dx = 1;
    newDir = "right";
  }

  if (newDir) {
    player.direction = newDir;
    const newX = player.x + dx * player.speed;
    const newY = player.y + dy * player.speed;

    // Wall collision check
    let blocked = false;
    for (const wall of walls) {
      if (
        rectCollision(newX, newY, player.width, player.height, wall.x, wall.y, wall.width, wall.height)
      ) {
        blocked = true;
        break;
      }
    }
    // Enemy collision check
    for (const enemy of enemies) {
      if (!enemy.alive) continue;
      if (
        rectCollision(newX, newY, player.width, player.height, enemy.x, enemy.y, enemy.width, enemy.height)
      ) {
        blocked = true;
        break;
      }
    }

    if (!blocked) {
      player.x = Math.max(CELL_SIZE, Math.min(newX, CANVAS_WIDTH - CELL_SIZE - player.width));
      player.y = Math.max(CELL_SIZE, Math.min(newY, CANVAS_HEIGHT - CELL_SIZE - player.height));
    }
  }

  // --- Player Shooting ---
  if (player.shootCooldown > 0) player.shootCooldown--;
  if ((keys.has(" ") || keys.has("Spacebar")) && player.shootCooldown <= 0) {
    spawnBullet(player, "player", state);
    player.shootCooldown = player.maxShootCooldown;
  }

  // --- Enemy AI ---
  for (const enemy of enemies) {
    if (!enemy.alive) continue;

    // Change direction periodically or on collision
    if (Math.random() < 0.02) {
      const dirs: Direction[] = ["up", "down", "left", "right"];
      enemy.direction = dirs[Math.floor(Math.random() * 4)];
    }

    // Move enemy
    let edx = 0,
      edy = 0;
    switch (enemy.direction) {
      case "up":    edy = -1; break;
      case "down":  edy = 1;  break;
      case "left":  edx = -1; break;
      case "right": edx = 1;  break;
    }

    const eNewX = enemy.x + edx * enemy.speed;
    const eNewY = enemy.y + edy * enemy.speed;

    let eBlocked = false;
    for (const wall of walls) {
      if (rectCollision(eNewX, eNewY, enemy.width, enemy.height, wall.x, wall.y, wall.width, wall.height)) {
        eBlocked = true;
        break;
      }
    }
    if (rectCollision(eNewX, eNewY, enemy.width, enemy.height, player.x, player.y, player.width, player.height)) {
      eBlocked = true;
    }
    for (const other of enemies) {
      if (other === enemy || !other.alive) continue;
      if (rectCollision(eNewX, eNewY, enemy.width, enemy.height, other.x, other.y, other.width, other.height)) {
        eBlocked = true;
        break;
      }
    }

    if (eBlocked) {
      const dirs: Direction[] = ["up", "down", "left", "right"];
      enemy.direction = dirs[Math.floor(Math.random() * 4)];
    } else {
      enemy.x = eNewX;
      enemy.y = eNewY;
    }

    // Enemy shooting
    if (enemy.shootCooldown > 0) enemy.shootCooldown--;
    if (enemy.shootCooldown <= 0 && Math.random() < 0.03) {
      spawnBullet(enemy, "enemy", state);
      enemy.shootCooldown = enemy.maxShootCooldown;
    }
  }

  // --- Update Bullets ---
  for (const bullet of bullets) {
    if (!bullet.active) continue;
    bullet.x += bullet.dx * bullet.speed;
    bullet.y += bullet.dy * bullet.speed;

    // Wall collision
    let bulletHit = false;
    for (const wall of walls) {
      if (rectCollision(bullet.x - 2, bullet.y - 2, 4, 4, wall.x, wall.y, wall.width, wall.height)) {
        bulletHit = true;
        break;
      }
    }

    // Out of bounds
    if (
      bullet.x < 0 || bullet.x > CANVAS_WIDTH ||
      bullet.y < 0 || bullet.y > CANVAS_HEIGHT
    ) {
      bulletHit = true;
    }

    if (bulletHit) {
      bullet.active = false;
      continue;
    }

    // Player bullet hits enemy
    if (bullet.owner === "player") {
      for (const enemy of enemies) {
        if (!enemy.alive) continue;
        if (rectCollision(bullet.x - 2, bullet.y - 2, 4, 4, enemy.x, enemy.y, enemy.width, enemy.height)) {
          enemy.alive = false;
          bullet.active = false;
          state.score += 100;
          break;
        }
      }
    }

    // Enemy bullet hits player
    if (bullet.owner === "enemy" && bullet.active) {
      if (rectCollision(bullet.x - 2, bullet.y - 2, 4, 4, player.x, player.y, player.width, player.height)) {
        player.alive = false;
        bullet.active = false;
        state.gameOver = true;
      }
    }
  }

  // Clean up inactive bullets
  state.bullets = bullets.filter((b) => b.active);

  // Check win condition
  if (enemies.every((e) => !e.alive)) {
    state.win = true;
  }
}

function spawnBullet(tank: Tank, owner: "player" | "enemy", state: GameState) {
  const bulletSize = 6;
  let bx = tank.x + tank.width / 2 - bulletSize / 2;
  let by = tank.y + tank.height / 2 - bulletSize / 2;
  let bdx = 0,
    bdy = 0;

  const offset = tank.width / 2 - bulletSize / 2;

  switch (tank.direction) {
    case "up":
      bdx = 0;
      bdy = -1;
      bx = tank.x + offset;
      by = tank.y - bulletSize;
      break;
    case "down":
      bdx = 0;
      bdy = 1;
      bx = tank.x + offset;
      by = tank.y + tank.height;
      break;
    case "left":
      bdx = -1;
      bdy = 0;
      bx = tank.x - bulletSize;
      by = tank.y + offset;
      break;
    case "right":
      bdx = 1;
      bdy = 0;
      bx = tank.x + tank.width;
      by = tank.y + offset;
      break;
  }

  state.bullets.push({
    x: bx,
    y: by,
    dx: bdx,
    dy: bdy,
    speed: BULLET_SPEED,
    owner,
    active: true,
  });
}

// ==================== Render ====================
function render(ctx: CanvasRenderingContext2D, state: GameState) {
  // Clear
  ctx.fillStyle = "#1a1a2e";
  ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

  // Grid lines (subtle)
  ctx.strokeStyle = "#1e293b";
  ctx.lineWidth = 0.5;
  for (let x = 0; x <= CANVAS_WIDTH; x += CELL_SIZE) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, CANVAS_HEIGHT);
    ctx.stroke();
  }
  for (let y = 0; y <= CANVAS_HEIGHT; y += CELL_SIZE) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(CANVAS_WIDTH, y);
    ctx.stroke();
  }

  // Walls
  for (const wall of state.walls) {
    const isBorder =
      wall.x === 0 || wall.y === 0 ||
      wall.x === (COLS - 1) * CELL_SIZE ||
      wall.y === (ROWS - 1) * CELL_SIZE;

    if (isBorder) {
      // Border - steel look
      ctx.fillStyle = "#475569";
      ctx.fillRect(wall.x, wall.y, wall.width, wall.height);
      ctx.strokeStyle = "#64748b";
      ctx.lineWidth = 2;
      ctx.strokeRect(wall.x + 1, wall.y + 1, wall.width - 2, wall.height - 2);
    } else {
      // Inner - brick look
      ctx.fillStyle = "#92400e";
      ctx.fillRect(wall.x, wall.y, wall.width, wall.height);
      ctx.strokeStyle = "#b45309";
      ctx.lineWidth = 1;
      ctx.strokeRect(wall.x + 1, wall.y + 1, wall.width - 2, wall.height - 2);
      // Brick lines
      ctx.strokeStyle = "#78350f";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(wall.x, wall.y + wall.height / 2);
      ctx.lineTo(wall.x + wall.width, wall.y + wall.height / 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(wall.x + wall.width / 2, wall.y);
      ctx.lineTo(wall.x + wall.width / 2, wall.y + wall.height / 2);
      ctx.stroke();
    }
  }

  // Bullets
  for (const bullet of state.bullets) {
    if (!bullet.active) continue;
    ctx.fillStyle = bullet.owner === "player" ? "#4ade80" : "#fbbf24";
    ctx.shadowColor = bullet.owner === "player" ? "#22c55e" : "#f59e0b";
    ctx.shadowBlur = 6;
    ctx.beginPath();
    ctx.arc(bullet.x, bullet.y, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
  }

  // Enemies
  for (const enemy of state.enemies) {
    if (!enemy.alive) continue;
    drawTank(ctx, enemy);
  }

  // Player
  if (state.player.alive) {
    drawTank(ctx, state.player);
  }
}

function drawTank(ctx: CanvasRenderingContext2D, tank: Tank) {
  const { x, y, width, height, direction, color } = tank;
  const cx = x + width / 2;
  const cy = y + height / 2;

  ctx.save();
  ctx.translate(cx, cy);

  let angle = 0;
  switch (direction) {
    case "up":    angle = -Math.PI / 2; break;
    case "down":  angle = Math.PI / 2;  break;
    case "left":  angle = Math.PI;      break;
    case "right": angle = 0;            break;
  }
  ctx.rotate(angle);

  const hw = width / 2;
  const hh = height / 2;

  // Tracks
  ctx.fillStyle = "#334155";
  ctx.fillRect(-hw, -hh + 2, hw * 2, 8);       // left track
  ctx.fillRect(-hw, hh - 10, hw * 2, 8);       // right track

  // Track details
  ctx.strokeStyle = "#1e293b";
  ctx.lineWidth = 1;
  for (let i = -hw + 4; i < hw; i += 6) {
    ctx.beginPath();
    ctx.moveTo(i, -hh + 2);
    ctx.lineTo(i, -hh + 10);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(i, hh - 10);
    ctx.lineTo(i, hh - 2);
    ctx.stroke();
  }

  // Body
  ctx.fillStyle = color;
  ctx.fillRect(-hw + 4, -hh + 10, hw * 2 - 8, hh * 2 - 20);

  // Body details
  const darkerColor = adjustColor(color, -30);
  ctx.fillStyle = darkerColor;
  ctx.fillRect(-hw + 8, -hh + 10, hw * 2 - 16, hh * 2 - 20);

  // Barrel
  ctx.fillStyle = color;
  ctx.fillRect(-3, -hh + 10, 6, -12);           // barrel sticking out top

  // Turret (circle on top)
  ctx.fillStyle = lighterColor(color, 20);
  ctx.beginPath();
  ctx.arc(0, -hh + 16, 8, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}

function adjustColor(hex: string, amount: number): string {
  const num = parseInt(hex.slice(1), 16);
  const r = Math.min(255, Math.max(0, ((num >> 16) & 0xff) + amount));
  const g = Math.min(255, Math.max(0, ((num >> 8) & 0xff) + amount));
  const b = Math.min(255, Math.max(0, (num & 0xff) + amount));
  return `rgb(${r},${g},${b})`;
}

function lighterColor(hex: string, amount: number): string {
  return adjustColor(hex, amount);
}
