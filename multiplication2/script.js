// ---------- Config ----------

const DIFFICULTY = {
  easy: { label: "Easy", points: 10 },
  medium: { label: "Medium", points: 25 },
  hard: { label: "Hard", points: 60 },
};

const BADGE_DEFS = [
  { id: "streak_5", label: "Streak x5", check: (s) => s.bestStreak >= 5 },
  { id: "streak_10", label: "Streak x10", check: (s) => s.bestStreak >= 10 },
  { id: "streak_20", label: "Unstoppable", check: (s) => s.bestStreak >= 20 },
  { id: "hard_solve", label: "Hard Mode Hero", check: (s) => s.hardSolved >= 1 },
  { id: "decimal_solve", label: "Decimal Dynamo", check: (s) => s.decimalSolved >= 1 },
  { id: "mixed_solve", label: "Fraction Master", check: (s) => s.mixedSolved >= 1 },
];

const STORAGE_KEY = "multiplicationQuestState";

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
    decimalSolved: 0,
    mixedSolved: 0,
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
  stats.score += basePoints;
  stats.xp += basePoints;
  while (stats.xp >= xpForLevel(stats.level)) {
    stats.xp -= xpForLevel(stats.level);
    stats.level += 1;
  }
  saveStats();
  renderStats();
}

function registerSolve(category) {
  stats.totalSolved += 1;
  stats.streak += 1;
  if (stats.streak > stats.bestStreak) stats.bestStreak = stats.streak;
  if (state.difficulty === "hard") stats.hardSolved += 1;
  if (category === "decimalWhole" || category === "decimalDecimal" || category === "mixedDecimal") stats.decimalSolved += 1;
  if (category === "mixedWhole" || category === "mixedMixed" || category === "mixedDecimal") stats.mixedSolved += 1;
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

// ---------- Mixed number helpers ----------

function mixedHTML(whole, num, den) {
  if (num === 0) return `<span>${whole}</span>`;
  const wholePart = whole > 0 ? `${whole} ` : "";
  return `${wholePart}<span class="frac"><span class="num">${num}</span><span class="den">${den}</span></span>`;
}

function randMixed(denOptions, maxWhole) {
  const den = choice(denOptions);
  const whole = randInt(0, maxWhole);
  const num = randInt(0, den - 1);
  return { whole, num, den };
}

function improper(mixed) {
  return mixed.whole * mixed.den + mixed.num;
}

function plainMixed(whole, num, den) {
  if (num === 0) return String(whole);
  return whole > 0 ? `${whole} ${num}/${den}` : `${num}/${den}`;
}

// ---------- Question generators ----------

function genWholeMultiply(tier) {
  const a = randInt(10, 999);
  const b = randInt(2, 99);
  const product = a * b;

  return {
    category: "wholeMultiply",
    visualHTML: `<div class="equation-display">${a} &times; ${b}</div>`,
    promptText: "What is the product?",
    inputs: [{ id: "p", label: "Product", type: "number", min: 0, max: 99999 }],
    check: (v) => Number(v.p) === product,
    correctSummary: () => String(product),
    hint: "Break the bigger number into parts (like hundreds, tens, ones) and multiply each part.",
  };
}

function genDecimalWhole(tier) {
  const aTenths = randInt(2, 99);
  const b = randInt(2, 20);
  const hundredths = aTenths * b * 10;
  const a = aTenths / 10;

  return {
    category: "decimalWhole",
    visualHTML: `<div class="equation-display">${a.toFixed(1)} &times; ${b}</div>`,
    promptText: "What is the product?",
    inputs: [{ id: "p", label: "Product", type: "number", min: 0, max: 5000, step: "0.01" }],
    check: (v) => Math.round(Number(v.p) * 100) === hundredths,
    correctSummary: () => (hundredths / 100).toFixed(2),
    hint: "Multiply as if there's no decimal point, then place the decimal point back in at the end.",
  };
}

function genDecimalDecimal(tier) {
  const maxTenths = tier === "hard" ? 199 : 99;
  const aTenths = randInt(2, maxTenths);
  const bTenths = randInt(2, maxTenths);
  const hundredths = aTenths * bTenths;
  const a = aTenths / 10;
  const b = bTenths / 10;

  return {
    category: "decimalDecimal",
    visualHTML: `<div class="equation-display">${a.toFixed(1)} &times; ${b.toFixed(1)}</div>`,
    promptText: "What is the product?",
    inputs: [{ id: "p", label: "Product", type: "number", min: 0, max: 5000, step: "0.01" }],
    check: (v) => Math.round(Number(v.p) * 100) === hundredths,
    correctSummary: () => (hundredths / 100).toFixed(2),
    hint: "Multiply the numbers as whole numbers first, then count the total decimal places to place the point.",
  };
}

function genMixedWhole(tier) {
  const a = randMixed([2, 3, 4, 5, 6, 8], 5);
  const b = randInt(2, 9);
  const improA = improper(a);
  const prodN = improA * b;
  const prodD = a.den;
  const ansWhole = Math.floor(prodN / prodD);
  const ansNum = prodN % prodD;

  return {
    category: "mixedWhole",
    visualHTML: `<div class="equation-display">${mixedHTML(a.whole, a.num, a.den)} &times; ${b}</div>`,
    promptText: `What is the product? (Give your answer over ${prodD}, unreduced.)`,
    inputs: [
      { id: "w", label: "Whole", type: "number", min: 0, max: 999 },
      { id: "n", label: "Numerator", type: "number", min: 0, max: prodD - 1 },
    ],
    check: (v) => Number(v.w) === ansWhole && Number(v.n) === ansNum,
    correctSummary: () => plainMixed(ansWhole, ansNum, prodD),
    hint: "Multiply the whole number by the numerator. The denominator stays the same.",
  };
}

function genMixedMixed(tier) {
  const a = randMixed([2, 3, 4, 5, 6, 8], 4);
  const b = randMixed([2, 3, 4, 5, 6, 8], 4);
  const improA = improper(a);
  const improB = improper(b);
  const prodN = improA * improB;
  const prodD = a.den * b.den;
  const ansWhole = Math.floor(prodN / prodD);
  const ansNum = prodN % prodD;

  return {
    category: "mixedMixed",
    visualHTML: `<div class="equation-display">${mixedHTML(a.whole, a.num, a.den)} &times; ${mixedHTML(b.whole, b.num, b.den)}</div>`,
    promptText: `What is the product? (Give your answer over ${prodD}, unreduced.)`,
    inputs: [
      { id: "w", label: "Whole", type: "number", min: 0, max: 999 },
      { id: "n", label: "Numerator", type: "number", min: 0, max: prodD - 1 },
    ],
    check: (v) => Number(v.w) === ansWhole && Number(v.n) === ansNum,
    correctSummary: () => plainMixed(ansWhole, ansNum, prodD),
    hint: "Turn each mixed number into an improper fraction first, then multiply the tops and multiply the bottoms.",
  };
}

function genMixedDecimal(tier) {
  const denOptions = [2, 5, 10];
  const a = randMixed(denOptions, 4);
  const bTenths = randInt(2, 99);
  const improA = improper(a);
  const scale = 10 / a.den;
  const hundredths = improA * bTenths * scale;
  const b = bTenths / 10;

  return {
    category: "mixedDecimal",
    visualHTML: `<div class="equation-display">${mixedHTML(a.whole, a.num, a.den)} &times; ${b.toFixed(1)}</div>`,
    promptText: "What is the product, as a decimal?",
    inputs: [{ id: "p", label: "Product", type: "number", min: 0, max: 5000, step: "0.01" }],
    check: (v) => Math.round(Number(v.p) * 100) === hundredths,
    correctSummary: () => (hundredths / 100).toFixed(2),
    hint: "Turn the mixed number into a decimal first (or an improper fraction), then multiply like normal decimals.",
  };
}

const POOLS = {
  easy: [genWholeMultiply],
  medium: [genDecimalWhole, genDecimalWhole, genDecimalDecimal],
  hard: [genMixedWhole, genMixedMixed, genMixedDecimal, genDecimalDecimal],
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
      state.difficulty = btn.dataset.difficulty;
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
    btn.classList.toggle("active", btn.dataset.difficulty === state.difficulty);
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
    addPoints(DIFFICULTY[state.difficulty].points);
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
