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
  { id: "missing_factor_solve", label: "Fact Finder", check: (s) => s.missingFactorSolved >= 1 },
  { id: "word_solve", label: "Story Solver", check: (s) => s.wordSolved >= 1 },
];

const STORAGE_KEY = "multiplicationQuestState";

const TIER_UNLOCK = { medium: 3, hard: 5 };

const LEGACY_KEYS = [
  { key: "multiplication1QuestState", xpBase: 130 },
  { key: "multiplication2QuestState", xpBase: 175 },
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
    missingFactorSolved: 0,
    wordSolved: 0,
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
  if (category === "missingFactor") stats.missingFactorSolved += 1;
  if (category === "word") stats.wordSolved += 1;
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

// ---------- Question generators ----------

function factorRange(tier) {
  if (tier === "easy") return { aMin: 1, aMax: 9, bMin: 1, bMax: 9 };
  if (tier === "medium") return { aMin: 1, aMax: 9, bMin: 10, bMax: 99 };
  return { aMin: 10, aMax: 99, bMin: 10, bMax: 99 };
}

function genMultiply(tier) {
  const r = factorRange(tier);
  let a = randInt(r.aMin, r.aMax);
  let b = randInt(r.bMin, r.bMax);
  if (Math.random() < 0.5 && r.aMin === r.bMin && r.aMax === r.bMax) {
    // occasionally swap order for variety when ranges match
    [a, b] = [b, a];
  }
  const product = a * b;

  return {
    category: "multiply",
    visualHTML: `<div class="equation-display">${a} &times; ${b}</div>`,
    promptText: "What is the product?",
    inputs: [{ id: "p", label: "Product", type: "number", min: 0, max: 9999 }],
    check: (v) => Number(v.p) === product,
    correctSummary: () => String(product),
    hint: "Break it into smaller facts you know, then add the pieces together.",
  };
}

function genMissingFactor(tier) {
  const r = factorRange(tier);
  const a = randInt(r.aMin, r.aMax);
  const b = randInt(r.bMin, r.bMax);
  const product = a * b;
  const hideA = Math.random() < 0.5;

  return {
    category: "missingFactor",
    visualHTML: `<div class="equation-display">${hideA ? "?" : a} &times; ${hideA ? b : "?"} = ${product}</div>`,
    promptText: "What number is missing?",
    inputs: [{ id: "f", label: "Missing factor", type: "number", min: 0, max: 99 }],
    check: (v) => Number(v.f) === (hideA ? a : b),
    correctSummary: () => String(hideA ? a : b),
    hint: "Think: what times the known number gives the total? Try dividing to check.",
  };
}

function genWordGroups(tier) {
  const r = factorRange(tier);
  const groups = randInt(r.aMin, r.aMax);
  const perGroup = randInt(r.bMin, r.bMax);
  const total = groups * perGroup;

  return {
    category: "word",
    visualHTML: `<div class="phrase-display">There are ${groups} groups of ${perGroup}.</div>`,
    promptText: "How many are there in all?",
    inputs: [{ id: "t", label: "Total", type: "number", min: 0, max: 9999 }],
    check: (v) => Number(v.t) === total,
    correctSummary: () => String(total),
    hint: `${groups} groups of ${perGroup} means ${groups} &times; ${perGroup}.`,
  };
}

const POOLS = {
  easy: [genMultiply, genMultiply, genMultiply, genMissingFactor, genWordGroups],
  medium: [genMultiply, genMultiply, genMultiply, genMissingFactor, genMissingFactor, genWordGroups],
  hard: [genMultiply, genMultiply, genMissingFactor, genMissingFactor, genWordGroups],
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
  el.textContent = msg;
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
