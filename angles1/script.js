// ---------- Config ----------

const DIFFICULTY = {
  easy: { label: "Easy", points: 6 },
  medium: { label: "Medium", points: 20 },
  hard: { label: "Hard", points: 45 },
};

const BADGE_DEFS = [
  { id: "streak_5", label: "Streak x5", check: (s) => s.bestStreak >= 5 },
  { id: "streak_10", label: "Streak x10", check: (s) => s.bestStreak >= 10 },
  { id: "streak_20", label: "Unstoppable", check: (s) => s.bestStreak >= 20 },
  { id: "hard_solve", label: "Hard Mode Hero", check: (s) => s.hardSolved >= 1 },
  { id: "type_solve", label: "Angle Spotter", check: (s) => s.typeSolved >= 1 },
  { id: "turn_solve", label: "Turn Master", check: (s) => s.turnSolved >= 1 },
];

const STORAGE_KEY = "anglesQuestState";

const TIER_UNLOCK = { medium: 3, hard: 5 };

const LEGACY_KEYS = [
  { key: "angles1QuestState", xpBase: 130 },
  { key: "angles2QuestState", xpBase: 175 },
];

// Minimum distance (degrees) a visually-classified angle must keep from 90°
// so a child is never asked to eyeball an ambiguous near-right angle.
function deadZoneMargin(tier) {
  return tier === "easy" ? 30 : tier === "medium" ? 22 : 15;
}

// ---------- Persisted stats ----------

function migrateLegacyState(legacyEntries, newXpBase, defaults) {
  let found = false;
  let totalXP = 0;
  const merged = Object.assign({}, defaults);
  legacyEntries.forEach(({ key, xpBase }) => {
    const raw = localStorage.getItem(key);
    if (!raw) return;
    let s;
    try {
      s = JSON.parse(raw);
    } catch (e) {
      return;
    }
    found = true;
    const lvl = s.level || 1;
    let lifetimeXP = s.xp || 0;
    for (let L = 1; L < lvl; L++) lifetimeXP += xpBase * L;
    totalXP += lifetimeXP;
    merged.score = (merged.score || 0) + (s.score || 0);
    merged.bestStreak = Math.max(merged.bestStreak || 0, s.bestStreak || 0);
    (s.earnedBadges || []).forEach((b) => {
      if (!merged.earnedBadges.includes(b)) merged.earnedBadges.push(b);
    });
    Object.keys(s).forEach((k) => {
      if (["score", "xp", "level", "streak", "bestStreak", "earnedBadges"].includes(k)) return;
      if (typeof s[k] === "number") merged[k] = (merged[k] || 0) + s[k];
    });
  });
  if (!found) return null;
  let level = 1,
    xp = totalXP;
  while (xp >= newXpBase * level) {
    xp -= newXpBase * level;
    level += 1;
  }
  merged.level = level;
  merged.xp = xp;
  merged.streak = 0;
  return merged;
}

function loadStats() {
  const defaults = {
    score: 0,
    xp: 0,
    level: 1,
    streak: 0,
    bestStreak: 0,
    totalSolved: 0,
    hardSolved: 0,
    typeSolved: 0,
    turnSolved: 0,
    earnedBadges: [],
  };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return Object.assign(defaults, JSON.parse(raw));
    const migrated = migrateLegacyState(LEGACY_KEYS, 175, defaults);
    if (migrated) return migrated;
    return defaults;
  } catch (e) {
    return defaults;
  }
}

function saveStats() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(stats));
}

let stats = loadStats();
let pendingAdvanceTimeout = null;

// ---------- App state ----------

let state = {
  difficulty: "easy",
  mode: "guided",
  problem: null,
};

// ---------- Helpers ----------

function randInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function choice(arr) {
  return arr[randInt(0, arr.length - 1)];
}

function xpForLevel(level) {
  return 175 * level;
}

function addPoints(basePoints) {
  const prevLevel = stats.level;
  stats.score += basePoints;
  stats.xp += basePoints;
  while (stats.xp >= xpForLevel(stats.level)) {
    stats.xp -= xpForLevel(stats.level);
    stats.level += 1;
  }
  const unlockedNewTier = Object.values(TIER_UNLOCK).some((req) => prevLevel < req && stats.level >= req);
  saveStats();
  renderStats();
  updateSelectorUI();
  if (unlockedNewTier) launchConfetti();
}

function registerSolve(category) {
  stats.totalSolved += 1;
  stats.streak += 1;
  if (stats.streak > stats.bestStreak) stats.bestStreak = stats.streak;
  if (state.difficulty === "hard") stats.hardSolved += 1;
  if (category === "type") stats.typeSolved += 1;
  if (category === "turn") stats.turnSolved += 1;
  checkBadges();
  saveStats();
  renderStats();
  renderBadges();
}

function registerMiss() {
  stats.streak = 0;
  saveStats();
  renderStats();
}

function checkBadges() {
  let newlyEarned = [];
  BADGE_DEFS.forEach((b) => {
    if (!stats.earnedBadges.includes(b.id) && b.check(stats)) {
      stats.earnedBadges.push(b.id);
      newlyEarned.push(b);
    }
  });
  if (newlyEarned.length) {
    launchConfetti();
  }
}

// ---------- Visual builders ----------

function polarPoint(cx, cy, angleDeg, r) {
  const rad = (angleDeg * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy - r * Math.sin(rad) };
}

function angleSVG(measureDeg, baseRotation, size) {
  size = size || 200;
  const cx = size / 2;
  const cy = size * 0.68;
  const armLen = size * 0.4;
  const p1 = polarPoint(cx, cy, baseRotation, armLen);
  const p2 = polarPoint(cx, cy, baseRotation + measureDeg, armLen);
  const arcR = size * 0.16;
  const a1 = polarPoint(cx, cy, baseRotation, arcR);
  const a2 = polarPoint(cx, cy, baseRotation + measureDeg, arcR);
  const largeArc = measureDeg > 180 ? 1 : 0;
  return `<div class="angle-wrap"><svg viewBox="0 0 ${size} ${size}" width="${size}" height="${size}">
    <line x1="${cx}" y1="${cy}" x2="${p1.x.toFixed(1)}" y2="${p1.y.toFixed(1)}" stroke="#1f2937" stroke-width="5" stroke-linecap="round"/>
    <line x1="${cx}" y1="${cy}" x2="${p2.x.toFixed(1)}" y2="${p2.y.toFixed(1)}" stroke="#1f2937" stroke-width="5" stroke-linecap="round"/>
    <path d="M ${a1.x.toFixed(1)} ${a1.y.toFixed(1)} A ${arcR} ${arcR} 0 ${largeArc} 0 ${a2.x.toFixed(1)} ${a2.y.toFixed(1)}" fill="none" stroke="#c2410c" stroke-width="3"/>
    <circle cx="${cx}" cy="${cy}" r="5" fill="#1f2937"/>
  </svg></div>`;
}

function shapeSVG(shape) {
  const cx = 90,
    cy = 95;
  let points;
  if (shape === "square") points = [[40, 40], [140, 40], [140, 140], [40, 140]];
  else if (shape === "rectangle") points = [[25, 55], [155, 55], [155, 135], [25, 135]];
  else if (shape === "rightTriangle") points = [[40, 150], [40, 40], [150, 150]];
  else points = regularPolygonPoints({ triangle: 3, pentagon: 5, hexagon: 6 }[shape], cx, cy, 65, -90);
  const pathData = points.map((p) => p.join(",")).join(" ");
  return `<div class="shape-wrap"><svg viewBox="0 0 180 180" width="180" height="180"><polygon points="${pathData}" fill="#bfdbfe" stroke="#1f2937" stroke-width="3"/></svg></div>`;
}

function regularPolygonPoints(n, cx, cy, r, rotationDeg) {
  let pts = [];
  for (let i = 0; i < n; i++) {
    const a = ((360 / n) * i + rotationDeg) * (Math.PI / 180);
    pts.push([(cx + r * Math.cos(a)).toFixed(1), (cy + r * Math.sin(a)).toFixed(1)]);
  }
  return pts;
}

function turnWedgeSVG(fractionKey) {
  const angles = { quarter: 90, half: 180, "three-quarter": 270, full: 360 };
  const deg = angles[fractionKey];
  const cx = 90,
    cy = 90,
    r = 70;
  let path;
  if (deg >= 360) {
    path = `<circle cx="${cx}" cy="${cy}" r="${r}" fill="#93c5fd" stroke="#1f2937" stroke-width="2"/>`;
  } else {
    const p0 = polarPoint(cx, cy, 90, r);
    const p1 = polarPoint(cx, cy, 90 - deg, r);
    const largeArc = deg > 180 ? 1 : 0;
    path = `<path d="M ${cx} ${cy} L ${p0.x.toFixed(1)} ${p0.y.toFixed(1)} A ${r} ${r} 0 ${largeArc} 0 ${p1.x.toFixed(1)} ${p1.y.toFixed(1)} Z" fill="#93c5fd" stroke="#1f2937" stroke-width="2"/>`;
  }
  return `<div class="turn-wrap"><svg viewBox="0 0 180 180" width="180" height="180">
    <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="#1f2937" stroke-width="2" stroke-dasharray="4 3"/>
    ${path}
  </svg></div>`;
}

function compassSVG(angleDeg, spinDirection) {
  const cx = 100,
    cy = 100,
    r = 75;
  const labelPos = { North: [cx, cy - r - 14], East: [cx + r + 16, cy + 5], South: [cx, cy + r + 20], West: [cx - r - 16, cy + 5] };
  const dirs = ["North", "East", "South", "West"];
  const labels = dirs.map((d) => `<text x="${labelPos[d][0]}" y="${labelPos[d][1]}" font-size="14" font-weight="700" text-anchor="middle" fill="#1f2937">${d[0]}</text>`).join("");
  const tick = dirs
    .map((d, i) => {
      const p1 = polarPoint(cx, cy, 90 - i * 90, r);
      const p2 = polarPoint(cx, cy, 90 - i * 90, r - 8);
      return `<line x1="${p1.x.toFixed(1)}" y1="${p1.y.toFixed(1)}" x2="${p2.x.toFixed(1)}" y2="${p2.y.toFixed(1)}" stroke="#1f2937" stroke-width="2"/>`;
    })
    .join("");
  const tip = polarPoint(cx, cy, 90 - angleDeg, r * 0.8);
  const spinGlyph = spinDirection === "clockwise" ? "↻" : spinDirection === "counterclockwise" ? "↺" : "";
  const spinHTML = spinGlyph ? `<text x="${cx}" y="${cy + 10}" font-size="34" text-anchor="middle" fill="#9a3412" opacity="0.3">${spinGlyph}</text>` : "";
  return `<div class="turn-wrap"><svg viewBox="0 0 200 200" width="200" height="200">
    <circle cx="${cx}" cy="${cy}" r="${r}" fill="#fff" stroke="#1f2937" stroke-width="3"/>
    ${tick}
    ${labels}
    ${spinHTML}
    <line x1="${cx}" y1="${cy}" x2="${tip.x.toFixed(1)}" y2="${tip.y.toFixed(1)}" stroke="#c2410c" stroke-width="6" stroke-linecap="round"/>
    <circle cx="${cx}" cy="${cy}" r="5" fill="#1f2937"/>
  </svg></div>`;
}

// ---------- Question generators ----------

function genClassifyAngle(tier) {
  const margin = deadZoneMargin(tier);
  const type = choice(["right", "acute", "obtuse"]);
  let measure;
  if (type === "right") measure = 90;
  else if (type === "acute") measure = randInt(10, 90 - margin);
  else measure = randInt(90 + margin, 175);

  const options = ["Right angle", "Smaller than a right angle", "Larger than a right angle"];
  const correctIndex = type === "right" ? 0 : type === "acute" ? 1 : 2;

  return {
    category: "type",
    visualHTML: angleSVG(measure, randInt(0, 340)),
    promptText: "What kind of angle is this?",
    inputs: [{ id: "t", label: "Angle type", type: "select", options }],
    check: (v) => Number(v.t) === correctIndex,
    correctSummary: () => options[correctIndex],
    hint: "A right angle looks like a perfect corner, like the corner of a piece of paper. Compare this angle's opening to that.",
  };
}

function genConstructAngleType(tier) {
  const margin = deadZoneMargin(tier);
  const type = choice(["right", "acute", "obtuse"]);
  const baseRotation = randInt(0, 340);
  const step = tier === "easy" ? 15 : tier === "medium" ? 10 : 5;
  const typeLabel = { right: "a right angle", acute: "smaller than a right angle", obtuse: "larger than a right angle" }[type];
  const livePreview = (val) => angleSVG(val, baseRotation);
  const tightTol = Math.min(margin, 10);
  const range = type === "right" ? [90 - tightTol, 90 + tightTol] : type === "acute" ? [5, 90 - margin] : [90 + margin, 175];

  return {
    category: "type",
    livePreview,
    visualHTML: livePreview(10),
    promptText: `Drag to make an angle that is ${typeLabel}.`,
    inputs: [{ id: "a", label: "", type: "range", min: 0, max: 175, step, default: 10 }],
    check: (v) => {
      const val = Number(v.a);
      return val >= range[0] && val <= range[1];
    },
    correctSummary: () => typeLabel,
    hint: "Drag the slider to open or close the angle. A right angle looks like a perfect corner.",
  };
}

function genDirectionTurn(tier) {
  const dirs = ["North", "East", "South", "West"];
  const startIdx = randInt(0, 3);
  const fraction = choice(tier === "easy" ? ["quarter", "half"] : ["quarter", "half", "three-quarter"]);
  const direction = tier === "easy" ? "clockwise" : choice(["clockwise", "counterclockwise"]);
  const steps = { quarter: 1, half: 2, "three-quarter": 3 }[fraction];
  const newIdx = direction === "clockwise" ? (startIdx + steps) % 4 : (((startIdx - steps) % 4) + 4) % 4;

  return {
    category: "turn",
    visualHTML: compassSVG(startIdx * 90, direction),
    promptText: `Facing ${dirs[startIdx]}, turn a ${fraction.replace("-", " ")} turn ${direction}. Which direction are you facing now?`,
    inputs: [{ id: "d", label: "New direction", type: "select", options: dirs }],
    check: (v) => Number(v.d) === newIdx,
    correctSummary: () => dirs[newIdx],
    hint: "Picture a compass: North, East, South, West going clockwise. Count the steps in the direction you're turning.",
  };
}

function genDegreeTurn(tier) {
  const pool = tier === "hard" ? ["quarter", "half", "three-quarter", "full"] : ["quarter", "half", "full"];
  const fraction = choice(pool);
  const degrees = { quarter: 90, half: 180, "three-quarter": 270, full: 360 }[fraction];

  return {
    category: "turn",
    visualHTML: turnWedgeSVG(fraction),
    promptText: `A ${fraction.replace("-", " ")} turn is how many degrees?`,
    inputs: [{ id: "d", label: "Degrees", type: "number", min: 0, max: 360 }],
    check: (v) => Number(v.d) === degrees,
    correctSummary: () => `${degrees}°`,
    hint: "A full turn all the way around is 360°. A half turn is half of that, and a quarter turn is a quarter of that.",
  };
}

function genConstructTurn(tier) {
  const dirs = ["North", "East", "South", "West"];
  const startIdx = randInt(0, 3);
  const fraction = choice(tier === "hard" ? ["quarter", "half", "three-quarter"] : ["quarter", "half"]);
  const direction = choice(["clockwise", "counterclockwise"]);
  const steps = { quarter: 1, half: 2, "three-quarter": 3 }[fraction];
  const newIdx = direction === "clockwise" ? (startIdx + steps) % 4 : (((startIdx - steps) % 4) + 4) % 4;
  const compassAngle = (i) => i * 90;
  const livePreview = (val) => compassSVG(val, direction);

  return {
    category: "turn",
    livePreview,
    visualHTML: livePreview(compassAngle(startIdx)),
    promptText: `Start facing ${dirs[startIdx]}. Drag the arrow to show a ${fraction.replace("-", " ")} turn ${direction}.`,
    inputs: [{ id: "d", label: "", type: "range", min: 0, max: 270, step: 90, default: compassAngle(startIdx) }],
    check: (v) => Number(v.d) === compassAngle(newIdx),
    correctSummary: () => dirs[newIdx],
    hint: "Picture a compass: North, East, South, West going clockwise. Drag the arrow to the new direction.",
  };
}

function genTurn(tier) {
  if (tier !== "easy" && Math.random() < 0.4) return genDegreeTurn(tier);
  return genDirectionTurn(tier);
}

function genCountAngles(tier) {
  const askRightAngles = tier === "hard" && Math.random() < 0.5;
  if (askRightAngles) {
    const shape = choice(["square", "rectangle", "rightTriangle", "pentagon", "hexagon"]);
    const rightCount = { square: 4, rectangle: 4, rightTriangle: 1, pentagon: 0, hexagon: 0 }[shape];
    return {
      category: "count",
      visualHTML: shapeSVG(shape),
      promptText: "How many right angles does this shape have?",
      inputs: [{ id: "r", label: "Right angles", type: "number", min: 0, max: 6 }],
      check: (v) => Number(v.r) === rightCount,
      correctSummary: () => String(rightCount),
      hint: "A right angle looks like a perfect corner, like the corner of a piece of paper.",
    };
  }

  const pool = tier === "easy" ? ["triangle", "square", "rectangle"] : tier === "medium" ? ["triangle", "square", "rectangle", "pentagon"] : ["triangle", "square", "rectangle", "pentagon", "hexagon"];
  const shape = choice(pool);
  const n = { triangle: 3, square: 4, rectangle: 4, pentagon: 5, hexagon: 6 }[shape];

  return {
    category: "count",
    visualHTML: shapeSVG(shape),
    promptText: "How many angles (corners) does this shape have?",
    inputs: [{ id: "a", label: "Angles", type: "number", min: 0, max: 8 }],
    check: (v) => Number(v.a) === n,
    correctSummary: () => String(n),
    hint: "Count each corner (vertex) of the shape.",
  };
}

function genCompareAngles(tier) {
  const gapMin = tier === "easy" ? 70 : tier === "medium" ? 40 : 20;
  let a = randInt(10, 170);
  let b = randInt(10, 170);
  while (Math.abs(a - b) < gapMin) b = randInt(10, 170);
  const aBigger = a > b;
  const baseRotationA = randInt(0, 340);
  const baseRotationB = randInt(0, 340);

  return {
    category: "compare",
    visualHTML: `<div class="angle-row">
      <div class="angle-card"><div class="angle-card-label">Angle A</div>${angleSVG(a, baseRotationA, 150)}</div>
      <div class="angle-card"><div class="angle-card-label">Angle B</div>${angleSVG(b, baseRotationB, 150)}</div>
    </div>`,
    promptText: "Which angle is bigger?",
    inputs: [{ id: "opt", label: "Bigger angle", type: "select", options: ["Angle A", "Angle B"] }],
    check: (v) => Number(v.opt) === (aBigger ? 0 : 1),
    correctSummary: () => (aBigger ? "Angle A" : "Angle B"),
    hint: "A bigger angle opens wider between its two rays.",
  };
}

const POOLS = {
  easy: [genClassifyAngle, genConstructAngleType, genTurn, genCountAngles, genCompareAngles],
  medium: [genClassifyAngle, genConstructAngleType, genTurn, genTurn, genCountAngles, genCompareAngles],
  hard: [genClassifyAngle, genConstructAngleType, genTurn, genConstructTurn, genCountAngles, genCountAngles, genCompareAngles],
};

// ---------- Rendering: stats & badges ----------

function renderStats() {
  document.getElementById("statLevel").textContent = stats.level;
  document.getElementById("statScore").textContent = stats.score;
  document.getElementById("statStreak").textContent = `${stats.streak} 🔥`;
  document.getElementById("statBest").textContent = stats.bestStreak;
  const pct = Math.min(100, Math.round((stats.xp / xpForLevel(stats.level)) * 100));
  document.getElementById("xpFill").style.width = pct + "%";
}

function renderBadges() {
  const row = document.getElementById("badgesRow");
  row.innerHTML = "";
  BADGE_DEFS.forEach((b) => {
    const el = document.createElement("div");
    const earned = stats.earnedBadges.includes(b.id);
    el.className = "badge" + (earned ? " earned" : "");
    el.textContent = (earned ? "🏆 " : "🔒 ") + b.label;
    row.appendChild(el);
  });
}

// ---------- Confetti ----------

function launchConfetti() {
  const layer = document.getElementById("confettiLayer");
  const colors = ["#f97316", "#facc15", "#22c55e", "#06b6d4", "#4f46e5", "#ec4899"];
  for (let i = 0; i < 60; i++) {
    const piece = document.createElement("div");
    piece.className = "confetti-piece";
    piece.style.left = Math.random() * 100 + "vw";
    piece.style.background = colors[randInt(0, colors.length - 1)];
    const duration = 1.8 + Math.random() * 1.4;
    piece.style.animationDuration = duration + "s";
    piece.style.animationDelay = Math.random() * 0.3 + "s";
    layer.appendChild(piece);
    setTimeout(() => piece.remove(), (duration + 0.5) * 1000);
  }
}

// ---------- UI: selectors ----------

function setupSelectors() {
  document.querySelectorAll("#difficultyGroup .pill").forEach((btn) => {
    btn.addEventListener("click", () => {
      const tier = btn.dataset.difficulty;
      const req = TIER_UNLOCK[tier];
      if (req && stats.level < req) {
        showFeedback(`Reach level ${req} to unlock this difficulty!`, false);
        shakeCard();
        return;
      }
      state.difficulty = tier;
      updateSelectorUI();
      newProblem();
    });
  });
  document.querySelectorAll("#modeGroup .pill").forEach((btn) => {
    btn.addEventListener("click", () => {
      state.mode = btn.dataset.mode;
      updateSelectorUI();
      renderHint();
    });
  });
  document.getElementById("newProblemBtn").addEventListener("click", newProblem);
}

function updateSelectorUI() {
  document.querySelectorAll("#difficultyGroup .pill").forEach((btn) => {
    const tier = btn.dataset.difficulty;
    if (!btn.dataset.label) btn.dataset.label = btn.textContent;
    const req = TIER_UNLOCK[tier];
    const locked = req && stats.level < req;
    btn.classList.toggle("locked", !!locked);
    btn.textContent = locked ? `🔒 ${btn.dataset.label} (Lv ${req})` : btn.dataset.label;
    btn.classList.toggle("active", tier === state.difficulty && !locked);
  });
  document.querySelectorAll("#modeGroup .pill").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.mode === state.mode);
  });
}

// ---------- Problem lifecycle ----------

function newProblem() {
  if (pendingAdvanceTimeout) {
    clearTimeout(pendingAdvanceTimeout);
    pendingAdvanceTimeout = null;
  }
  const pool = POOLS[state.difficulty];
  const gen = choice(pool);
  state.problem = gen(state.difficulty);
  document.getElementById("feedback").textContent = "";
  document.getElementById("feedback").className = "feedback";
  document.getElementById("visualArea").innerHTML = state.problem.visualHTML;
  renderHint();
  renderInputs();
}

function renderHint() {
  setHint(state.mode === "guided" ? state.problem.hint : "");
}

function setHint(msg) {
  document.getElementById("hintTip").innerHTML = msg;
}

function showFeedback(msg, good) {
  const el = document.getElementById("feedback");
  el.innerHTML = msg;
  el.className = "feedback " + (good ? "good" : "bad");
}

function shakeCard() {
  const card = document.getElementById("gameCard");
  card.classList.remove("shake");
  void card.offsetWidth;
  card.classList.add("shake");
}

function popCard() {
  const card = document.getElementById("gameCard");
  card.classList.remove("pop");
  void card.offsetWidth;
  card.classList.add("pop");
}

function renderInputs() {
  const controlRow = document.getElementById("controlRow");
  const p = state.problem;
  const promptHtml = `<div class="prompt-text">${p.promptText}</div>`;
  const inputsHtml = p.inputs
    .map((inp) => {
      if (inp.type === "select") {
        const opts = inp.options.map((o, i) => `<option value="${i}">${o}</option>`).join("");
        return `<label>${inp.label}<select id="inp_${inp.id}" class="num-input">${opts}</select></label>`;
      }
      if (inp.type === "range") {
        return `<div class="slider-row"><input type="range" id="inp_${inp.id}" class="angle-slider" min="${inp.min}" max="${inp.max}" step="${inp.step}" value="${inp.default}" /></div>`;
      }
      const step = inp.step ? ` step="${inp.step}"` : "";
      return `<label>${inp.label}<input type="number" id="inp_${inp.id}" class="num-input" min="${inp.min}" max="${inp.max}"${step} /></label>`;
    })
    .join("");
  controlRow.innerHTML = `${promptHtml}<div class="input-row">${inputsHtml}</div><button class="btn primary" id="submitBtn">Check Answer</button>`;

  p.inputs.forEach((inp) => {
    if (inp.type === "range" && p.livePreview) {
      const el = document.getElementById(`inp_${inp.id}`);
      el.addEventListener("input", () => {
        document.getElementById("visualArea").innerHTML = p.livePreview(Number(el.value));
      });
    }
  });

  const firstInput = controlRow.querySelector("input, select");
  if (firstInput) firstInput.focus();
  const submit = () => handleSubmit();
  document.getElementById("submitBtn").addEventListener("click", submit);
  controlRow.querySelectorAll("input").forEach((inp) =>
    inp.addEventListener("keydown", (e) => {
      if (e.key === "Enter") submit();
    })
  );
}

function handleSubmit() {
  const p = state.problem;
  const values = {};
  for (const inp of p.inputs) {
    values[inp.id] = document.getElementById(`inp_${inp.id}`).value;
  }
  if (Object.values(values).some((v) => v === "" || v === null)) {
    showFeedback("Fill in all the boxes.", false);
    shakeCard();
    return;
  }

  if (p.check(values)) {
    showFeedback(`Correct! ${p.correctSummary()}.`, true);
    popCard();
    addPoints(Math.round(DIFFICULTY[state.difficulty].points * (state.mode === "free" ? 1.15 : 1)));
    registerSolve(p.category);
    if (stats.streak > 0 && stats.streak % 5 === 0) launchConfetti();
    pendingAdvanceTimeout = setTimeout(newProblem, 1600);
  } else {
    showFeedback(`Not quite. ${p.correctSummary()}.`, false);
    shakeCard();
    registerMiss();
    pendingAdvanceTimeout = setTimeout(newProblem, 2200);
  }
}

// ---------- Init ----------

function init() {
  updateSelectorUI();
  setupSelectors();
  renderStats();
  renderBadges();
  newProblem();
}

init();
