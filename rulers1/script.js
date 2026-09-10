// ---------- Config ----------

const DIFFICULTY = {
  easy: { label: "Easy", points: 8 },
  hard: { label: "Hard", points: 30 },
};

const BADGE_DEFS = [
  { id: "streak_5", label: "Streak x5", check: (s) => s.bestStreak >= 5 },
  { id: "streak_10", label: "Streak x10", check: (s) => s.bestStreak >= 10 },
  { id: "streak_20", label: "Unstoppable", check: (s) => s.bestStreak >= 20 },
  { id: "hard_solve", label: "Hard Mode Hero", check: (s) => s.hardSolved >= 1 },
  { id: "read_solve", label: "Ruler Reader", check: (s) => s.readSolved >= 1 },
  { id: "compare_solve", label: "Length Detective", check: (s) => s.compareSolved >= 1 },
];

const STORAGE_KEY = "rulersQuestState";

const TIER_UNLOCK = { hard: 3 };

const LEGACY_KEYS = [
  { key: "rulers1QuestState", xpBase: 130 },
  { key: "rulers2QuestState", xpBase: 175 },
];

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
    readSolved: 0,
    compareSolved: 0,
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
  if (category === "read") stats.readSolved += 1;
  if (category === "compare") stats.compareSolved += 1;
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

// ---------- Ruler visual ----------

function rulerSVG(unit, totalUnits, ticksPerUnit, objStart, objEnd) {
  const pxPerUnit = unit === "in" ? 44 : 30;
  const width = totalUnits * pxPerUnit + 20;
  const height = 110;
  const rulerY = 70;
  const totalTicks = totalUnits * ticksPerUnit;
  let ticks = "";
  for (let t = 0; t <= totalTicks; t++) {
    const x = 10 + (t / ticksPerUnit) * pxPerUnit;
    const isMajor = t % ticksPerUnit === 0;
    const tickLen = isMajor ? 26 : 11;
    ticks += `<line x1="${x.toFixed(1)}" y1="${rulerY}" x2="${x.toFixed(1)}" y2="${(rulerY - tickLen).toFixed(1)}" stroke="#1f2937" stroke-width="${isMajor ? 2 : 1}"/>`;
    if (isMajor) {
      ticks += `<text x="${x.toFixed(1)}" y="${rulerY + 16}" text-anchor="middle" font-size="12" fill="#1f2937">${t / ticksPerUnit}</text>`;
    }
  }
  const barY = 30;
  const x1 = 10 + objStart * pxPerUnit;
  const x2 = 10 + objEnd * pxPerUnit;
  const bar = `
    <line x1="${x1.toFixed(1)}" y1="${barY}" x2="${x2.toFixed(1)}" y2="${barY}" stroke="#dc2626" stroke-width="5" stroke-linecap="round"/>
    <line x1="${x1.toFixed(1)}" y1="${barY - 10}" x2="${x1.toFixed(1)}" y2="${barY + 10}" stroke="#dc2626" stroke-width="3"/>
    <line x1="${x2.toFixed(1)}" y1="${barY - 10}" x2="${x2.toFixed(1)}" y2="${barY + 10}" stroke="#dc2626" stroke-width="3"/>
  `;
  return `<div class="ruler-wrap"><svg viewBox="0 0 ${width} ${height}" width="${width}" height="${height}">
    <rect x="5" y="${rulerY - 30}" width="${width - 10}" height="34" rx="4" fill="#fef3c7" stroke="#1f2937" stroke-width="2"/>
    ${bar}
    ${ticks}
  </svg></div>`;
}

// ---------- Question generators ----------

function genReadRulerInches(tier) {
  const totalInches = tier === "easy" ? 8 : 10;
  const start = tier === "hard" ? randInt(1, totalInches - 3) : 0;
  const maxLen = Math.min(6, totalInches - start);
  const length = randInt(1, maxLen);
  const end = start + length;

  return {
    category: "read",
    visualHTML: rulerSVG("in", totalInches, 1, start, end),
    promptText: "How long is the red bar (in inches)?",
    inputs: [{ id: "l", label: "Length (in)", type: "number", min: 0, max: totalInches }],
    check: (v) => Number(v.l) === length,
    correctSummary: () => `${length} in`,
    hint: start === 0 ? "Count the tick marks from 0 to the end of the bar." : "The bar doesn't start at 0 — count how many whole inches it spans, from its start to its end.",
  };
}

function genReadRulerCM(tier) {
  const totalCM = tier === "easy" ? 15 : 20;
  const start = tier === "hard" ? randInt(1, totalCM - 4) : 0;
  const maxLen = Math.min(12, totalCM - start);
  const length = randInt(1, maxLen);
  const end = start + length;

  return {
    category: "read",
    visualHTML: rulerSVG("cm", totalCM, 1, start, end),
    promptText: "How long is the red bar (in cm)?",
    inputs: [{ id: "c", label: "Length (cm)", type: "number", min: 0, max: totalCM }],
    check: (v) => Number(v.c) === length,
    correctSummary: () => `${length} cm`,
    hint: start === 0 ? "Count the whole centimeter marks." : "The bar doesn't start at 0 — count how many whole centimeters it spans.",
  };
}

function genLengthArith(tier) {
  const unit = choice(["in", "cm", "ft"]);
  const op = choice(["add", "subtract"]);
  const range = tier === "easy" ? [1, 12] : [10, 60];
  let a = randInt(range[0], range[1]);
  let b = randInt(range[0], range[1]);
  let result, phrase;
  if (op === "add") {
    result = a + b;
    phrase = `One piece is ${a} ${unit} long. Another piece is ${b} ${unit} long. They are joined end to end.`;
  } else {
    if (b > a) [a, b] = [b, a];
    result = a - b;
    phrase = `A piece is ${a} ${unit} long. You cut off ${b} ${unit}.`;
  }

  return {
    category: "arith",
    visualHTML: `<div class="phrase-display">${phrase}</div>`,
    promptText: op === "add" ? "What is the total length now?" : "How much is left?",
    inputs: [{ id: "r", label: `Length (${unit})`, type: "number", min: 0, max: 200 }],
    check: (v) => Number(v.r) === result,
    correctSummary: () => `${result} ${unit}`,
    hint: op === "add" ? "Add the two lengths together." : "Subtract the amount cut off from the original length.",
  };
}

function genCompareLengths(tier) {
  const unit = choice(["in", "cm", "ft"]);
  const range = tier === "easy" ? [2, 15] : [10, 50];
  let a = randInt(range[0], range[1]);
  let b = randInt(range[0], range[1]);
  while (a === b) b = randInt(range[0], range[1]);
  const aLonger = a > b;
  const diff = Math.abs(a - b);

  const inputs = [{ id: "opt", label: "Longer board", type: "select", options: ["Board A", "Board B"] }];
  if (tier === "hard") {
    inputs.push({ id: "d", label: `By how much (${unit})`, type: "number", min: 0, max: 100 });
  }

  return {
    category: "compare",
    visualHTML: `<div class="length-row">
      <div class="length-card"><div class="length-label">Board A</div>${a} ${unit}</div>
      <div class="length-card"><div class="length-label">Board B</div>${b} ${unit}</div>
    </div>`,
    promptText: tier === "easy" ? "Which board is longer?" : "Which board is longer, and by how much?",
    inputs,
    check: (v) => Number(v.opt) === (aLonger ? 0 : 1) && (tier === "easy" || Number(v.d) === diff),
    correctSummary: () => (tier === "easy" ? (aLonger ? "Board A" : "Board B") : `${aLonger ? "Board A" : "Board B"}, by ${diff} ${unit}`),
    hint: "Compare the two lengths. The bigger number is the longer board. Subtract to find the difference.",
  };
}

const POOLS = {
  easy: [genReadRulerInches, genReadRulerInches, genReadRulerCM, genLengthArith, genCompareLengths],
  hard: [genReadRulerInches, genReadRulerInches, genReadRulerCM, genLengthArith, genLengthArith, genCompareLengths],
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
      const step = inp.step ? ` step="${inp.step}"` : "";
      return `<label>${inp.label}<input type="number" id="inp_${inp.id}" class="num-input" min="${inp.min}" max="${inp.max}"${step} /></label>`;
    })
    .join("");
  controlRow.innerHTML = `${promptHtml}<div class="input-row">${inputsHtml}</div><button class="btn primary" id="submitBtn">Check Answer</button>`;

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
    showFeedback(`Correct! The answer is ${p.correctSummary()}.`, true);
    popCard();
    addPoints(Math.round(DIFFICULTY[state.difficulty].points * (state.mode === "free" ? 1.15 : 1)));
    registerSolve(p.category);
    if (stats.streak > 0 && stats.streak % 5 === 0) launchConfetti();
    pendingAdvanceTimeout = setTimeout(newProblem, 1600);
  } else {
    showFeedback(`Not quite. The answer was ${p.correctSummary()}.`, false);
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
