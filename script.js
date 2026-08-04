// ---------- Config ----------

const DIFFICULTY = {
  normal: {
    label: "Normal",
    dividendMin: 100,
    dividendMax: 999,
    divisorMin: 2,
    divisorMax: 12,
    remainderChance: 0.2,
    points: 10,
  },
  hard: {
    label: "Hard",
    dividendMin: 1000,
    dividendMax: 9999,
    divisorMin: 2,
    divisorMax: 30,
    remainderChance: 0.5,
    points: 20,
  },
  ludicrous: {
    label: "Ludicrous",
    dividendMin: 100000,
    dividendMax: 999999,
    divisorMin: 2,
    divisorMax: 99,
    remainderChance: null, // fully random / natural
    points: 40,
  },
};

const BADGE_DEFS = [
  { id: "first_solve", label: "First Steps", check: (s) => s.totalSolved >= 1 },
  { id: "solve_10", label: "10 Solved", check: (s) => s.totalSolved >= 10 },
  { id: "solve_25", label: "25 Solved", check: (s) => s.totalSolved >= 25 },
  { id: "solve_50", label: "50 Solved", check: (s) => s.totalSolved >= 50 },
  { id: "solve_100", label: "Century!", check: (s) => s.totalSolved >= 100 },
  { id: "streak_5", label: "Streak x5", check: (s) => s.bestStreak >= 5 },
  { id: "streak_10", label: "Streak x10", check: (s) => s.bestStreak >= 10 },
  { id: "streak_20", label: "Unstoppable", check: (s) => s.bestStreak >= 20 },
  { id: "hard_solve", label: "Hard Mode Hero", check: (s) => s.hardSolved >= 1 },
  { id: "ludicrous_solve", label: "Ludicrous!", check: (s) => s.ludicrousSolved >= 1 },
  { id: "free_solve", label: "Free Thinker", check: (s) => s.freeSolved >= 1 },
];

const STORAGE_KEY = "longDivisionQuestState";

// ---------- Persisted stats ----------

function loadStats() {
  const defaults = {
    score: 0,
    xp: 0,
    level: 1,
    streak: 0,
    bestStreak: 0,
    totalSolved: 0,
    hardSolved: 0,
    ludicrousSolved: 0,
    freeSolved: 0,
    earnedBadges: [],
  };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaults;
    return Object.assign(defaults, JSON.parse(raw));
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
  difficulty: "normal",
  mode: "guided",
  problem: null, // {dividend, divisor, quotient, remainder}
  guided: null, // guided-mode working state
};

// ---------- Helpers ----------

function randInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function xpForLevel(level) {
  return 100 * level;
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

function registerSolve() {
  stats.totalSolved += 1;
  stats.streak += 1;
  if (stats.streak > stats.bestStreak) stats.bestStreak = stats.streak;
  if (state.difficulty === "hard") stats.hardSolved += 1;
  if (state.difficulty === "ludicrous") stats.ludicrousSolved += 1;
  if (state.mode === "free") stats.freeSolved += 1;
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

// ---------- Problem generation ----------

function generateProblem(difficulty) {
  const cfg = DIFFICULTY[difficulty];
  let dividend, divisor;

  if (cfg.remainderChance === null) {
    // Ludicrous: truly random dividend & divisor
    dividend = randInt(cfg.dividendMin, cfg.dividendMax);
    divisor = randInt(cfg.divisorMin, cfg.divisorMax);
  } else {
    divisor = randInt(cfg.divisorMin, cfg.divisorMax);
    const wantRemainder = Math.random() < cfg.remainderChance;
    const minQ = Math.ceil(cfg.dividendMin / divisor);
    const maxQ = Math.floor(cfg.dividendMax / divisor);
    const lowQ = Math.min(minQ, maxQ);
    const highQ = Math.max(minQ, maxQ);
    let quotient = randInt(lowQ, highQ);
    let remainder = wantRemainder && divisor > 1 ? randInt(1, divisor - 1) : 0;
    dividend = quotient * divisor + remainder;
    if (dividend > cfg.dividendMax) {
      quotient -= 1;
      dividend = quotient * divisor + remainder;
    }
    if (dividend < cfg.dividendMin || quotient < 0) {
      // fallback: no remainder, clamp quotient
      quotient = Math.max(0, Math.floor(cfg.dividendMin / divisor));
      remainder = 0;
      dividend = quotient * divisor + remainder;
    }
  }

  const quotient = Math.floor(dividend / divisor);
  const remainder = dividend % divisor;
  return { dividend, divisor, quotient, remainder };
}

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
  const colors = ["#f97316", "#facc15", "#22c55e", "#06b6d4", "#7c3aed", "#ec4899"];
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

// ---------- UI: difficulty / mode selectors ----------

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
      newProblem();
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
  state.problem = generateProblem(state.difficulty);
  document.getElementById("feedback").textContent = "";
  document.getElementById("feedback").className = "feedback";
  renderBracket();
  if (state.mode === "guided") {
    startGuided();
  } else {
    startFree();
  }
}

function renderBracket() {
  const { dividend, divisor } = state.problem;
  document.getElementById("ldDivisor").textContent = divisor;
  document.getElementById("ldDividend").textContent = dividend.toLocaleString("en-US");
  document.getElementById("ldQuotientStack").innerHTML = '<div class="ld-quotient-term">&nbsp;</div>';
  document.getElementById("ldSteps").innerHTML = "";
}

function setHint(msg) {
  document.getElementById("hintTip").textContent = msg;
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

// ---------- Guided mode ----------

function startGuided() {
  const { dividend, divisor } = state.problem;
  state.guided = {
    currentRemainder: dividend,
    divisor,
    partials: [],
    pendingMultiplier: null,
    pendingProduct: null,
  };
  renderChooseControls();
}

function renderChooseControls() {
  const controlRow = document.getElementById("controlRow");
  controlRow.innerHTML = `
    <input type="number" id="easyNumberInput" class="num-input" placeholder="easy number" min="1" />
    <button class="btn primary" id="submitEasyNumberBtn">Choose</button>
  `;
  const g = state.guided;
  setHint(`Pick a number so that number × ${g.divisor} is no more than ${g.currentRemainder.toLocaleString("en-US")} — the highlighted amount below.`);
  const input = document.getElementById("easyNumberInput");
  input.focus();
  const submit = () => handleEasyNumberSubmit();
  document.getElementById("submitEasyNumberBtn").addEventListener("click", submit);
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") submit();
  });
}

function renderMultiplyControls() {
  const controlRow = document.getElementById("controlRow");
  const g = state.guided;
  controlRow.innerHTML = `
    <label>${g.pendingMultiplier} × ${g.divisor} = <input type="number" id="productInput" class="num-input" /></label>
    <button class="btn primary" id="submitProductBtn">Multiply</button>
  `;
  setHint(`Multiply ${g.pendingMultiplier} × ${g.divisor}.`);
  const input = document.getElementById("productInput");
  input.focus();
  const submit = () => handleProductSubmit();
  document.getElementById("submitProductBtn").addEventListener("click", submit);
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") submit();
  });
}

function renderSubtractControls() {
  const controlRow = document.getElementById("controlRow");
  const g = state.guided;
  controlRow.innerHTML = `
    <label>${g.currentRemainder.toLocaleString("en-US")} &minus; ${g.pendingProduct.toLocaleString("en-US")} = <input type="number" id="diffInput" class="num-input" /></label>
    <button class="btn primary" id="submitDiffBtn">Subtract</button>
  `;
  setHint(`Subtract ${g.pendingProduct.toLocaleString("en-US")} from ${g.currentRemainder.toLocaleString("en-US")}.`);
  const input = document.getElementById("diffInput");
  input.focus();
  const submit = () => handleDiffSubmit();
  document.getElementById("submitDiffBtn").addEventListener("click", submit);
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") submit();
  });
}

function renderFinalControls() {
  const controlRow = document.getElementById("controlRow");
  controlRow.innerHTML = `
    <label>Quotient: <input type="number" id="finalQuotientInput" class="num-input" /></label>
    <label>Remainder: <input type="number" id="finalRemainderInput" class="num-input" /></label>
    <button class="btn primary" id="submitFinalBtn">Check Answer</button>
  `;
  setHint("The highlighted amount is smaller than the divisor. Add up your numbers above the bracket for the quotient, and enter it with the remainder.");
  const qInput = document.getElementById("finalQuotientInput");
  const rInput = document.getElementById("finalRemainderInput");
  qInput.focus();
  const submit = () => handleFinalSubmit();
  document.getElementById("submitFinalBtn").addEventListener("click", submit);
  [qInput, rInput].forEach((inp) =>
    inp.addEventListener("keydown", (e) => {
      if (e.key === "Enter") submit();
    })
  );
}

function updateQuotientStack(partials, pendingVal) {
  const stack = document.getElementById("ldQuotientStack");
  stack.innerHTML = "";
  partials.forEach((p, i) => {
    const row = document.createElement("div");
    row.className = "ld-quotient-term";
    row.textContent = (i === 0 ? "" : "+ ") + p;
    stack.appendChild(row);
  });
  if (pendingVal !== undefined) {
    const row = document.createElement("div");
    row.className = "ld-quotient-term ld-pending";
    row.textContent = (partials.length === 0 ? "" : "+ ") + pendingVal;
    stack.appendChild(row);
  }
}

function addQuotientTotal(total) {
  const stack = document.getElementById("ldQuotientStack");
  const rule = document.createElement("div");
  rule.className = "ld-quotient-rule";
  stack.appendChild(rule);

  const totalRow = document.createElement("div");
  totalRow.className = "ld-quotient-total";
  totalRow.textContent = total.toLocaleString("en-US");
  stack.appendChild(totalRow);
}

function appendProductRow(product) {
  const steps = document.getElementById("ldSteps");
  const productRow = document.createElement("div");
  productRow.className = "ld-step-row ld-product";
  productRow.id = "pendingProductRow";
  productRow.textContent = `− ${product.toLocaleString("en-US")}`;
  steps.appendChild(productRow);
}

function appendDiffRow(newRemainder) {
  const steps = document.getElementById("ldSteps");
  steps.querySelectorAll(".ld-diff.ld-current").forEach((el) => el.classList.remove("ld-current"));

  document.getElementById("pendingProductRow")?.removeAttribute("id");

  const rule = document.createElement("div");
  rule.className = "ld-rule";
  steps.appendChild(rule);

  const diffRow = document.createElement("div");
  diffRow.className = "ld-step-row ld-diff ld-current";
  diffRow.textContent = newRemainder.toLocaleString("en-US");
  steps.appendChild(diffRow);
}

function handleEasyNumberSubmit() {
  const g = state.guided;
  const input = document.getElementById("easyNumberInput");
  const val = parseInt(input.value, 10);

  if (!val || val <= 0) {
    showFeedback("Enter a positive whole number.", false);
    shakeCard();
    return;
  }
  if (val * g.divisor > g.currentRemainder) {
    showFeedback(`Too big! That number × ${g.divisor} would be more than ${g.currentRemainder}. Try smaller.`, false);
    shakeCard();
    return;
  }

  g.pendingMultiplier = val;
  g.pendingProduct = val * g.divisor;
  updateQuotientStack(g.partials, val);

  showFeedback("Good choice!", true);
  addPoints(1);
  renderMultiplyControls();
}

function handleProductSubmit() {
  const g = state.guided;
  const input = document.getElementById("productInput");
  const val = parseInt(input.value, 10);

  if (val !== g.pendingProduct) {
    showFeedback("Not quite — try that multiplication again.", false);
    shakeCard();
    return;
  }

  appendProductRow(g.pendingProduct);

  showFeedback("Correct!", true);
  addPoints(1);
  renderSubtractControls();
}

function handleDiffSubmit() {
  const g = state.guided;
  const input = document.getElementById("diffInput");
  const val = parseInt(input.value, 10);
  const expected = g.currentRemainder - g.pendingProduct;

  if (val !== expected) {
    showFeedback("Not quite — try that subtraction again.", false);
    shakeCard();
    return;
  }

  g.partials.push(g.pendingMultiplier);
  appendDiffRow(val);
  updateQuotientStack(g.partials);
  g.currentRemainder = val;

  showFeedback("Nice! That works.", true);
  addPoints(1);

  if (val < g.divisor) {
    renderFinalControls();
  } else {
    renderChooseControls();
  }
}

function handleFinalSubmit() {
  const g = state.guided;
  const { quotient, remainder } = state.problem;
  const qVal = parseInt(document.getElementById("finalQuotientInput").value, 10);
  const rVal = parseInt(document.getElementById("finalRemainderInput").value, 10);

  if (qVal === quotient && rVal === remainder) {
    showFeedback(`Correct! ${state.problem.dividend.toLocaleString("en-US")} ÷ ${g.divisor} = ${quotient} remainder ${remainder}.`, true);
    addQuotientTotal(qVal);
    popCard();
    addPoints(DIFFICULTY[state.difficulty].points);
    registerSolve();
    if (stats.streak > 0 && stats.streak % 5 === 0) launchConfetti();
    pendingAdvanceTimeout = setTimeout(newProblem, 1600);
  } else {
    showFeedback(`Not quite. Correct answer: ${quotient} remainder ${remainder}.`, false);
    shakeCard();
    registerMiss();
    pendingAdvanceTimeout = setTimeout(newProblem, 2200);
  }
}

// ---------- Free mode ----------

function startFree() {
  const controlRow = document.getElementById("controlRow");
  controlRow.innerHTML = `
    <label>Quotient: <input type="number" id="freeQuotientInput" class="num-input" /></label>
    <label>Remainder: <input type="number" id="freeRemainderInput" class="num-input" /></label>
    <button class="btn primary" id="submitFreeBtn">Check Answer</button>
  `;
  setHint("Work it out on paper (or in your head), then enter your answer.");
  const qInput = document.getElementById("freeQuotientInput");
  const rInput = document.getElementById("freeRemainderInput");
  qInput.focus();
  const submit = () => handleFreeSubmit();
  document.getElementById("submitFreeBtn").addEventListener("click", submit);
  [qInput, rInput].forEach((inp) =>
    inp.addEventListener("keydown", (e) => {
      if (e.key === "Enter") submit();
    })
  );
}

function handleFreeSubmit() {
  const { dividend, divisor, quotient, remainder } = state.problem;
  const qVal = parseInt(document.getElementById("freeQuotientInput").value, 10);
  const rVal = parseInt(document.getElementById("freeRemainderInput").value, 10);

  if (qVal === quotient && rVal === remainder) {
    showFeedback(`Correct! ${dividend.toLocaleString("en-US")} ÷ ${divisor} = ${quotient} remainder ${remainder}.`, true);
    popCard();
    addPoints(Math.round(DIFFICULTY[state.difficulty].points * 1.5));
    registerSolve();
    if (stats.streak > 0 && stats.streak % 5 === 0) launchConfetti();
    pendingAdvanceTimeout = setTimeout(newProblem, 1600);
  } else {
    showFeedback(`Not quite. Correct answer: ${quotient} remainder ${remainder}.`, false);
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
