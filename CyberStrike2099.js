/**
 * ==============================================================================
 *  CYBER STRIKE 2099 (v4.0)
 *  Futuristic Synthwave Arcade Shooter & Combat Runner for Bruce
 *  Optimized for 3-Button Navigation (UP, DOWN, SELECT) on ESP32-C5-TFT & Bruce Handhelds
 * ==============================================================================
 *  Controls:
 *    [UP / PREV]   : Menu Up / Steer Ship Upwards
 *    [DOWN / NEXT] : Menu Down / Steer Ship Downwards
 *    [SELECT]      : Confirm Menu / Hold to Fire Plasma Cannons
 *                    Double-Tap (when EMP bar is flashing) -> Unleash EMP SHOCKWAVE!
 *    [UP + DOWN]   : Pause / Back / Save & Exit Game
 * ==============================================================================
 */

// --- Module Imports ---
var display = require('display');
var keyboard = require('keyboard');
var audio = require('audio');
var led = require('led');
var storage = require('storage');

// --- Fast RGB565 Color Helper ---
function rgb(r, g, b) {
    return ((r & 0xF8) << 8) | ((g & 0xFC) << 3) | (b >> 3);
}

// --- Universal Drawing Primitives (Compatible with both Sprite & Display) ---
function fastHLine(x, y, w, color) {
    if (w <= 0) return;
    var ix = x | 0;
    var iy = y | 0;
    gfx.drawLine(ix, iy, ix + (w | 0) - 1, iy, color);
}

function fastVLine(x, y, h, color) {
    if (h <= 0) return;
    var ix = x | 0;
    var iy = y | 0;
    gfx.drawLine(ix, iy, ix, iy + (h | 0) - 1, color);
}

// --- Cyberpunk / Synthwave Color Palette ---
var C_BLACK       = 0x0000;
var C_NAVY        = rgb(8, 8, 22);
var C_DEEP_SPACE  = rgb(4, 5, 14);
var C_GRID_PURPLE = rgb(35, 15, 60);
var C_GRID_CYAN   = rgb(10, 45, 75);
var C_WHITE       = 0xFFFF;
var C_FLASH_YEL   = rgb(255, 255, 190);
var C_CYAN        = rgb(0, 245, 255);
var C_NEON_BLUE   = rgb(30, 140, 255);
var C_DEEP_BLUE   = rgb(10, 50, 150);
var C_MAGENTA     = rgb(255, 0, 140);
var C_PURPLE      = rgb(170, 30, 240);
var C_YELLOW      = rgb(255, 235, 0);
var C_GOLD        = rgb(255, 195, 0);
var C_ORANGE      = rgb(255, 115, 0);
var C_DARK_ORANGE = rgb(165, 55, 0);
var C_RED         = rgb(255, 30, 40);
var C_CRIMSON     = rgb(170, 10, 25);
var C_LIGHT_RED   = rgb(255, 130, 130);
var C_GREEN       = rgb(0, 255, 120);
var C_DARK_GREEN  = rgb(0, 135, 55);
var C_LIGHT_GREEN = rgb(150, 255, 195);
var C_GREY        = rgb(110, 120, 140);
var C_DARK_GREY   = rgb(45, 50, 65);
var C_SMOKE       = rgb(85, 80, 95);
var C_DARK_SMOKE  = rgb(50, 48, 58);

// --- Screen Configuration & Double Buffering ---
var screenWidth  = typeof display.width === 'function' ? display.width() : 320;
var screenHeight = typeof display.height === 'function' ? display.height() : 240;

var gfx = display;
var hasSprite = false;
if (typeof display.createSprite === 'function') {
    var s = display.createSprite();
    if (s && typeof s.fill === 'function') {
        gfx = s;
        hasSprite = true;
    }
}

// --- Non-Blocking Audio Wrapper ---
function playSound(freq, dur) {
    if (audio && typeof audio.tone === 'function') {
        audio.tone(freq, dur, true);
    }
}

// --- Game States ---
var STATE_TITLE             = 0;
var STATE_SAVE_SLOTS        = 1;
var STATE_SELECT_OVERWRITE  = 2;
var STATE_CONFIRM_OVERWRITE = 3;
var STATE_DIFFICULTY        = 4;
var STATE_LAUNCH_ANIM       = 5;
var STATE_PLAYING           = 6;
var STATE_PAUSED            = 7;
var STATE_DYING             = 8;
var STATE_GAMEOVER          = 9;

// --- Difficulty Constants ---
var DIFF_EASY   = 0;
var DIFF_NORMAL = 1;
var DIFF_HARD   = 2;
var DIFF_NAMES  = ["EASY", "NORMAL", "HARD"];

// --- Global Game Variables ---
var gameState = STATE_TITLE;
var highScore = 0;
var currentDifficulty = DIFF_NORMAL;
var score = 0;
var wave = 1;
var waveTimer = 0;
var waveKills = 0;
var totalKills = 0;
var playTimeMs = 0;
var lastFrameTime = Date.now();
var screenShake = 0;
var flashbangTimer = 0;

// --- 3-Slot Save System & Menu Navigation State ---
var saveSlots = [null, null, null];
var activeSlotIndex = 0;      // 0, 1, or 2
var slotMenuCursor = 0;       // 0..2 = Slots 1..3, 3 = [+ NEW GAME]
var overwriteCursor = 0;      // 0..2 = Slots 1..3, 3 = CANCEL
var confirmOverwriteIdx = 0;  // 0 = NO (KEEP SAVE), 1 = YES (OVERWRITE)
var difficultyCursor = 1;     // 0 = EASY, 1 = NORMAL, 2 = HARD
var pendingNewSlot = 0;
var launchAnimTimer = 0;
var lastMenuMoveTime = 0;

// Autosave Throttling
var SAVE_SPEC = { fs: "littlefs", path: "/cyberstrike_save.json" };
var SAVE_PATH_FALLBACK = "/cyberstrike_save.json";
var saveDirty = false;
var lastAutoSaveTime = 0;

// Combo Multiplier System
var comboCount = 0;
var comboTimer = 0;
var maxCombo = 1;

// Player Ship State
var playerX = 38;
var playerY = screenHeight / 2;
var playerTargetY = playerY;
var playerSpeed = 8.5;
var playerShield = 3;
var playerMaxShield = 3;
var playerHull = 3;
var playerMaxHull = 3;
var playerInvincible = 0;
var shieldRegenTimer = 0;
var playerWeaponTier = 1;
var playerOverdrive = 0;
var lastFireTime = 0;
var fireCooldown = 100;
var lastTapTime = 0;
var selWasPressed = false;
var frameCounter = 0;

// Dramatic Ship Burning & Crash Sequence State
var dyingTimer = 0;
var dyingVy = 0;
var dyingExploded = false;
var crashShockwaveRadius = 0;

// Entity Collections
var stars = [];
var particles = [];
var blastRings = [];
var floatingTexts = [];
var playerBullets = [];
var enemyBullets = [];
var enemies = [];
var powerups = [];
var empShockwave = null;

// Boss State & 5 Natural-Sounding Iconic Bosses
var boss = null;
var lastBossIndex = -1;
var BOSS_POOL = [
    {
        id: 0,
        name: "THE DREADNOUGHT",
        primaryColor: C_MAGENTA,
        secondaryColor: C_CRIMSON,
        coreColor: C_CYAN,
        vy: 1.3,
        width: 56,
        height: 74
    },
    {
        id: 1,
        name: "NIGHT VIPER",
        primaryColor: C_CYAN,
        secondaryColor: C_DEEP_BLUE,
        coreColor: C_PURPLE,
        vy: 1.7,
        width: 54,
        height: 68
    },
    {
        id: 2,
        name: "SOLAR FALCON",
        primaryColor: C_GOLD,
        secondaryColor: C_ORANGE,
        coreColor: C_WHITE,
        vy: 2.0,
        width: 52,
        height: 70
    },
    {
        id: 3,
        name: "BLACK WIDOW",
        primaryColor: C_GREEN,
        secondaryColor: C_PURPLE,
        coreColor: C_YELLOW,
        vy: 1.5,
        width: 54,
        height: 72
    },
    {
        id: 4,
        name: "CRIMSON TITAN",
        primaryColor: C_RED,
        secondaryColor: C_DARK_GREY,
        coreColor: C_GOLD,
        vy: 1.15,
        width: 58,
        height: 76
    }
];

// --- Format Milliseconds into Clean Play Time String (e.g., "04m 18s" or "1h 12m") ---
function formatPlayTime(ms) {
    if (!ms || ms < 0) ms = 0;
    var totalSec = (ms / 1000) | 0;
    var mins = (totalSec / 60) | 0;
    var secs = totalSec % 60;
    if (mins >= 60) {
        var hrs = (mins / 60) | 0;
        var remMins = mins % 60;
        return hrs + "h " + (remMins < 10 ? "0" : "") + remMins + "m";
    }
    return (mins < 10 ? "0" : "") + mins + "m " + (secs < 10 ? "0" : "") + secs + "s";
}

// --- Draw Shiny 3D Difficulty Orb (Green = Easy, Orange = Normal, Red = Hard) ---
function drawShinyOrb(cx, cy, diff) {
    var outerColor = diff === DIFF_EASY ? C_DARK_GREEN : (diff === DIFF_NORMAL ? C_DARK_ORANGE : C_CRIMSON);
    var mainColor  = diff === DIFF_EASY ? C_GREEN      : (diff === DIFF_NORMAL ? C_ORANGE      : C_RED);
    var glowColor  = diff === DIFF_EASY ? C_LIGHT_GREEN: (diff === DIFF_NORMAL ? C_YELLOW      : C_LIGHT_RED);

    // 3D Shaded Rim + Main Sphere + Inner Highlight + Specular White Gleam
    gfx.drawFillCircle(cx, cy, 7, outerColor);
    gfx.drawFillCircle(cx, cy, 6, mainColor);
    gfx.drawFillCircle(cx - 1, cy - 1, 3, glowColor);
    gfx.drawFillRect(cx - 3, cy - 3, 2, 2, C_WHITE);
    gfx.drawPixel(cx + 2, cy + 3, glowColor);
}

// --- Persistent 3-Slot Save System ---
function normalizeSlot(rawSlot) {
    if (!rawSlot || typeof rawSlot !== 'object' || !rawSlot.used) return null;
    return {
        used: true,
        difficulty: typeof rawSlot.difficulty === 'number' ? rawSlot.difficulty : DIFF_NORMAL,
        score: rawSlot.score || 0,
        wave: rawSlot.wave || 1,
        playTimeMs: rawSlot.playTimeMs || 0,
        weaponTier: rawSlot.weaponTier || 1,
        shield: typeof rawSlot.shield === 'number' ? rawSlot.shield : 3,
        hull: (typeof rawSlot.hull === 'number' && rawSlot.hull > 0) ? rawSlot.hull : 3,
        overdrive: rawSlot.overdrive || 0,
        totalKills: rawSlot.totalKills || 0,
        maxCombo: rawSlot.maxCombo || 1
    };
}

function loadSavedData() {
    if (!storage || typeof storage.read !== 'function') return;
    var raw = null;
    try {
        raw = storage.read(SAVE_SPEC);
    } catch (errLoad1) {
        try {
            raw = storage.read(SAVE_PATH_FALLBACK);
        } catch (errLoad2) {
            raw = null;
        }
    }

    if (!raw || typeof raw !== 'string') return;

    try {
        var data = JSON.parse(raw);
        if (data && typeof data === 'object') {
            if (typeof data.highScore === 'number' && data.highScore > highScore) {
                highScore = data.highScore;
            }
            if (data.slots && data.slots.length === 3) {
                for (var i = 0; i < 3; i++) {
                    saveSlots[i] = normalizeSlot(data.slots[i]);
                }
            } else if (typeof data.score === 'number' && data.score > 0) {
                // Migrate legacy single-save into Slot 1 automatically
                saveSlots[0] = {
                    used: true,
                    difficulty: DIFF_NORMAL,
                    score: data.score || 0,
                    wave: data.wave || 1,
                    playTimeMs: 0,
                    weaponTier: data.weaponTier || 1,
                    shield: typeof data.shield === 'number' ? data.shield : 3,
                    hull: (typeof data.hull === 'number' && data.hull > 0) ? data.hull : 3,
                    overdrive: data.overdrive || 0,
                    totalKills: data.totalKills || 0,
                    maxCombo: data.maxCombo || 1
                };
                saveSlots[1] = null;
                saveSlots[2] = null;
            }
        }
    } catch (errParse) {}
}

function writeAllSlotsToStorage() {
    if (!storage || typeof storage.write !== 'function') return;
    var payloadObj = {
        highScore: highScore,
        slots: saveSlots
    };
    var jsonStr = JSON.stringify(payloadObj);
    try {
        var ok = storage.write(SAVE_SPEC, jsonStr, "write");
        if (!ok) {
            storage.write(SAVE_PATH_FALLBACK, jsonStr, "write");
        }
    } catch (errWrite1) {
        try {
            storage.write(SAVE_PATH_FALLBACK, jsonStr, "write");
        } catch (errWrite2) {}
    }
}

function saveGameProgress(forceNow) {
    var now = Date.now();
    if (!forceNow && (now - lastAutoSaveTime < 4500)) {
        saveDirty = true;
        return;
    }

    lastAutoSaveTime = now;
    saveDirty = false;

    if (score > highScore) {
        highScore = score;
    }

    var saveHull = playerHull > 0 ? playerHull : playerMaxHull;
    var saveShield = playerHull > 0 ? playerShield : playerMaxShield;

    saveSlots[activeSlotIndex] = {
        used: true,
        difficulty: currentDifficulty,
        score: score,
        wave: wave,
        playTimeMs: playTimeMs | 0,
        weaponTier: playerWeaponTier,
        shield: saveShield,
        hull: saveHull,
        overdrive: playerOverdrive,
        totalKills: totalKills,
        maxCombo: maxCombo
    };

    writeAllSlotsToStorage();
}

// --- High-Refresh Parallax Starfield & Synthwave Grid ---
function initStars() {
    stars = [];
    var count = 20;
    for (var i = 0; i < count; i++) {
        var layer = (i % 3) + 1;
        stars.push({
            x: (Math.random() * screenWidth) | 0,
            y: ((Math.random() * (screenHeight - 42)) | 0) + 20,
            speed: layer === 1 ? 2 : (layer === 2 ? 4 : 7),
            layer: layer,
            color: layer === 1 ? rgb(75, 85, 125) : (layer === 2 ? C_CYAN : C_WHITE)
        });
    }
}

function updateAndDrawBackground(warpMult) {
    warpMult = warpMult || 1;
    gfx.fill(C_DEEP_SPACE);

    for (var i = 0; i < stars.length; i++) {
        var st = stars[i];
        st.x -= st.speed * warpMult;
        if (st.x < 0) {
            st.x = screenWidth + 2;
            st.y = ((Math.random() * (screenHeight - 42)) | 0) + 20;
        }
        if (warpMult > 1 || st.layer === 3) {
            fastHLine(st.x, st.y, 3 * warpMult, st.color);
        } else {
            gfx.drawPixel(st.x, st.y, st.color);
        }
    }

    var gridY = screenHeight - 16;
    fastHLine(0, gridY, screenWidth, C_GRID_PURPLE);
    fastHLine(0, gridY + 7, screenWidth, C_GRID_CYAN);
    fastHLine(0, screenHeight - 1, screenWidth, C_MAGENTA);

    var gridOffset = ((Date.now() >> 4) % 40);
    for (var gx = -gridOffset; gx < screenWidth + 40; gx += 40) {
        gfx.drawLine(gx, gridY, gx - 14, screenHeight - 1, C_GRID_PURPLE);
    }
}

// --- High-Speed Particle & Dramatic Blast Ring Engine ---
function spawnExplosion(x, y, color, count, speedMult) {
    count = count || 10;
    if (particles.length > 60) count = Math.min(count, 6);
    speedMult = speedMult || 1.0;
    for (var i = 0; i < count; i++) {
        var angle = Math.random() * 6.283;
        var spd = (Math.random() * 4.0 + 1.0) * speedMult;
        var c = color;
        if (i === 0) c = C_WHITE;
        else if (i === 1) c = C_YELLOW;
        else if (i === 2) c = C_ORANGE;

        particles.push({
            x: x,
            y: y,
            vx: Math.cos(angle) * spd,
            vy: Math.sin(angle) * spd,
            life: ((Math.random() * 11) | 0) + 6,
            color: c,
            size: (i & 1) === 0 ? 2 : 1
        });
    }
}

function spawnDramaticEnemyBlast(x, y, color, isHeavy) {
    spawnExplosion(x, y, color, isHeavy ? 16 : 11, isHeavy ? 1.5 : 1.2);
    spawnExplosion(x, y, C_ORANGE, isHeavy ? 8 : 5, 1.0);

    if (blastRings.length < 6) {
        blastRings.push({
            x: x | 0,
            y: y | 0,
            r: 3,
            maxR: isHeavy ? 28 : 18,
            color: color
        });
    }
    if (screenShake < 4) screenShake = isHeavy ? 5 : 3;
}

function spawnSparks(x, y, color, count) {
    if (particles.length > 55) return;
    count = count || 3;
    for (var i = 0; i < count; i++) {
        particles.push({
            x: x,
            y: y,
            vx: -(Math.random() * 3.5 + 1.0),
            vy: (Math.random() - 0.5) * 4.0,
            life: 5,
            color: color,
            size: 1
        });
    }
}

function updateAndDrawParticles() {
    for (var ri = blastRings.length - 1; ri >= 0; ri--) {
        var br = blastRings[ri];
        br.r += 3;
        if (br.r >= br.maxR) {
            blastRings.splice(ri, 1);
            continue;
        }
        if (br.r < 10) {
            gfx.drawFillCircle(br.x, br.y, (10 - br.r) >> 1, C_WHITE);
        }
        gfx.drawCircle(br.x, br.y, br.r, br.r < (br.maxR >> 1) ? C_YELLOW : br.color);
    }

    for (var i = particles.length - 1; i >= 0; i--) {
        var p = particles[i];
        p.x += p.vx;
        p.y += p.vy;
        p.life--;

        if (p.life <= 0) {
            particles.splice(i, 1);
            continue;
        }

        if (p.size > 1) {
            gfx.drawFillRect(p.x | 0, p.y | 0, p.size, p.size, p.color);
        } else {
            gfx.drawPixel(p.x | 0, p.y | 0, p.color);
        }
    }
}

// --- Floating Combat Text ---
function addFloatingText(text, x, y, color) {
    if (floatingTexts.length >= 4) floatingTexts.shift();
    var ix = x | 0;
    var iy = y | 0;
    if (ix < 6) ix = 6;
    if (ix > screenWidth - 80) ix = screenWidth - 80;
    if (iy < 24) iy = 24;

    floatingTexts.push({
        text: text,
        x: ix,
        y: iy,
        color: color,
        life: 20
    });
}

function updateAndDrawFloatingTexts() {
    gfx.setTextSize(1);
    for (var i = floatingTexts.length - 1; i >= 0; i--) {
        var ft = floatingTexts[i];
        ft.y -= 1;
        ft.life--;
        if (ft.life <= 0) {
            floatingTexts.splice(i, 1);
            continue;
        }
        gfx.setTextColor(ft.color);
        gfx.drawString(ft.text, ft.x, ft.y | 0);
    }
}

// --- Tiny Enemy Health Bar (Appears Once Enemy Has Been Hit) ---
function drawEnemyHealthBar(x, y, topOffset, hp, maxHp) {
    if (hp >= maxHp || hp <= 0) return;
    var barW = 16;
    var bx = (x | 0) - 8;
    var by = (y | 0) - topOffset - 5;
    if (by < 20) by = (y | 0) + topOffset + 3;

    gfx.drawFillRect(bx, by, barW, 3, C_BLACK);
    var fillW = ((hp * (barW - 2)) / maxHp) | 0;
    if (fillW < 1) fillW = 1;
    var ratio = hp / maxHp;
    var c = ratio > 0.55 ? C_GREEN : (ratio > 0.28 ? C_YELLOW : C_RED);
    gfx.drawFillRect(bx + 1, by + 1, fillW, 1, c);
}

// --- Progressive Enemy Hull Damage & Fire Overlay ---
function drawEnemyDamageEffects(ex, ey, hp, maxHp) {
    if (hp >= maxHp || hp <= 0) return;
    var ratio = hp / maxHp;
    var flicker = ((Date.now() & 32) === 0);

    gfx.drawFillRect(ex - 3, ey - 2, 3, 3, C_BLACK);
    if ((frameCounter & 3) === 0 && particles.length < 50) {
        particles.push({
            x: ex,
            y: ey - 2,
            vx: -1.8,
            vy: -0.6,
            life: 7,
            color: C_SMOKE,
            size: 2
        });
    }

    if (ratio <= 0.55) {
        gfx.drawFillCircle(ex - 2, ey - 2, 3, flicker ? C_ORANGE : C_RED);
        gfx.drawPixel(ex - 2, ey - 2, C_YELLOW);
        if (ratio <= 0.3) {
            gfx.drawFillCircle(ex + 3, ey + 2, 3, flicker ? C_YELLOW : C_ORANGE);
            if ((frameCounter & 1) === 0 && particles.length < 55) {
                particles.push({
                    x: ex + 2,
                    y: ey,
                    vx: -2.2,
                    vy: (Math.random() - 0.5) * 2.0,
                    life: 6,
                    color: flicker ? C_YELLOW : C_ORANGE,
                    size: 2
                });
            }
        }
    }
}

// --- Player Ship Renderer (With Smoke at 2/3 HP and Visible Fire at 1/3 HP) ---
function drawPlayerShip(x, y, showDamageFX) {
    if (playerInvincible > 0 && (playerInvincible & 2) === 0) {
        return;
    }

    var ix = x | 0;
    var iy = y | 0;
    var flicker = ((Date.now() & 32) === 0);

    // Thruster Plume
    var flameLen = ((Date.now() & 64) === 0) ? 11 : 6;
    gfx.drawFillRect(ix - 12 - flameLen, iy - 2, flameLen, 5, C_ORANGE);
    fastHLine(ix - 10 - flameLen, iy, flameLen + 2, C_CYAN);

    // Swept Outer Wings
    gfx.drawLine(ix - 12, iy - 12, ix + 4, iy - 2, C_NEON_BLUE);
    gfx.drawLine(ix - 12, iy - 11, ix + 2, iy - 2, C_CYAN);
    gfx.drawLine(ix - 12, iy + 12, ix + 4, iy + 2, C_NEON_BLUE);
    gfx.drawLine(ix - 12, iy + 11, ix + 2, iy + 2, C_CYAN);
    fastVLine(ix - 12, iy - 12, 25, C_NEON_BLUE);

    // Wingtip Laser Pods
    gfx.drawFillRect(ix - 6, iy - 10, 9, 2, C_RED);
    gfx.drawFillRect(ix - 6, iy + 9, 9, 2, C_RED);

    // Sleek Fuselage Core
    gfx.drawFillRect(ix - 10, iy - 4, 18, 9, C_WHITE);
    gfx.drawFillRect(ix + 8, iy - 2, 6, 5, C_WHITE);
    fastHLine(ix + 14, iy, 5, C_CYAN);

    // Canopy
    gfx.drawFillRect(ix - 2, iy - 2, 7, 5, C_NEON_BLUE);
    fastHLine(ix, iy - 1, 4, C_CYAN);

    // Hull Damage Effects (Only When Hull HP is Low during Gameplay)
    if (showDamageFX && playerHull < playerMaxHull && playerHull > 0) {
        if (playerHull === 2) {
            gfx.drawFillRect(ix - 6, iy - 3, 4, 3, C_DARK_GREY);
            gfx.drawFillCircle(ix - 8, iy - 3, 2, flicker ? C_SMOKE : C_DARK_SMOKE);
            if ((frameCounter & 1) === 0 && particles.length < 55) {
                particles.push({
                    x: ix - 6,
                    y: iy - 2 + ((Math.random() * 4) | 0) - 2,
                    vx: -(Math.random() * 2.0 + 1.2),
                    vy: -(Math.random() * 0.9 + 0.2),
                    life: ((Math.random() * 8) | 0) + 8,
                    color: (frameCounter & 2) === 0 ? C_SMOKE : C_DARK_SMOKE,
                    size: 2
                });
            }
        } else if (playerHull === 1) {
            gfx.drawFillRect(ix - 7, iy - 3, 6, 5, C_DARK_GREY);
            gfx.drawFillCircle(ix - 5, iy - 3, 4, flicker ? C_RED : C_ORANGE);
            gfx.drawFillCircle(ix - 4, iy - 3, 2, flicker ? C_YELLOW : C_WHITE);
            gfx.drawFillCircle(ix + 1, iy + 3, 3, flicker ? C_ORANGE : C_RED);
            gfx.drawPixel(ix + 1, iy + 3, C_YELLOW);

            if (particles.length < 58) {
                var isFire = (frameCounter & 1) === 0;
                particles.push({
                    x: ix - 4,
                    y: iy + ((Math.random() * 6) | 0) - 3,
                    vx: -(Math.random() * 2.5 + 1.2),
                    vy: -(Math.random() * 1.4 - 0.3),
                    life: ((Math.random() * 7) | 0) + 6,
                    color: isFire ? (flicker ? C_ORANGE : C_YELLOW) : C_SMOKE,
                    size: 2
                });
            }
        }
    }

    // Energy Shield Ring
    if (playerShield > 0) {
        var shColor = playerShield === 3 ? C_CYAN : (playerShield === 2 ? C_NEON_BLUE : C_PURPLE);
        gfx.drawCircle(ix + 2, iy, 16, shColor);
    }
}

// --- Burning & Falling Ship Renderer ---
function drawBurningPlayerShip(x, y) {
    var ix = (x | 0) + (((Math.random() * 4) | 0) - 2);
    var iy = (y | 0) + (((Math.random() * 4) | 0) - 2);

    gfx.drawLine(ix - 12, iy - 11, ix + 3, iy - 1, C_CRIMSON);
    gfx.drawLine(ix - 12, iy + 11, ix + 3, iy + 1, C_CRIMSON);
    fastVLine(ix - 12, iy - 11, 23, C_DARK_GREY);

    gfx.drawFillRect(ix - 10, iy - 4, 17, 9, C_GREY);
    gfx.drawFillRect(ix + 6, iy - 1, 6, 4, C_DARK_GREY);

    var f1 = ((Date.now() & 32) === 0) ? C_YELLOW : C_ORANGE;
    var f2 = ((Date.now() & 32) === 0) ? C_RED : C_YELLOW;
    gfx.drawFillCircle(ix - 6, iy - 5, 5, C_RED);
    gfx.drawFillCircle(ix - 5, iy - 6, 3, f1);
    gfx.drawFillCircle(ix + 2, iy + 3, 5, C_ORANGE);
    gfx.drawFillCircle(ix + 2, iy + 2, 3, f2);
    gfx.drawFillCircle(ix - 2, iy, 4, f1);
}

// --- Dramatic Ship Burning, Falling & Exploding Sequence ---
function triggerDramaticDeath() {
    gameState = STATE_DYING;
    dyingTimer = 0;
    dyingVy = -1.2;
    dyingExploded = false;
    crashShockwaveRadius = 4;
    screenShake = 10;
    enemyBullets = [];
    playerBullets = [];

    spawnExplosion(playerX, playerY, C_ORANGE, 14, 1.4);
    playSound(220, 120);

    saveGameProgress(true);
}

function updateDyingSequence() {
    dyingTimer++;
    updateAndDrawBackground(1);

    for (var ei = 0; ei < enemies.length; ei++) {
        var en = enemies[ei];
        en.x += en.vx * 0.4;
        gfx.drawFillRect((en.x | 0) - 6, (en.y | 0) - 4, 12, 8, en.color);
    }

    if (!dyingExploded) {
        if (dyingTimer > 18) {
            dyingVy += 0.26;
            playerY += dyingVy;
            playerX += 0.9;
        } else {
            playerY += Math.sin(dyingTimer * 1.5) * 1.2;
        }

        for (var f = 0; f < 2; f++) {
            var fireColors = [C_RED, C_ORANGE, C_YELLOW, C_SMOKE];
            var fc = fireColors[(dyingTimer + f) & 3];
            particles.push({
                x: playerX + (Math.random() * 18 - 10),
                y: playerY + (Math.random() * 12 - 6),
                vx: -(Math.random() * 2.2 + 0.5),
                vy: -(Math.random() * 2.5 + 0.8),
                life: ((Math.random() * 10) | 0) + 8,
                color: fc,
                size: fc === C_SMOKE ? 3 : 2
            });
        }

        if (dyingTimer % 10 === 0) {
            spawnExplosion(playerX + (Math.random() * 12 - 6), playerY, C_ORANGE, 6, 1.0);
            screenShake = 5;
            playSound(Math.max(90, 320 - dyingTimer * 3), 45);
        }

        drawBurningPlayerShip(playerX, playerY);

        if ((dyingTimer & 4) === 0) {
            gfx.setTextSize(1);
            gfx.setTextColor(C_RED);
            gfx.drawString("! HULL BREACH - CRITICAL FAILURE !", (screenWidth / 2 - 102) | 0, 32);
        }

        if (playerY >= screenHeight - 24 || dyingTimer >= 68) {
            dyingExploded = true;
            screenShake = 20;
            crashShockwaveRadius = 6;

            spawnExplosion(playerX, playerY, C_WHITE, 16, 2.4);
            spawnExplosion(playerX, playerY, C_YELLOW, 18, 2.0);
            spawnExplosion(playerX, playerY, C_ORANGE, 18, 1.6);
            spawnExplosion(playerX, playerY, C_RED, 16, 1.2);
            playSound(80, 350);
        }
    } else {
        crashShockwaveRadius += 7;
        var cx = playerX | 0;
        var cy = Math.min(screenHeight - 18, playerY | 0);

        if (crashShockwaveRadius < 140) {
            gfx.drawCircle(cx, cy, crashShockwaveRadius, C_WHITE);
            if (crashShockwaveRadius > 6) {
                gfx.drawCircle(cx, cy, crashShockwaveRadius - 5, C_ORANGE);
            }
            if (crashShockwaveRadius > 14) {
                gfx.drawCircle(cx, cy, crashShockwaveRadius - 12, C_RED);
            }
        }

        if (dyingTimer % 6 === 0 && crashShockwaveRadius < 90) {
            spawnExplosion(cx + (Math.random() * 30 - 15), cy - (Math.random() * 20), C_YELLOW, 8, 1.5);
        }
    }

    updateAndDrawParticles();
    drawHUD();

    if (hasSprite && typeof gfx.pushSprite === 'function') {
        var sx = screenShake > 0 ? (((Math.random() * 6) | 0) - 3) : 0;
        var sy = screenShake > 0 ? (((Math.random() * 6) | 0) - 3) : 0;
        gfx.pushSprite(sx, sy);
    }
    if (screenShake > 0) screenShake--;

    if (dyingExploded && dyingTimer >= 102) {
        gameState = STATE_GAMEOVER;
    }
}

// --- Zero-Lag Player Weapon Firing ---
function firePlayerWeapon() {
    var now = Date.now();
    if (now - lastFireTime < fireCooldown) return;
    lastFireTime = now;

    if (playerBullets.length >= 22) return;

    var bulletColor = playerWeaponTier >= 3 ? C_GOLD : C_CYAN;

    if (playerWeaponTier === 1) {
        playerBullets.push({ x: playerX + 16, y: playerY - 7, vx: 13, vy: 0, color: bulletColor, dmg: 1.5 });
        playerBullets.push({ x: playerX + 16, y: playerY + 7, vx: 13, vy: 0, color: bulletColor, dmg: 1.5 });
    } else if (playerWeaponTier === 2) {
        playerBullets.push({ x: playerX + 18, y: playerY, vx: 14, vy: 0, color: C_WHITE, dmg: 1.8 });
        playerBullets.push({ x: playerX + 14, y: playerY - 7, vx: 13, vy: -1.6, color: bulletColor, dmg: 1.4 });
        playerBullets.push({ x: playerX + 14, y: playerY + 7, vx: 13, vy: 1.6, color: bulletColor, dmg: 1.4 });
    } else if (playerWeaponTier === 3) {
        playerBullets.push({ x: playerX + 18, y: playerY - 4, vx: 14, vy: 0, color: C_WHITE, dmg: 2.0 });
        playerBullets.push({ x: playerX + 18, y: playerY + 4, vx: 14, vy: 0, color: C_WHITE, dmg: 2.0 });
        playerBullets.push({ x: playerX + 12, y: playerY - 9, vx: 13, vy: -2.4, color: C_MAGENTA, dmg: 1.5 });
        playerBullets.push({ x: playerX + 12, y: playerY + 9, vx: 13, vy: 2.4, color: C_MAGENTA, dmg: 1.5 });
    } else {
        playerBullets.push({ x: playerX + 18, y: playerY, vx: 15, vy: 0, color: C_WHITE, dmg: 3.8, piercing: true });
        playerBullets.push({ x: playerX + 14, y: playerY - 8, vx: 13.5, vy: -1.8, color: C_GOLD, dmg: 1.8 });
        playerBullets.push({ x: playerX + 14, y: playerY + 8, vx: 13.5, vy: 1.8, color: C_GOLD, dmg: 1.8 });
    }
}

// --- Trigger Screen-Clearing EMP Shockwave ---
function triggerEMPShockwave() {
    if (playerOverdrive < 100) return;
    playerOverdrive = 0;
    screenShake = 12;

    empShockwave = {
        x: playerX | 0,
        y: playerY | 0,
        radius: 14,
        maxRadius: screenWidth
    };

    var bulletsCleared = enemyBullets.length;
    enemyBullets = [];
    if (bulletsCleared > 0) {
        var bonus = bulletsCleared * 25;
        score += bonus;
        addFloatingText("EMP +" + bonus, playerX + 25, playerY - 12, C_CYAN);
    } else {
        addFloatingText("EMP SHOCKWAVE!", playerX + 20, playerY - 12, C_WHITE);
    }

    for (var i = 0; i < enemies.length; i++) {
        enemies[i].hp -= 45;
        spawnDramaticEnemyBlast(enemies[i].x, enemies[i].y, C_CYAN, false);
    }
    if (boss && !boss.dying) {
        boss.hp -= 35;
        spawnExplosion(boss.x + 20, boss.y + 35, C_WHITE, 12, 1.5);
        if (boss.hp <= 0) {
            startBossDeathSequence();
        }
    }

    playSound(240, 90);
    saveDirty = true;
}

// --- Compute Progressive Difficulty Multiplier ---
function getDifficultyProgressMult() {
    if (currentDifficulty === DIFF_EASY) {
        // Easy mode stays casual, relaxed, and does not scale up aggressively
        return 0.65;
    } else if (currentDifficulty === DIFF_NORMAL) {
        // Normal gets progressively harder with each wave
        return 1.0 + (wave - 1) * 0.09;
    } else {
        // Hard starts tough and gets brutally harder the longer you play!
        return 1.38 + (wave - 1) * 0.16;
    }
}

// --- Enemy Spawning (Scaled by Easy / Normal / Hard & Progressive Wave Scaling) ---
function spawnEnemy(type) {
    var spawnY = ((Math.random() * (screenHeight - 76)) | 0) + 34;
    var prog = getDifficultyProgressMult();
    var speedScale = currentDifficulty === DIFF_EASY ? 0.72 : (currentDifficulty === DIFF_NORMAL ? (1.0 + (wave - 1) * 0.04) : (1.28 + (wave - 1) * 0.07));
    if (speedScale > 2.2) speedScale = 2.2;

    if (type === 'drone') {
        var dHp = currentDifficulty === DIFF_EASY ? 1.5 : (3.0 * prog);
        enemies.push({
            type: 'drone',
            x: screenWidth + 15,
            y: spawnY,
            baseY: spawnY,
            vx: -(Math.random() * 1.1 + 1.9) * speedScale,
            hp: dHp,
            maxHp: dHp,
            scoreValue: currentDifficulty === DIFF_HARD ? 90 : 60,
            color: C_MAGENTA,
            width: 14,
            height: 12,
            shootTimer: currentDifficulty === DIFF_EASY ? 110 : (((Math.random() * 60) | 0) + (currentDifficulty === DIFF_HARD ? 28 : 48)),
            animTimer: Math.random() * 6.28
        });
    } else if (type === 'gunship') {
        var gHp = currentDifficulty === DIFF_EASY ? 3.2 : (6.0 * prog);
        enemies.push({
            type: 'gunship',
            x: screenWidth + 24,
            y: spawnY,
            vx: -1.25 * speedScale,
            hp: gHp,
            maxHp: gHp,
            scoreValue: currentDifficulty === DIFF_HARD ? 250 : 180,
            color: C_ORANGE,
            width: 22,
            height: 16,
            shootTimer: currentDifficulty === DIFF_EASY ? 95 : (((Math.random() * 50) | 0) + (currentDifficulty === DIFF_HARD ? 24 : 42)),
            animTimer: 0
        });
    } else if (type === 'kamikaze') {
        var kHp = currentDifficulty === DIFF_EASY ? 1.2 : (2.5 * prog);
        enemies.push({
            type: 'kamikaze',
            x: screenWidth + 18,
            y: Math.max(32, Math.min(screenHeight - 36, playerY + (Math.random() * 30 - 15))),
            vx: -3.5 * speedScale,
            hp: kHp,
            maxHp: kHp,
            scoreValue: currentDifficulty === DIFF_HARD ? 160 : 120,
            color: C_RED,
            width: 16,
            height: 10,
            shootTimer: 9999,
            animTimer: 0
        });
    } else if (type === 'asteroid') {
        var aHp = currentDifficulty === DIFF_EASY ? 2.5 : (4.5 * prog);
        enemies.push({
            type: 'asteroid',
            x: screenWidth + 20,
            y: spawnY,
            vx: -(Math.random() * 1.0 + 0.9) * speedScale,
            hp: aHp,
            maxHp: aHp,
            scoreValue: 80,
            color: C_GREY,
            width: 18,
            height: 18,
            shootTimer: 9999,
            animTimer: 0
        });
    }
}

// --- Spawn One of 5 Natural Random Bosses (Scaled by Difficulty) ---
function spawnRandomBoss() {
    var idx = (Math.random() * BOSS_POOL.length) | 0;
    if (idx === lastBossIndex) {
        idx = (idx + 1 + ((Math.random() * (BOSS_POOL.length - 1)) | 0)) % BOSS_POOL.length;
    }
    lastBossIndex = idx;

    var tpl = BOSS_POOL[idx];
    var maxHp = 130;
    var vySpeed = tpl.vy;

    if (currentDifficulty === DIFF_EASY) {
        maxHp = 115 + wave * 15;
        vySpeed = tpl.vy * 0.75;
    } else if (currentDifficulty === DIFF_NORMAL) {
        maxHp = 200 + wave * 65;
        vySpeed = tpl.vy * (1.0 + (wave - 1) * 0.05);
    } else {
        // HARD MODE: Massive boss health & relentless speed scaling
        maxHp = 280 + wave * 95;
        vySpeed = tpl.vy * (1.25 + (wave - 1) * 0.08);
    }

    boss = {
        id: tpl.id,
        name: tpl.name,
        primaryColor: tpl.primaryColor,
        secondaryColor: tpl.secondaryColor,
        coreColor: tpl.coreColor,
        x: screenWidth + 56,
        targetX: screenWidth - 68,
        y: (screenHeight / 2 - tpl.height / 2) | 0,
        vy: vySpeed,
        width: tpl.width,
        height: tpl.height,
        hp: maxHp,
        maxHp: maxHp,
        attackTimer: 0,
        beamCharging: false,
        beamChargeTimer: 0,
        beamActive: false,
        beamActiveTimer: 0,
        beamY: (screenHeight / 2) | 0,
        scoreValue: (currentDifficulty === DIFF_HARD ? 5500 : 4000) + wave * 600,
        dying: false,
        dyingTimer: 0
    };

    addFloatingText("WARNING: " + boss.name, screenWidth / 2 - 70, 50, C_RED);
    playSound(320, 120);
}

// --- Start Dramatic Boss Death Sequence ---
function startBossDeathSequence() {
    if (!boss || boss.dying) return;
    boss.hp = 0;
    boss.dying = true;
    boss.dyingTimer = 0;
    boss.beamCharging = false;
    boss.beamActive = false;
    enemyBullets = [];
    screenShake = 12;
    spawnDramaticEnemyBlast(boss.x + (boss.width >> 1), boss.y + (boss.height >> 1), boss.primaryColor, true);
    playSound(200, 120);
}

// --- Power-up Spawner ---
function spawnPowerup(x, y) {
    var roll = Math.random();
    var pType = 'shield';
    var pColor = C_CYAN;
    var pChar = 'S';

    if (roll < 0.35) {
        pType = 'weapon';
        pColor = C_YELLOW;
        pChar = 'W';
    } else if (roll < 0.68) {
        pType = 'shield';
        pColor = C_CYAN;
        pChar = 'S';
    } else if (roll < 0.88) {
        pType = 'energy';
        pColor = C_MAGENTA;
        pChar = 'E';
    } else {
        pType = 'combo';
        pColor = C_GOLD;
        pChar = 'C';
    }

    powerups.push({
        type: pType,
        color: pColor,
        char: pChar,
        x: x,
        y: y,
        vx: -1.4,
        vy: 0,
        radius: 7
    });
}

// --- Player Damage Handler ---
function playerTakeDamage(dmg) {
    if (playerInvincible > 0 || gameState !== STATE_PLAYING) return;
    screenShake = 8;
    playSound(150, 65);

    comboCount = 0;
    shieldRegenTimer = 0;

    if (playerShield > 0) {
        playerShield--;
        playerInvincible = currentDifficulty === DIFF_EASY ? 65 : (currentDifficulty === DIFF_NORMAL ? 50 : 38);
        addFloatingText("SHIELD HIT!", playerX, playerY - 14, C_CYAN);
        saveDirty = true;
    } else {
        playerHull -= dmg || 1;
        playerInvincible = currentDifficulty === DIFF_EASY ? 70 : (currentDifficulty === DIFF_NORMAL ? 58 : 44);
        saveDirty = true;

        if (playerHull <= 0) {
            playerHull = 0;
            triggerDramaticDeath();
        } else {
            addFloatingText("HULL DAMAGE!", playerX, playerY - 14, C_RED);
        }
    }
}

// --- Draw Cyberpunk HUD ---
function drawHUD() {
    gfx.drawFillRect(0, 0, screenWidth, 18, C_NAVY);
    fastHLine(0, 18, screenWidth, C_GRID_CYAN);

    gfx.setTextSize(1);

    // 1. Shields Indicator
    gfx.setTextColor(C_CYAN);
    gfx.drawString("SHD:", 4, 5);
    for (var s = 0; s < playerMaxShield; s++) {
        if (s < playerShield) {
            gfx.drawFillRect(29 + s * 9, 5, 7, 7, C_CYAN);
        } else {
            gfx.drawRect(29 + s * 9, 5, 7, 7, C_DARK_GREY);
        }
    }

    // 2. Hull Indicator
    gfx.setTextColor(C_RED);
    gfx.drawString("HP:", 62, 5);
    for (var h = 0; h < playerMaxHull; h++) {
        if (h < playerHull) {
            gfx.drawFillRect(81 + h * 9, 5, 7, 7, C_RED);
        } else {
            gfx.drawRect(81 + h * 9, 5, 7, 7, C_DARK_GREY);
        }
    }

    // 3. EMP Overdrive Bar
    var empReady = playerOverdrive >= 100;
    var flashPhase = ((Date.now() >> 7) % 3);
    var empLabelColor = empReady ? (flashPhase === 0 ? C_WHITE : (flashPhase === 1 ? C_CYAN : C_MAGENTA)) : C_MAGENTA;
    var empBorderColor = empReady ? (flashPhase === 0 ? C_WHITE : C_CYAN) : C_DARK_GREY;

    gfx.setTextColor(empLabelColor);
    gfx.drawString("EMP:", 116, 5);

    var empBarW = 42;
    gfx.drawRect(141, 4, empBarW, 9, empBorderColor);
    var empFillW = ((playerOverdrive * (empBarW - 2)) / 100) | 0;
    if (empFillW > 0) {
        var empFillColor = empReady
            ? (flashPhase === 0 ? C_WHITE : (flashPhase === 1 ? C_CYAN : C_MAGENTA))
            : C_MAGENTA;
        gfx.drawFillRect(142, 5, empFillW, 7, empFillColor);
    }

    // 4. Score Display
    gfx.setTextColor(C_WHITE);
    gfx.drawString("SCR:" + score, 192, 5);

    // 5. Wave / Combo Badge
    if (comboCount > 1) {
        gfx.setTextColor(C_GOLD);
        gfx.drawString("x" + comboCount, screenWidth - 30, 5);
    } else {
        gfx.setTextColor(C_NEON_BLUE);
        gfx.drawString("W" + wave, screenWidth - 28, 5);
    }
}

// --- High-Speed Hardware-Accelerated Boss Renderer, Damage FX & Dramatic Death ---
function updateAndDrawBoss() {
    if (!boss) return;

    var bx = boss.x | 0;
    var by = boss.y | 0;
    var bw = boss.width;
    var bh = boss.height;
    var cy = by + (bh >> 1);
    var pulse = ((Date.now() & 128) === 0);
    var flicker = ((Date.now() & 32) === 0);

    // --- Dramatic Boss Death Sequence ---
    if (boss.dying) {
        boss.dyingTimer++;
        bx += (((Math.random() * 8) | 0) - 4);
        by += (((Math.random() * 8) | 0) - 4);
        cy = by + (bh >> 1);
        screenShake = 10;

        gfx.drawFillRect(bx, by, bw, bh, C_DARK_GREY);
        gfx.drawRect(bx, by, bw, bh, C_RED);
        gfx.drawFillCircle(bx + 20, cy, 12, flicker ? C_WHITE : C_YELLOW);

        gfx.drawFillCircle(bx + 10, by + 14, 6, flicker ? C_ORANGE : C_RED);
        gfx.drawFillCircle(bx + 34, by + bh - 16, 7, flicker ? C_YELLOW : C_ORANGE);
        gfx.drawFillCircle(bx + 26, by + 22, 5, flicker ? C_RED : C_YELLOW);

        if (boss.dyingTimer % 4 === 0) {
            var rx = bx + ((Math.random() * bw) | 0);
            var ry = by + ((Math.random() * bh) | 0);
            spawnDramaticEnemyBlast(rx, ry, (boss.dyingTimer & 4) ? C_YELLOW : C_ORANGE, true);
            playSound(120 + ((Math.random() * 140) | 0), 35);
        }

        if (boss.dyingTimer >= 44) {
            var bossPts = boss.scoreValue * Math.max(1, comboCount);
            score += bossPts;
            if (score > highScore) highScore = score;

            flashbangTimer = 14;
            screenShake = 26;

            var centerBx = bx + (bw >> 1);
            var centerBy = cy;
            spawnExplosion(centerBx, centerBy, C_WHITE, 22, 2.6);
            spawnExplosion(centerBx, centerBy, C_YELLOW, 22, 2.2);
            spawnExplosion(centerBx, centerBy, C_ORANGE, 20, 1.8);
            spawnExplosion(centerBx, centerBy, boss.primaryColor, 18, 1.5);

            blastRings.push({ x: centerBx, y: centerBy, r: 4, maxR: 110, color: C_WHITE });
            blastRings.push({ x: centerBx, y: centerBy, r: 14, maxR: 90, color: C_ORANGE });
            playSound(75, 400);

            playerShield = playerMaxShield;
            playerHull = Math.min(playerMaxHull, playerHull + 1);
            playerWeaponTier = Math.min(4, playerWeaponTier + 1);

            addFloatingText(boss.name + " OBLITERATED!", screenWidth / 2 - 75, screenHeight / 2, C_GOLD);
            boss = null;
            wave++;
            waveTimer = 0;

            saveGameProgress(true);
        }
        return;
    }

    // --- Boss Movement ---
    var hpRatio = boss.hp / boss.maxHp;
    var speedMult = (currentDifficulty !== DIFF_EASY && hpRatio < 0.5) ? 1.35 : 1.0;

    if (boss.x > boss.targetX) {
        boss.x -= 1.8;
    } else {
        boss.y += boss.vy * speedMult;
        if (boss.y < 34 || boss.y > screenHeight - boss.height - 20) {
            boss.vy = -boss.vy;
        }
    }

    bx = boss.x | 0;
    by = boss.y | 0;
    cy = by + (bh >> 1);

    // --- Boss Visuals ---
    if (boss.id === 0) {
        gfx.drawFillRect(bx, by, bw, bh, C_NAVY);
        gfx.drawRect(bx, by, bw, bh, boss.primaryColor);
        gfx.drawFillRect(bx + 6, by + 8, bw - 12, bh - 16, boss.secondaryColor);
        gfx.drawFillCircle(bx + 18, cy, 11, pulse ? C_WHITE : boss.coreColor);
        gfx.drawCircle(bx + 18, cy, 14, boss.primaryColor);
        gfx.drawFillRect(bx - 7, by + 10, 9, 6, C_RED);
        gfx.drawFillRect(bx - 7, by + bh - 16, 9, 6, C_RED);
    } else if (boss.id === 1) {
        gfx.drawFillCircle(bx + 24, cy, 23, boss.secondaryColor);
        gfx.drawCircle(bx + 24, cy, 24, boss.primaryColor);
        gfx.drawLine(bx - 10, cy - 12, bx + 16, by + 6, boss.primaryColor);
        gfx.drawLine(bx - 10, cy - 12, bx + 16, cy - 4, C_WHITE);
        gfx.drawLine(bx - 10, cy + 12, bx + 16, by + bh - 6, boss.primaryColor);
        gfx.drawLine(bx - 10, cy + 12, bx + 16, cy + 4, C_WHITE);
        gfx.drawFillCircle(bx + 14, cy, 8, pulse ? C_MAGENTA : C_CYAN);
    } else if (boss.id === 2) {
        gfx.drawFillRect(bx + 8, by + 6, bw - 12, bh - 12, boss.secondaryColor);
        gfx.drawFillRect(bx, cy - 12, bw - 8, 24, boss.primaryColor);
        gfx.drawLine(bx - 8, cy, bx + bw, by, C_WHITE);
        gfx.drawLine(bx - 8, cy, bx + bw, by + bh, C_WHITE);
        gfx.drawFillCircle(bx + 18, cy, 9, pulse ? C_WHITE : C_YELLOW);
    } else if (boss.id === 3) {
        gfx.drawFillRect(bx + 8, by + 14, bw - 14, bh - 28, C_NAVY);
        gfx.drawRect(bx + 8, by + 14, bw - 14, bh - 28, boss.primaryColor);
        gfx.drawLine(bx + 12, by + 14, bx - 8, by + 2, boss.primaryColor);
        gfx.drawLine(bx + 24, by + 14, bx + 4, by - 4, boss.secondaryColor);
        gfx.drawLine(bx + 12, by + bh - 14, bx - 8, by + bh - 2, boss.primaryColor);
        gfx.drawLine(bx + 24, by + bh - 14, bx + 4, by + bh + 4, boss.secondaryColor);
        gfx.drawFillCircle(bx + 16, cy - 6, 4, pulse ? C_RED : boss.coreColor);
        gfx.drawFillCircle(bx + 16, cy + 6, 4, pulse ? C_RED : boss.coreColor);
    } else {
        gfx.drawRect(bx + 4, by + 4, bw - 8, bh - 8, boss.primaryColor);
        gfx.drawFillRect(bx + 10, by + 12, bw - 20, bh - 24, boss.secondaryColor);
        gfx.drawCircle(bx + 26, cy, 21, pulse ? C_GOLD : C_RED);
        gfx.drawFillCircle(bx + 26, cy, 9, pulse ? C_RED : C_WHITE);
        gfx.drawFillRect(bx - 6, cy - 18, 12, 5, C_GOLD);
        gfx.drawFillRect(bx - 6, cy + 13, 12, 5, C_GOLD);
    }

    // --- Progressive Visual Damage & Fire on Boss Hull ---
    if (hpRatio < 0.75) {
        gfx.drawFillRect(bx + 12, by + 16, 6, 6, C_BLACK);
        if ((frameCounter & 3) === 0 && particles.length < 55) {
            particles.push({ x: bx + 14, y: by + 18, vx: -1.5, vy: -0.8, life: 8, color: C_SMOKE, size: 2 });
        }
    }
    if (hpRatio < 0.5) {
        gfx.drawFillCircle(bx + 14, by + 18, 4, flicker ? C_ORANGE : C_RED);
        gfx.drawFillCircle(bx + 14, by + 18, 2, C_YELLOW);
        gfx.drawFillRect(bx + 28, by + bh - 22, 6, 6, C_BLACK);
    }
    if (hpRatio < 0.25) {
        gfx.drawFillCircle(bx + 30, by + bh - 18, 5, flicker ? C_RED : C_ORANGE);
        gfx.drawFillCircle(bx + 30, by + bh - 18, 2, C_WHITE);
        gfx.drawFillCircle(bx + 22, cy + 8, 4, flicker ? C_YELLOW : C_ORANGE);
        if ((frameCounter & 1) === 0 && particles.length < 58) {
            particles.push({ x: bx + 26, y: cy, vx: -2.5, vy: (Math.random() - 0.5) * 2.5, life: 7, color: flicker ? C_YELLOW : C_ORANGE, size: 2 });
        }
    }

    // Boss Health Bar & Nameplate
    var bossBarW = screenWidth - 50;
    gfx.drawFillRect(25, 21, bossBarW, 6, C_BLACK);
    gfx.drawRect(25, 21, bossBarW, 6, boss.primaryColor);
    var bossFillW = Math.max(0, ((boss.hp * (bossBarW - 2)) / boss.maxHp) | 0);
    gfx.drawFillRect(26, 22, bossFillW, 4, boss.coreColor);

    gfx.setTextSize(1);
    gfx.setTextColor(C_WHITE);
    gfx.drawString(boss.name, 26, 29);

    // --- Boss Attack Patterns (Scaled by Difficulty) ---
    boss.attackTimer++;

    var specialInterval = currentDifficulty === DIFF_EASY ? 210 : (currentDifficulty === DIFF_HARD ? (hpRatio < 0.5 ? 95 : 120) : (hpRatio < 0.5 ? 125 : 155));
    if (boss.attackTimer % specialInterval === 0 && !boss.beamCharging && !boss.beamActive) {
        if (boss.id === 3) {
            spawnExplosion(bx + 20, cy, C_GREEN, 8, 1.4);
            boss.y = ((Math.random() * (screenHeight - bh - 60)) | 0) + 36;
            var webCount = currentDifficulty === DIFF_EASY ? 1 : (currentDifficulty === DIFF_HARD ? 3 : 2);
            for (var wa = -webCount; wa <= webCount; wa++) {
                enemyBullets.push({ x: bx, y: boss.y + (bh >> 1), vx: currentDifficulty === DIFF_EASY ? -3.4 : -5.0, vy: wa * 1.1, color: C_GREEN });
            }
            playSound(520, 40);
        } else {
            boss.beamCharging = true;
            boss.beamChargeTimer = currentDifficulty === DIFF_EASY ? 52 : (currentDifficulty === DIFF_HARD ? 28 : 38);
            boss.beamY = playerY | 0;
            playSound(300, 50);
        }
    }

    if (boss.beamCharging) {
        boss.beamChargeTimer--;
        if (pulse) {
            fastHLine(0, boss.beamY, bx, C_RED);
            gfx.setTextColor(C_RED);
            gfx.drawString("! LOCK !", 12, boss.beamY - 9);
        }
        if (boss.beamChargeTimer <= 0) {
            boss.beamCharging = false;
            boss.beamActive = true;
            boss.beamActiveTimer = 30;
            screenShake = 8;
            playSound(140, 100);
        }
    }

    if (boss.beamActive) {
        boss.beamActiveTimer--;
        gfx.drawFillRect(0, boss.beamY - 7, bx, 14, boss.primaryColor);
        gfx.drawFillRect(0, boss.beamY - 3, bx, 6, C_WHITE);

        if (Math.abs(playerY - boss.beamY) < 11) {
            playerTakeDamage(1);
        }
        if (boss.beamActiveTimer <= 0) {
            boss.beamActive = false;
        }
    }

    var salvoRate = currentDifficulty === DIFF_EASY ? 58 : (currentDifficulty === DIFF_HARD ? (hpRatio < 0.5 ? 20 : 26) : (hpRatio < 0.5 ? 28 : 36));
    var bSpd = currentDifficulty === DIFF_EASY ? -3.3 : (currentDifficulty === DIFF_HARD ? -5.6 : -4.6);

    if (!boss.beamActive && boss.attackTimer % salvoRate === 0) {
        if (boss.id === 0) {
            enemyBullets.push({ x: bx - 6, y: by + 12, vx: bSpd, vy: -0.4, color: C_ORANGE });
            enemyBullets.push({ x: bx - 6, y: by + bh - 12, vx: bSpd, vy: 0.4, color: C_ORANGE });
            if (currentDifficulty === DIFF_HARD || hpRatio < 0.5) {
                enemyBullets.push({ x: bx - 6, y: cy, vx: bSpd - 0.4, vy: (playerY - cy) * 0.03, color: C_MAGENTA });
            }
        } else if (boss.id === 1) {
            enemyBullets.push({ x: bx - 4, y: cy, vx: bSpd - 0.3, vy: 0, color: C_CYAN });
            enemyBullets.push({ x: bx - 4, y: cy - 10, vx: bSpd, vy: -1.1, color: C_PURPLE });
            enemyBullets.push({ x: bx - 4, y: cy + 10, vx: bSpd, vy: 1.1, color: C_PURPLE });
        } else if (boss.id === 2) {
            var spreadCount = currentDifficulty === DIFF_EASY ? 1 : ((currentDifficulty === DIFF_HARD || hpRatio < 0.5) ? 2 : 1);
            for (var s = -spreadCount; s <= spreadCount; s++) {
                enemyBullets.push({ x: bx - 6, y: cy, vx: bSpd - 0.4, vy: s * 1.15, color: C_GOLD });
            }
        } else if (boss.id === 3) {
            var dy = (playerY - cy) * 0.035;
            enemyBullets.push({ x: bx - 4, y: cy - 6, vx: bSpd - 0.3, vy: dy, color: C_GREEN });
            enemyBullets.push({ x: bx - 4, y: cy + 6, vx: bSpd - 0.3, vy: dy, color: C_GREEN });
        } else {
            enemyBullets.push({ x: bx - 6, y: cy - 16, vx: bSpd, vy: 0, color: C_RED });
            enemyBullets.push({ x: bx - 6, y: cy + 16, vx: bSpd, vy: 0, color: C_RED });
            enemyBullets.push({ x: bx - 6, y: cy, vx: bSpd - 0.5, vy: (playerY - cy) * 0.03, color: C_GOLD });
        }
    }
}

// --- Hyperspace Launch Animation Before Gameplay Starts ---
function startLaunchAnimation() {
    launchAnimTimer = 0;
    playerX = -20;
    playerY = screenHeight >> 1;
    playerTargetY = playerY;
    lastFrameTime = Date.now();
    gameState = STATE_LAUNCH_ANIM;
    playSound(420, 60);
}

function updateLaunchAnimation() {
    launchAnimTimer++;
    var warpFactor = launchAnimTimer < 24 ? 4 : 2;
    updateAndDrawBackground(warpFactor);

    // Smoothly glide ship from offscreen left into combat position (x = 38)
    playerX += (38 - playerX) * 0.18;

    // Emit warp thruster sparks behind ship
    if (particles.length < 40) {
        particles.push({
            x: playerX - 14,
            y: playerY + ((Math.random() * 8) | 0) - 4,
            vx: -(Math.random() * 5.0 + 3.0),
            vy: (Math.random() - 0.5) * 1.5,
            life: 8,
            color: (launchAnimTimer & 1) === 0 ? C_CYAN : C_ORANGE,
            size: 2
        });
    }

    updateAndDrawParticles();
    drawPlayerShip(playerX, playerY, false);
    drawHUD();

    // Center Launch Banner
    var centerX = screenWidth >> 1;
    gfx.setTextSize(1);
    gfx.setTextColor(C_CYAN);
    gfx.drawString("SLOT " + (activeSlotIndex + 1) + "  |  " + DIFF_NAMES[currentDifficulty] + " MODE", centerX - 64, screenHeight / 2 - 28);
    if ((launchAnimTimer & 2) === 0) {
        gfx.setTextSize(2);
        gfx.setTextColor(C_WHITE);
        gfx.drawString("ENGAGING WARP...", centerX - 92, screenHeight / 2 - 10);
    }

    if (launchAnimTimer === 12) playSound(580, 60);
    if (launchAnimTimer === 24) playSound(780, 80);

    if (hasSprite && typeof gfx.pushSprite === 'function') {
        gfx.pushSprite(0, 0);
    }

    if (launchAnimTimer >= 36) {
        playerX = 38;
        lastFrameTime = Date.now();
        gameState = STATE_PLAYING;
    }
}

// --- Main Gameplay Loop ---
function updateGame() {
    var now = Date.now();
    var dt = now - lastFrameTime;
    if (dt > 0 && dt < 500) {
        playTimeMs += dt;
    }
    lastFrameTime = now;
    frameCounter++;

    // 1. Read 3-Button Controls
    var upPressed = keyboard.getPrevPress();
    var dwPressed = keyboard.getNextPress();
    var selPressed = keyboard.getSelPress();
    var escPressed = keyboard.getEscPress();

    if ((upPressed && dwPressed) || escPressed) {
        saveGameProgress(true);
        gameState = STATE_PAUSED;
        delay(180);
        return;
    }

    if (upPressed) playerTargetY -= playerSpeed;
    if (dwPressed) playerTargetY += playerSpeed;

    if (playerTargetY < 32) playerTargetY = 32;
    if (playerTargetY > screenHeight - 30) playerTargetY = screenHeight - 30;

    playerY += (playerTargetY - playerY) * 0.44;

    if (selPressed) {
        firePlayerWeapon();

        if (!selWasPressed) {
            if (now - lastTapTime < 320 && playerOverdrive >= 100) {
                triggerEMPShockwave();
            }
            lastTapTime = now;
        }
    }
    selWasPressed = selPressed;

    if (playerInvincible > 0) playerInvincible--;
    if (comboTimer > 0) {
        comboTimer--;
        if (comboTimer <= 0) comboCount = 0;
    }

    // Shield Regeneration (Fast in Easy, Standard in Normal, Slower in Hard)
    var regenThreshold = currentDifficulty === DIFF_EASY ? 230 : (currentDifficulty === DIFF_NORMAL ? 330 : 480);
    if (playerShield < playerMaxShield) {
        shieldRegenTimer++;
        if (shieldRegenTimer >= regenThreshold) {
            playerShield++;
            shieldRegenTimer = 0;
            addFloatingText("SHIELD RECHARGED", playerX, playerY - 14, C_CYAN);
        }
    }

    if (saveDirty && (now - lastAutoSaveTime >= 4500)) {
        saveGameProgress(false);
    }

    // 2. Wave Spawning & Boss Trigger (Scaled by Easy / Normal / Hard)
    waveTimer++;
    if (!boss) {
        var spawnRate = 55;
        var maxEnemiesOnScreen = 6;
        if (currentDifficulty === DIFF_EASY) {
            // Easy mode: relaxed, steady spawn rate, never overwhelms player
            spawnRate = 62;
            maxEnemiesOnScreen = 5;
        } else if (currentDifficulty === DIFF_NORMAL) {
            spawnRate = Math.max(26, 56 - wave * 3);
            maxEnemiesOnScreen = 7;
        } else {
            // Hard mode: relentless enemy waves that intensify rapidly
            spawnRate = Math.max(16, 42 - wave * 3);
            maxEnemiesOnScreen = 10;
        }

        if (waveTimer % spawnRate === 0 && enemies.length < maxEnemiesOnScreen) {
            var rand = Math.random();
            if (rand < 0.44) {
                spawnEnemy('drone');
            } else if (rand < 0.70) {
                spawnEnemy('gunship');
            } else if (rand < 0.86) {
                spawnEnemy('kamikaze');
            } else {
                spawnEnemy('asteroid');
            }
        }

        // Boss Frequency per Difficulty:
        // Easy: less frequent (16 kills)
        // Normal: more frequent (8 + wave kills)
        // Hard: very frequent (5 + wave kills)
        var killsForBoss = currentDifficulty === DIFF_EASY
            ? 16
            : (currentDifficulty === DIFF_NORMAL ? (8 + wave) : (5 + wave));

        if (waveKills >= killsForBoss) {
            waveKills = 0;
            spawnRandomBoss();
        }
    }

    // 3. Render Background
    updateAndDrawBackground(1);

    // 4. Update EMP Shockwave
    if (empShockwave) {
        empShockwave.radius += 18;
        gfx.drawCircle(empShockwave.x, empShockwave.y, empShockwave.radius, C_WHITE);
        gfx.drawCircle(empShockwave.x, empShockwave.y, empShockwave.radius - 3, C_CYAN);
        if (empShockwave.radius >= empShockwave.maxRadius) {
            empShockwave = null;
        }
    }

    // 5. Update & Draw Player Bullets
    for (var bi = playerBullets.length - 1; bi >= 0; bi--) {
        var b = playerBullets[bi];
        b.x += b.vx;
        b.y += b.vy;

        var bx = b.x | 0;
        var by = b.y | 0;

        if (b.piercing) {
            gfx.drawFillRect(bx - 8, by - 2, 18, 4, C_WHITE);
            fastHLine(bx - 14, by, 26, C_CYAN);
        } else {
            gfx.drawFillRect(bx, by - 1, 9, 3, b.color);
            fastHLine(bx + 2, by, 7, C_WHITE);
        }

        if (bx > screenWidth + 16 || by < 18 || by > screenHeight) {
            playerBullets.splice(bi, 1);
            continue;
        }

        var bulletRemoved = false;
        for (var ei = enemies.length - 1; ei >= 0; ei--) {
            var en = enemies[ei];
            if (bx >= en.x - 12 && bx <= en.x + en.width + 2 &&
                by >= en.y - (en.height >> 1) - 4 && by <= en.y + (en.height >> 1) + 4) {

                en.hp -= b.dmg;
                spawnSparks(bx, by, C_YELLOW, 2);

                if (!b.piercing) {
                    playerBullets.splice(bi, 1);
                    bulletRemoved = true;
                }

                if (en.hp <= 0) {
                    var pts = en.scoreValue * Math.max(1, comboCount);
                    score += pts;
                    if (score > highScore) highScore = score;
                    totalKills++;
                    waveKills++;
                    saveDirty = true;

                    if (playerOverdrive < 100) {
                        playerOverdrive = Math.min(100, playerOverdrive + 8);
                    }

                    comboCount++;
                    comboTimer = 80;
                    if (comboCount > maxCombo) maxCombo = comboCount;

                    spawnDramaticEnemyBlast(en.x, en.y, en.color, en.type === 'gunship');

                    var dropChance = currentDifficulty === DIFF_EASY ? 0.40 : (currentDifficulty === DIFF_NORMAL ? 0.30 : 0.22);
                    if (Math.random() < dropChance) {
                        spawnPowerup(en.x, en.y);
                    }

                    addFloatingText("+" + pts, en.x, en.y - 6, C_GOLD);
                    enemies.splice(ei, 1);
                }
                break;
            }
        }

        if (!bulletRemoved && boss && !boss.dying && bx >= boss.x - 4 && bx <= boss.x + boss.width &&
            by >= boss.y && by <= boss.y + boss.height) {

            boss.hp -= b.dmg;
            spawnSparks(bx, by, C_WHITE, 2);
            if (!b.piercing) {
                playerBullets.splice(bi, 1);
            }

            if (boss.hp <= 0) {
                startBossDeathSequence();
            }
        }
    }

    // 6. Update & Draw Enemies
    for (var ei = enemies.length - 1; ei >= 0; ei--) {
        var en = enemies[ei];
        en.x += en.vx;
        var ex = en.x | 0;
        var ey = en.y | 0;

        if (en.type === 'drone') {
            en.animTimer += 0.09;
            en.y = en.baseY + Math.sin(en.animTimer) * 15;
            ey = en.y | 0;

            gfx.drawFillRect(ex - 6, ey - 4, 12, 8, en.color);
            gfx.drawLine(ex - 8, ey, ex + 6, ey - 6, C_CYAN);
            gfx.drawLine(ex - 8, ey, ex + 6, ey + 6, C_CYAN);
            fastHLine(ex - 9, ey, 6, C_WHITE);
        } else if (en.type === 'gunship') {
            gfx.drawFillRect(ex - 8, ey - 7, 20, 14, en.color);
            gfx.drawFillRect(ex - 4, ey - 4, 14, 8, C_CRIMSON);
            gfx.drawCircle(ex + 2, ey, 3, C_YELLOW);
        } else if (en.type === 'kamikaze') {
            gfx.drawFillRect(ex - 8, ey - 3, 14, 6, en.color);
            gfx.drawLine(ex - 10, ey, ex + 6, ey - 5, C_YELLOW);
            gfx.drawLine(ex - 10, ey, ex + 6, ey + 5, C_YELLOW);
        } else if (en.type === 'asteroid') {
            gfx.drawFillCircle(ex, ey, 8, en.color);
            gfx.drawCircle(ex, ey, 8, C_WHITE);
            gfx.drawPixel(ex - 2, ey - 2, C_BLACK);
            gfx.drawPixel(ex + 3, ey + 1, C_BLACK);
        }

        drawEnemyDamageEffects(ex, ey, en.hp, en.maxHp);
        drawEnemyHealthBar(ex, ey, (en.height >> 1), en.hp, en.maxHp);

        en.shootTimer--;
        if (en.shootTimer <= 0 && ex < screenWidth - 20) {
            en.shootTimer = currentDifficulty === DIFF_EASY
                ? 110
                : (((Math.random() * 60) | 0) + (currentDifficulty === DIFF_HARD ? 32 : 55));

            var ebVx = currentDifficulty === DIFF_EASY ? -2.6 : (currentDifficulty === DIFF_NORMAL ? -3.6 : -4.9);
            enemyBullets.push({
                x: ex - 8,
                y: ey,
                vx: ebVx,
                vy: (playerY - ey) * (currentDifficulty === DIFF_HARD ? 0.025 : 0.015),
                color: C_RED
            });
        }

        if (Math.abs(ex - playerX) < 13 && Math.abs(ey - playerY) < 11) {
            spawnDramaticEnemyBlast(ex, ey, en.color, true);
            enemies.splice(ei, 1);
            playerTakeDamage(1);
            if (gameState !== STATE_PLAYING) return;
            continue;
        }

        if (ex < -25) {
            enemies.splice(ei, 1);
        }
    }

    // 7. Update & Draw Boss
    updateAndDrawBoss();
    if (gameState !== STATE_PLAYING) return;

    // 8. Update & Draw Enemy Bullets
    for (var ebi = enemyBullets.length - 1; ebi >= 0; ebi--) {
        var eb = enemyBullets[ebi];
        eb.x += eb.vx;
        eb.y += eb.vy;

        var ebx = eb.x | 0;
        var eby = eb.y | 0;

        gfx.drawFillRect(ebx - 2, eby - 2, 4, 4, eb.color);
        gfx.drawPixel(ebx, eby, C_WHITE);

        if (ebx < -10 || eby < 18 || eby > screenHeight) {
            enemyBullets.splice(ebi, 1);
            continue;
        }

        if (Math.abs(ebx - playerX) < 7 && Math.abs(eby - playerY) < 7) {
            enemyBullets.splice(ebi, 1);
            playerTakeDamage(1);
            if (gameState !== STATE_PLAYING) return;
        }
    }

    // 9. Update & Draw Power-ups
    for (var pi = powerups.length - 1; pi >= 0; pi--) {
        var pu = powerups[pi];
        pu.x += pu.vx;
        var pux = pu.x | 0;
        var puy = pu.y | 0;

        gfx.drawFillCircle(pux, puy, pu.radius, pu.color);
        gfx.drawCircle(pux, puy, pu.radius + 1, C_WHITE);
        gfx.setTextSize(1);
        gfx.setTextColor(C_BLACK);
        gfx.drawString(pu.char, pux - 2, puy - 3);

        if (Math.abs(pux - playerX) < 19 && Math.abs(puy - playerY) < 17) {
            if (pu.type === 'weapon') {
                playerWeaponTier = Math.min(4, playerWeaponTier + 1);
                addFloatingText("WEAPON TIER " + playerWeaponTier + "!", playerX, playerY - 16, C_YELLOW);
            } else if (pu.type === 'shield') {
                if (playerShield < playerMaxShield) {
                    playerShield++;
                    addFloatingText("SHIELD +1!", playerX, playerY - 16, C_CYAN);
                } else if (playerHull < playerMaxHull) {
                    playerHull++;
                    addFloatingText("HULL REPAIRED!", playerX, playerY - 16, C_GREEN);
                } else {
                    score += 250;
                    addFloatingText("BONUS +250!", playerX, playerY - 16, C_CYAN);
                }
            } else if (pu.type === 'energy') {
                playerOverdrive = Math.min(100, playerOverdrive + 50);
                addFloatingText("EMP +50%!", playerX, playerY - 16, C_MAGENTA);
            } else if (pu.type === 'combo') {
                comboCount += 2;
                comboTimer = 95;
                addFloatingText("COMBO x" + comboCount + "!", playerX, playerY - 16, C_GOLD);
            }
            playSound(880, 40);
            spawnExplosion(pux, puy, pu.color, 6, 1.0);
            powerups.splice(pi, 1);
            saveGameProgress(true);
            continue;
        }

        if (pux < -15) {
            powerups.splice(pi, 1);
        }
    }

    // 10. Draw Player Ship
    drawPlayerShip(playerX, playerY, true);

    // 11. Draw Particles, Blast Rings & Floating Combat Text
    updateAndDrawParticles();
    updateAndDrawFloatingTexts();

    // 12. Full-Screen Boss Death Flashbang Effect
    if (flashbangTimer > 0) {
        if (flashbangTimer > 7) {
            gfx.fill(C_WHITE);
        } else if (flashbangTimer > 4) {
            gfx.fill(C_FLASH_YEL);
        } else {
            gfx.drawRect(0, 18, screenWidth, screenHeight - 18, C_WHITE);
            gfx.drawRect(2, 20, screenWidth - 4, screenHeight - 22, C_YELLOW);
        }
        flashbangTimer--;
    }

    // 13. Draw Top HUD
    drawHUD();

    // 14. Push Frame to Display
    if (hasSprite && typeof gfx.pushSprite === 'function') {
        var shakeAmp = screenShake > 12 ? 8 : 4;
        var shakeX = screenShake > 0 ? (((Math.random() * shakeAmp) | 0) - (shakeAmp >> 1)) : 0;
        var shakeY = screenShake > 0 ? (((Math.random() * shakeAmp) | 0) - (shakeAmp >> 1)) : 0;
        gfx.pushSprite(shakeX, shakeY);
    }
    if (screenShake > 0) screenShake--;
}

// --- Screen 1: Main Title Screen with [ START ] Button ---
function updateTitleScreen() {
    updateAndDrawBackground(1);

    var centerX = screenWidth >> 1;
    var now = Date.now();

    gfx.setTextSize(1);
    gfx.setTextColor(C_YELLOW);
    gfx.drawString("BEST RECORD: " + highScore, 8, 6);

    // Neon Title Logo
    gfx.setTextSize(3);
    gfx.setTextColor(C_CYAN);
    gfx.drawString("CYBER STRIKE", centerX - 108, 28);
    gfx.setTextColor(C_MAGENTA);
    gfx.drawString("CYBER STRIKE", centerX - 110, 26);

    gfx.setTextSize(2);
    gfx.setTextColor(C_GOLD);
    gfx.drawString("=== 2099 ===", centerX - 70, 58);

    // Animated Clean Ship Preview
    var previewY = 98 + Math.sin(now / 220) * 5;
    drawPlayerShip(centerX - 6, previewY, false);

    // Prominent [ START ] Button
    var btnW = 180;
    var btnX = centerX - (btnW >> 1);
    var pulse = ((now & 256) === 0);
    gfx.drawFillRect(btnX, 132, btnW, 30, C_DEEP_BLUE);
    gfx.drawRect(btnX, 132, btnW, 30, pulse ? C_WHITE : C_CYAN);
    gfx.drawRect(btnX + 2, 134, btnW - 4, 26, C_MAGENTA);

    gfx.setTextSize(2);
    gfx.setTextColor(pulse ? C_WHITE : C_CYAN);
    gfx.drawString("> START <", centerX - 54, 140);

    gfx.setTextSize(1);
    gfx.setTextColor(C_NEON_BLUE);
    gfx.drawString("UP/DW: STEER & MENU   |   SELECT: FIRE", centerX - 112, 178);
    gfx.drawString("DOUBLE-TAP SEL: EMP   |   UP+DW: PAUSE/EXIT", centerX - 126, 192);

    if (hasSprite && typeof gfx.pushSprite === 'function') {
        gfx.pushSprite(0, 0);
    }

    if (keyboard.getSelPress() && (now - lastMenuMoveTime > 200)) {
        lastMenuMoveTime = now;
        // Default cursor to first used slot, or 0
        slotMenuCursor = 0;
        gameState = STATE_SAVE_SLOTS;
        playSound(600, 60);
        delay(180);
    }
}

// --- Screen 2: 3 Save Slots + [+ NEW GAME] Option at Bottom ---
function updateSaveSlotsScreen() {
    updateAndDrawBackground(1);

    var centerX = screenWidth >> 1;
    var now = Date.now();

    // Header
    gfx.drawFillRect(0, 0, screenWidth, 20, C_NAVY);
    fastHLine(0, 20, screenWidth, C_GRID_CYAN);
    gfx.setTextSize(1);
    gfx.setTextColor(C_CYAN);
    gfx.drawString("SELECT SAVE SLOT", 10, 6);
    gfx.setTextColor(C_YELLOW);
    gfx.drawString("BEST: " + highScore, screenWidth - 95, 6);

    // Navigation (4 items: 0, 1, 2 = Slots 1..3, 3 = [+ NEW GAME])
    var upPressed = keyboard.getPrevPress();
    var dwPressed = keyboard.getNextPress();
    var selPressed = keyboard.getSelPress();
    var escPressed = keyboard.getEscPress();

    if ((upPressed && dwPressed) || escPressed) {
        lastMenuMoveTime = now;
        gameState = STATE_TITLE;
        playSound(400, 40);
        delay(180);
        return;
    }

    if (upPressed && (now - lastMenuMoveTime > 165)) {
        slotMenuCursor = (slotMenuCursor + 3) % 4;
        lastMenuMoveTime = now;
        playSound(520, 20);
    } else if (dwPressed && (now - lastMenuMoveTime > 165)) {
        slotMenuCursor = (slotMenuCursor + 1) % 4;
        lastMenuMoveTime = now;
        playSound(520, 20);
    }

    // Draw 3 Save Slot Cards
    var cardX = 12;
    var cardW = screenWidth - 24;
    for (var i = 0; i < 3; i++) {
        var cardY = 24 + i * 52;
        var cardH = 48;
        var isSel = (slotMenuCursor === i);
        var slot = saveSlots[i];

        gfx.drawFillRect(cardX, cardY, cardW, cardH, isSel ? C_DEEP_BLUE : C_NAVY);
        gfx.drawRect(cardX, cardY, cardW, cardH, isSel ? C_CYAN : C_DARK_GREY);
        if (isSel) {
            gfx.drawRect(cardX + 1, cardY + 1, cardW - 2, cardH - 2, C_WHITE);
        }

        var orbX = cardX + 18;
        var orbY = cardY + 24;

        if (slot && slot.used) {
            // Draw Shiny Colored Difficulty Ball on Left!
            drawShinyOrb(orbX, orbY, slot.difficulty);

            var dName = DIFF_NAMES[slot.difficulty] || "NORMAL";
            var dColor = slot.difficulty === DIFF_EASY ? C_GREEN : (slot.difficulty === DIFF_NORMAL ? C_ORANGE : C_RED);

            gfx.setTextSize(1);
            gfx.setTextColor(isSel ? C_WHITE : C_CYAN);
            gfx.drawString("SLOT " + (i + 1), cardX + 34, cardY + 9);

            gfx.setTextColor(dColor);
            gfx.drawString("[" + dName + "]", cardX + 78, cardY + 9);

            gfx.setTextColor(C_GOLD);
            gfx.drawString("SCR: " + slot.score, cardX + 165, cardY + 9);

            gfx.setTextColor(isSel ? C_WHITE : C_GREY);
            gfx.drawString("WAVE " + slot.wave + "   |   TIME: " + formatPlayTime(slot.playTimeMs), cardX + 34, cardY + 28);
        } else {
            // Empty Slot Indicator
            gfx.drawCircle(orbX, orbY, 6, C_DARK_GREY);
            gfx.drawPixel(orbX, orbY, C_DARK_GREY);

            gfx.setTextSize(1);
            gfx.setTextColor(isSel ? C_WHITE : C_GREY);
            gfx.drawString("SLOT " + (i + 1) + "  -  [ EMPTY SLOT ]", cardX + 36, cardY + 14);
            gfx.setTextColor(C_DARK_GREY);
            gfx.drawString("Press SELECT to start a new run here", cardX + 36, cardY + 28);
        }
    }

    // 4th Option at Bottom: [ + START NEW GAME ]
    var newBtnY = 182;
    var newBtnH = 26;
    var newSel = (slotMenuCursor === 3);
    gfx.drawFillRect(cardX, newBtnY, cardW, newBtnH, newSel ? C_CRIMSON : C_NAVY);
    gfx.drawRect(cardX, newBtnY, cardW, newBtnH, newSel ? C_YELLOW : C_MAGENTA);
    gfx.setTextSize(1);
    gfx.setTextColor(newSel ? C_WHITE : C_GOLD);
    gfx.drawString(newSel ? "> [ + START NEW GAME ] <" : "  [ + START NEW GAME ]  ", centerX - 72, newBtnY + 9);

    // Footer
    gfx.setTextColor(C_NEON_BLUE);
    gfx.drawString("UP/DW: NAVIGATE  |  SEL: CHOOSE  |  UP+DW: BACK", 18, 216);

    if (hasSprite && typeof gfx.pushSprite === 'function') {
        gfx.pushSprite(0, 0);
    }

    if (selPressed && (now - lastMenuMoveTime > 190)) {
        lastMenuMoveTime = now;
        if (slotMenuCursor < 3) {
            var chosenSlot = saveSlots[slotMenuCursor];
            if (chosenSlot && chosenSlot.used) {
                // Continue existing save slot directly!
                activeSlotIndex = slotMenuCursor;
                loadFromSlotAndLaunch(activeSlotIndex);
            } else {
                // Chosen slot is empty -> choose difficulty & start new game in this slot
                pendingNewSlot = slotMenuCursor;
                difficultyCursor = DIFF_NORMAL;
                gameState = STATE_DIFFICULTY;
                playSound(580, 50);
                delay(180);
            }
        } else {
            // Clicked [+ START NEW GAME] at the bottom
            var firstEmpty = -1;
            for (var s = 0; s < 3; s++) {
                if (!saveSlots[s] || !saveSlots[s].used) {
                    firstEmpty = s;
                    break;
                }
            }
            if (firstEmpty !== -1) {
                // At least one slot is free -> use first empty slot
                pendingNewSlot = firstEmpty;
                difficultyCursor = DIFF_NORMAL;
                gameState = STATE_DIFFICULTY;
                playSound(580, 50);
                delay(180);
            } else {
                // All 3 slots are FULL -> Ask which slot to overwrite!
                overwriteCursor = 0;
                gameState = STATE_SELECT_OVERWRITE;
                playSound(440, 50);
                delay(180);
            }
        }
    }
}

// --- Screen 3: Choose Which Full Slot to Overwrite ---
function updateSelectOverwriteScreen() {
    updateAndDrawBackground(1);

    var centerX = screenWidth >> 1;
    var now = Date.now();

    gfx.drawFillRect(0, 0, screenWidth, 22, C_CRIMSON);
    fastHLine(0, 22, screenWidth, C_RED);
    gfx.setTextSize(1);
    gfx.setTextColor(C_WHITE);
    gfx.drawString("ALL 3 SLOTS FULL - CHOOSE SLOT TO OVERWRITE:", 14, 7);

    var upPressed = keyboard.getPrevPress();
    var dwPressed = keyboard.getNextPress();
    var selPressed = keyboard.getSelPress();
    var escPressed = keyboard.getEscPress();

    if ((upPressed && dwPressed) || escPressed) {
        lastMenuMoveTime = now;
        gameState = STATE_SAVE_SLOTS;
        playSound(400, 40);
        delay(180);
        return;
    }

    if (upPressed && (now - lastMenuMoveTime > 165)) {
        overwriteCursor = (overwriteCursor + 3) % 4;
        lastMenuMoveTime = now;
        playSound(520, 20);
    } else if (dwPressed && (now - lastMenuMoveTime > 165)) {
        overwriteCursor = (overwriteCursor + 1) % 4;
        lastMenuMoveTime = now;
        playSound(520, 20);
    }

    var cardX = 14;
    var cardW = screenWidth - 28;
    for (var i = 0; i < 3; i++) {
        var cardY = 28 + i * 50;
        var cardH = 45;
        var isSel = (overwriteCursor === i);
        var slot = saveSlots[i];

        gfx.drawFillRect(cardX, cardY, cardW, cardH, isSel ? C_CRIMSON : C_NAVY);
        gfx.drawRect(cardX, cardY, cardW, cardH, isSel ? C_WHITE : C_RED);

        if (slot) {
            drawShinyOrb(cardX + 18, cardY + 22, slot.difficulty);
            gfx.setTextSize(1);
            gfx.setTextColor(C_WHITE);
            gfx.drawString("OVERWRITE SLOT " + (i + 1) + " [" + DIFF_NAMES[slot.difficulty] + "]", cardX + 34, cardY + 8);
            gfx.setTextColor(C_GOLD);
            gfx.drawString("SCR:" + slot.score + "  |  WV:" + slot.wave + "  |  " + formatPlayTime(slot.playTimeMs), cardX + 34, cardY + 26);
        }
    }

    // Cancel Option at Bottom
    var cancelSel = (overwriteCursor === 3);
    gfx.drawFillRect(cardX, 182, cardW, 26, cancelSel ? C_DEEP_BLUE : C_NAVY);
    gfx.drawRect(cardX, 182, cardW, 26, cancelSel ? C_GREEN : C_DARK_GREY);
    gfx.setTextColor(cancelSel ? C_GREEN : C_GREY);
    gfx.drawString(cancelSel ? "> [ CANCEL - KEEP ALL SAVES ] <" : "  [ CANCEL - KEEP ALL SAVES ]  ", centerX - 92, 191);

    if (hasSprite && typeof gfx.pushSprite === 'function') {
        gfx.pushSprite(0, 0);
    }

    if (selPressed && (now - lastMenuMoveTime > 190)) {
        lastMenuMoveTime = now;
        if (overwriteCursor === 3) {
            gameState = STATE_SAVE_SLOTS;
            playSound(480, 40);
            delay(180);
        } else {
            pendingNewSlot = overwriteCursor;
            confirmOverwriteIdx = 0; // Default to NO (safe)
            gameState = STATE_CONFIRM_OVERWRITE;
            playSound(440, 50);
            delay(180);
        }
    }
}

// --- Screen 4: Secondary Confirmation Before Overwriting Chosen Slot ---
function updateConfirmOverwriteScreen() {
    updateAndDrawBackground(1);

    var centerX = screenWidth >> 1;
    var now = Date.now();
    var slot = saveSlots[pendingNewSlot];

    var boxW = 268;
    var boxH = 160;
    var boxX = centerX - (boxW >> 1);
    var boxY = 32;

    gfx.drawFillRect(boxX, boxY, boxW, boxH, C_NAVY);
    gfx.drawRect(boxX, boxY, boxW, boxH, C_RED);
    gfx.drawRect(boxX + 2, boxY + 2, boxW - 4, boxH - 4, C_MAGENTA);

    gfx.setTextSize(2);
    gfx.setTextColor(C_RED);
    gfx.drawString("OVERWRITE SLOT " + (pendingNewSlot + 1) + "?", centerX - 102, boxY + 12);

    gfx.setTextSize(1);
    gfx.setTextColor(C_WHITE);
    gfx.drawString("Are you sure? This will permanently erase:", centerX - 118, boxY + 36);

    if (slot) {
        drawShinyOrb(boxX + 26, boxY + 60, slot.difficulty);
        gfx.setTextColor(C_GOLD);
        gfx.drawString("[" + DIFF_NAMES[slot.difficulty] + "]  SCR: " + slot.score + "  (WAVE " + slot.wave + ")", boxX + 42, boxY + 52);
        gfx.setTextColor(C_CYAN);
        gfx.drawString("TIME PLAYED: " + formatPlayTime(slot.playTimeMs), boxX + 42, boxY + 65);
    }

    var upPressed = keyboard.getPrevPress();
    var dwPressed = keyboard.getNextPress();
    var selPressed = keyboard.getSelPress();

    if ((upPressed || dwPressed) && (now - lastMenuMoveTime > 165)) {
        confirmOverwriteIdx = confirmOverwriteIdx === 0 ? 1 : 0;
        lastMenuMoveTime = now;
        playSound(520, 20);
    }

    var noSel = (confirmOverwriteIdx === 0);
    gfx.drawFillRect(boxX + 18, boxY + 84, boxW - 36, 26, noSel ? C_DEEP_BLUE : C_BLACK);
    gfx.drawRect(boxX + 18, boxY + 84, boxW - 36, 26, noSel ? C_GREEN : C_DARK_GREY);
    gfx.setTextColor(noSel ? C_GREEN : C_GREY);
    gfx.drawString((noSel ? "> " : "  ") + "NO, KEEP SLOT " + (pendingNewSlot + 1) + " SAFE", boxX + 34, boxY + 93);

    var yesSel = (confirmOverwriteIdx === 1);
    gfx.drawFillRect(boxX + 18, boxY + 118, boxW - 36, 26, yesSel ? C_CRIMSON : C_BLACK);
    gfx.drawRect(boxX + 18, boxY + 118, boxW - 36, 26, yesSel ? C_WHITE : C_DARK_GREY);
    gfx.setTextColor(yesSel ? C_WHITE : C_GREY);
    gfx.drawString((yesSel ? "> " : "  ") + "YES, ERASE & OVERWRITE", boxX + 34, boxY + 127);

    if (hasSprite && typeof gfx.pushSprite === 'function') {
        gfx.pushSprite(0, 0);
    }

    if (selPressed && (now - lastMenuMoveTime > 190)) {
        lastMenuMoveTime = now;
        if (confirmOverwriteIdx === 0) {
            gameState = STATE_SAVE_SLOTS;
            playSound(480, 40);
            delay(180);
        } else {
            difficultyCursor = DIFF_NORMAL;
            gameState = STATE_DIFFICULTY;
            playSound(600, 60);
            delay(180);
        }
    }
}

// --- Screen 5: Difficulty Selection (Easy / Normal / Hard with Shiny Orbs) ---
function updateDifficultyScreen() {
    updateAndDrawBackground(1);

    var centerX = screenWidth >> 1;
    var now = Date.now();

    gfx.drawFillRect(0, 0, screenWidth, 22, C_NAVY);
    fastHLine(0, 22, screenWidth, C_GRID_CYAN);
    gfx.setTextSize(1);
    gfx.setTextColor(C_CYAN);
    gfx.drawString("SELECT DIFFICULTY  (SLOT " + (pendingNewSlot + 1) + ")", 12, 7);

    var upPressed = keyboard.getPrevPress();
    var dwPressed = keyboard.getNextPress();
    var selPressed = keyboard.getSelPress();
    var escPressed = keyboard.getEscPress();

    if ((upPressed && dwPressed) || escPressed) {
        lastMenuMoveTime = now;
        gameState = STATE_SAVE_SLOTS;
        playSound(400, 40);
        delay(180);
        return;
    }

    if (upPressed && (now - lastMenuMoveTime > 165)) {
        difficultyCursor = (difficultyCursor + 2) % 3;
        lastMenuMoveTime = now;
        playSound(520, 20);
    } else if (dwPressed && (now - lastMenuMoveTime > 165)) {
        difficultyCursor = (difficultyCursor + 1) % 3;
        lastMenuMoveTime = now;
        playSound(520, 20);
    }

    var descriptions = [
        "Casual & relaxed.",
        "Balanced arcade.",
        "Not so casual, hard"
    ];
    var borderColors = [C_GREEN, C_ORANGE, C_RED];

    var cardX = 14;
    var cardW = screenWidth - 28;
    for (var d = 0; d < 3; d++) {
        var cardY = 32 + d * 58;
        var cardH = 50;
        var isSel = (difficultyCursor === d);

        gfx.drawFillRect(cardX, cardY, cardW, cardH, isSel ? C_DEEP_BLUE : C_NAVY);
        gfx.drawRect(cardX, cardY, cardW, cardH, isSel ? borderColors[d] : C_DARK_GREY);
        if (isSel) {
            gfx.drawRect(cardX + 1, cardY + 1, cardW - 2, cardH - 2, C_WHITE);
        }

        // Shiny Orb Indicator on Left
        drawShinyOrb(cardX + 20, cardY + 25, d);

        gfx.setTextSize(2);
        gfx.setTextColor(isSel ? borderColors[d] : C_GREY);
        gfx.drawString((isSel ? "> " : "  ") + DIFF_NAMES[d], cardX + 36, cardY + 8);

        gfx.setTextSize(1);
        gfx.setTextColor(isSel ? C_WHITE : C_GREY);
        gfx.drawString(descriptions[d], cardX + 38, cardY + 31);
    }

    gfx.setTextSize(1);
    gfx.setTextColor(C_NEON_BLUE);
    gfx.drawString("UP/DW: CHOOSE DIFFICULTY   |   SELECT: LAUNCH", 22, 214);

    if (hasSprite && typeof gfx.pushSprite === 'function') {
        gfx.pushSprite(0, 0);
    }

    if (selPressed && (now - lastMenuMoveTime > 190)) {
        lastMenuMoveTime = now;
        activeSlotIndex = pendingNewSlot;
        currentDifficulty = difficultyCursor;
        initNewGameInActiveSlot();
        startLaunchAnimation();
        delay(120);
    }
}

// --- Pause Menu ---
function updatePauseMenu() {
    var boxX = (screenWidth >> 1) - 92;
    var boxY = (screenHeight >> 1) - 48;

    gfx.drawFillRect(boxX, boxY, 184, 96, C_NAVY);
    gfx.drawRect(boxX, boxY, 184, 96, C_CYAN);

    gfx.setTextSize(2);
    gfx.setTextColor(C_YELLOW);
    gfx.drawString("PAUSED", boxX + 56, boxY + 10);

    gfx.setTextSize(1);
    drawShinyOrb(boxX + 26, boxY + 38, currentDifficulty);
    gfx.setTextColor(C_GREEN);
    gfx.drawString("SLOT " + (activeSlotIndex + 1) + " SAVED (" + formatPlayTime(playTimeMs) + ")", boxX + 40, boxY + 34);

    gfx.setTextColor(C_WHITE);
    gfx.drawString("SELECT : RESUME MISSION", boxX + 24, boxY + 56);
    gfx.drawString("UP+DW  : MAIN MENU", boxX + 24, boxY + 72);

    if (hasSprite && typeof gfx.pushSprite === 'function') {
        gfx.pushSprite(0, 0);
    }

    if (keyboard.getSelPress()) {
        lastFrameTime = Date.now();
        gameState = STATE_PLAYING;
        delay(180);
    }
}

// --- Game Over Screen ---
function updateGameOverScreen() {
    updateAndDrawBackground(1);

    var centerX = screenWidth >> 1;

    gfx.setTextSize(3);
    gfx.setTextColor(C_RED);
    gfx.drawString("SHIP DESTROYED", centerX - 125, 24);

    gfx.setTextSize(2);
    gfx.setTextColor(C_WHITE);
    gfx.drawString("SCORE: " + score, centerX - 65, 62);

    if (score >= highScore && score > 0) {
        gfx.setTextColor(C_GOLD);
        gfx.drawString("* NEW HIGH RECORD! *", centerX - 115, 86);
    } else {
        gfx.setTextColor(C_GREY);
        gfx.drawString("BEST RECORD: " + highScore, centerX - 85, 86);
    }

    gfx.setTextSize(1);
    drawShinyOrb(centerX - 72, 118, currentDifficulty);
    gfx.setTextColor(C_CYAN);
    gfx.drawString("SLOT " + (activeSlotIndex + 1) + " [" + DIFF_NAMES[currentDifficulty] + "]  -  WAVE " + wave, centerX - 56, 114);
    gfx.drawString("HOSTILES HIT : " + totalKills + "   |   COMBO: x" + maxCombo, centerX - 85, 132);
    gfx.drawString("TIME PLAYED  : " + formatPlayTime(playTimeMs), centerX - 65, 148);

    if (((Date.now() >> 8) & 1) === 0) {
        gfx.setTextSize(2);
        gfx.setTextColor(C_GREEN);
        gfx.drawString("[ SELECT: SAVES ]", centerX - 102, 174);
    }

    if (hasSprite && typeof gfx.pushSprite === 'function') {
        gfx.pushSprite(0, 0);
    }

    if (keyboard.getSelPress()) {
        loadSavedData();
        lastMenuMoveTime = Date.now();
        slotMenuCursor = activeSlotIndex;
        gameState = STATE_SAVE_SLOTS;
        playSound(600, 70);
        delay(200);
    }
}

// --- Initialize New Game or Load Existing Slot ---
function resetEntities() {
    playerX = 38;
    playerY = screenHeight / 2;
    playerTargetY = playerY;
    playerInvincible = 45;
    shieldRegenTimer = 0;
    comboCount = 0;
    comboTimer = 0;
    waveTimer = 0;
    waveKills = 0;
    dyingTimer = 0;
    dyingExploded = false;
    flashbangTimer = 0;

    playerBullets = [];
    enemyBullets = [];
    enemies = [];
    powerups = [];
    particles = [];
    blastRings = [];
    floatingTexts = [];
    boss = null;
    empShockwave = null;
}

function initNewGameInActiveSlot() {
    score = 0;
    wave = 1;
    playTimeMs = 0;
    totalKills = 0;
    maxCombo = 1;
    playerShield = playerMaxShield;
    playerHull = playerMaxHull;
    playerWeaponTier = 1;
    playerOverdrive = 0;
    resetEntities();
    saveGameProgress(true);
}

function loadFromSlotAndLaunch(slotIdx) {
    var slot = saveSlots[slotIdx];
    if (slot && slot.used) {
        currentDifficulty = typeof slot.difficulty === 'number' ? slot.difficulty : DIFF_NORMAL;
        score = slot.score || 0;
        wave = slot.wave || 1;
        playTimeMs = slot.playTimeMs || 0;
        playerWeaponTier = slot.weaponTier || 1;
        playerShield = typeof slot.shield === 'number' ? slot.shield : playerMaxShield;
        playerHull = (typeof slot.hull === 'number' && slot.hull > 0) ? slot.hull : playerMaxHull;
        playerOverdrive = slot.overdrive || 0;
        totalKills = slot.totalKills || 0;
        maxCombo = slot.maxCombo || 1;
    }
    resetEntities();
    startLaunchAnimation();
}

// --- Main Entry Point ---
function main() {
    initStars();
    loadSavedData();

    if (typeof keyboard.setLongPress === 'function') {
        keyboard.setLongPress(true);
    }

    var running = true;
    while (running) {
        if (gameState === STATE_TITLE) {
            updateTitleScreen();
            if (keyboard.getEscPress() || (keyboard.getPrevPress() && keyboard.getNextPress())) {
                running = false;
                break;
            }
        } else if (gameState === STATE_SAVE_SLOTS) {
            updateSaveSlotsScreen();
        } else if (gameState === STATE_SELECT_OVERWRITE) {
            updateSelectOverwriteScreen();
        } else if (gameState === STATE_CONFIRM_OVERWRITE) {
            updateConfirmOverwriteScreen();
        } else if (gameState === STATE_DIFFICULTY) {
            updateDifficultyScreen();
        } else if (gameState === STATE_LAUNCH_ANIM) {
            updateLaunchAnimation();
        } else if (gameState === STATE_PLAYING) {
            updateGame();
        } else if (gameState === STATE_DYING) {
            updateDyingSequence();
        } else if (gameState === STATE_PAUSED) {
            updatePauseMenu();
            if (keyboard.getEscPress() || (keyboard.getPrevPress() && keyboard.getNextPress())) {
                saveGameProgress(true);
                lastMenuMoveTime = Date.now();
                gameState = STATE_TITLE;
                delay(220);
            }
        } else if (gameState === STATE_GAMEOVER) {
            updateGameOverScreen();
            if (keyboard.getEscPress() || (keyboard.getPrevPress() && keyboard.getNextPress())) {
                saveGameProgress(true);
                lastMenuMoveTime = Date.now();
                gameState = STATE_TITLE;
                delay(220);
            }
        }

        delay(1);
    }

    if (saveSlots[activeSlotIndex] && saveSlots[activeSlotIndex].used) {
        saveGameProgress(true);
    }
    if (typeof keyboard.setLongPress === 'function') {
        keyboard.setLongPress(false);
    }
    if (hasSprite && typeof gfx.deleteSprite === 'function') {
        gfx.deleteSprite();
    }
    display.fill(C_BLACK);
}

main();
