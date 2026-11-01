# 🚀 CYBER STRIKE 2099 (v1.0)

Want my custom firmware for a custom bruce device? Check out [Bruce-ESP32-C5-TFT-Without-Touch!](https://github.com/Detergent-codes/Bruce-ESP32-C5-TFT-Without-Touch)

> **Futuristic Synthwave Arcade Shooter & Combat Runner for Bruce**  
> Custom built for the **Bruce JS Interpreter (`mquickjs`)** and engineered for 3-Button Navigation on **ESP32-C5-TFT** and Bruce-supported handhelds.

---

## 🎮 Game Overview

**Cyber Strike 2099** is a fast-paced, retro synthwave horizontal arcade shooter. Battle through waves of cybernetic drones, armored gunships, and roaming asteroids, culminating in epic boss encounters across a starfield and neon perspective grid.

---

## 🕹️ Controls (3-Button Layout)

Designed to play effortlessly with just 3 navigation buttons:

| Button | In Menus | In Combat |
| :--- | :--- | :--- |
| **`[UP / PREV]`** | Navigate Up | Steer Ship Upwards (Smooth Interpolation) |
| **`[DOWN / NEXT]`** | Navigate Down | Steer Ship Downwards (Smooth Interpolation) |
| **`[SELECT]`** | Confirm / Select | **Hold:** Continuous Rapid Laser Cannons<br>**Double-Tap:** Unleash Screen-Clearing EMP Shockwave (when EMP meter is flashing) |
| **`[UP + DOWN]`** | Back / Return | Pause Game & Instant Autosave |

---

## 💾 Multi-Slot Save System & Profile Management

The game features an integrated persistent storage engine saving directly to internal flash (`LittleFS`):

- **3 Independent Save Slots (`SLOT 1`, `SLOT 2`, `SLOT 3`)**: Each slot tracks:
  - Selected Difficulty
  - Current Score (`SCR`)
  - Wave Progress (`WAVE`)
  - Total Time Played (`00m 00s` / `1h 00m`)
  - Weapon Tier, Shields, Hull Health, EMP Charge, and Combos
- **Shiny 3D Difficulty Orbs**:
  - 🟢 **Shiny Green Orb:** Easy Mode
  - 🟠 **Shiny Orange Orb:** Normal Mode
  - 🔴 **Shiny Red Orb:** Hard Mode
- **Safe Overwrite Protection**:
  - If all 3 slots are occupied and you choose `[ + START NEW GAME ]`, you are prompted to select which slot to replace.
  - A **secondary confirmation screen** defaults to `NO, KEEP SAVE SAFE` to eliminate accidental progress loss.
- **Warp Launch Animation**: Resuming or starting a game triggers a cinematic starfield hyperspace warp sequence before gameplay commences.

---

## ⚖️ Difficulty Modes

| Difficulty | Orb Indicator | Pacing & Progression | Boss Frequency | Shield & Drops |
| :--- | :---: | :--- | :--- | :--- |
| **EASY** | 🟢 | **Casual Play:** Slower enemy speed, reduced HP, **zero progressive difficulty scaling** (stays relaxed throughout). | Low (every 16 kills) | Fast Shield Regen, 40% Power-up drop rate |
| **NORMAL** | 🟠 | **Arcade Standard:** Balanced gameplay with progressive scaling as you advance through waves. | Moderate (every 8 + wave kills) | Standard Shield Regen, 30% Power-up drop rate |
| **HARD** | 🔴 | **Bullet-Hell Challenge:** Fast enemy velocity, dense salvos, high enemy HP, and steep progressive wave scaling. | Very Frequent (every 5 + wave kills) | Slow Shield Regen, 22% Power-up drop rate |

---

## ⚔️ Visual Damage & Combat Dynamics

### 💥 Progressive Player Ship Damage
- **3/3 Hull HP:** Clean, undamaged high-tech aerodynamic fighter.
- **2/3 Hull HP:** Visible hull scorch marks and a continuous trailing plume of dark grey smoke.
- **1/3 Hull HP:** Active flickering fire burns on the fuselage and wing roots with heavy smoke and ember particles.
- **0 HP (Cinematic Crash Sequence):**
  - The ship loses engine power and catches fully ablaze.
  - Mid-air sputtering and mini-explosions cause the ship to lose lift and plummet downward.
  - On ground impact, a **cataclysmic multi-stage fireball** erupts with triple expanding shockwave rings and camera shake.

### 🎯 Dynamic Enemy Feedback
- **Tiny Health Bars:** Appear overhead once an enemy takes damage, dynamically shifting from Green ➔ Yellow ➔ Red.
- **Enemy Damage FX:** Damaged hostiles show black carbon scoring, smoke plumes, and ignite in visible flames below 55% HP.
- **Dramatic Explosions:** Enemy kills trigger bright core bursts, debris particles, and expanding blast rings.

---

## 👑 The 5 Bosses

Boss waves feature 5 distinct boss encounters selected randomly (with no immediate back-to-back repeats):

1. **THE DREADNOUGHT** — Crimson/Magenta heavy flagship armed with twin plasma batteries and an aimed Ion Death Beam.
2. **NIGHT VIPER** — Bio-mechanical cyber serpent firing 3-way sinusoidal plasma waves.
3. **SOLAR FALCON** — High-speed winged cruiser deploying radiant sunburst fan spreads.
4. **BLACK WIDOW** — Cyber-arachnid that teleports across flight lanes, launching web bursts and aimed venom needles.
5. **CRIMSON TITAN** — Rogue AI fortress launching quad heavy laser barrages and high-energy lock beams.

> **Enrage Phase:** Bosses below 50% HP move faster, attack more aggressively, and show visible burning armor damage.  
> **Cataclysmic Boss Death:** Defeating a boss triggers chain detonations culminating in a **full-screen blinding flashbang** and shockwave blast!

---

## ⚡ Arsenal & Power-ups

### Weapon Upgrades
- **Tier 1:** Dual Rapid Plasma Cannons
- **Tier 2:** Triple Pulse Spread
- **Tier 3:** 4-Way Heavy Cannon + Wing Spread
- **Tier 4:** Hyper Ion Piercing Lance + Twin Side Blasters

### Power-up Drops
- **[W] Weapon:** Upgrades blaster tier (up to Tier 4).
- **[S] Shield:** Restores +1 Shield bar (or repairs +1 Hull HP if shields are already full).
- **[E] Energy:** Restores +50% EMP Overdrive gauge.
- **[C] Combo:** Instantly boosts combat combo multiplier.

### EMP Shockwave
- Charge to 100% through combat kills and Energy orbs.
- When ready, the `EMP:` gauge and border flash vividly between **White, Cyan, and Magenta**.
- **Double-Tap `[SELECT]`** to wipe all enemy projectiles, damage every hostile on screen, and convert cleared bullets into score bonuses.

---

## 📂 Installation & Running on Bruce

1. Copy `CyberStrike2099.js` to your device's SD card under:
   ```text
   /sd/interpreter/CyberStrike2099.js
   ```
2. On your Bruce handheld device:
   - Navigate to **Interpreter / JS Files**.
   - Select **`CyberStrike2099.js`** and run it.
3. Enjoy smooth 50–60 FPS arcade action!
