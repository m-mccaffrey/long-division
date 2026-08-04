// ---------- Config ----------

const DIFFICULTY = {
  twoDigit: {
    label: "Two-Digit",
    min: 10,
    max: 99,
    regroupChance: 0.4,
    points: 10,
  },
  threeDigit: {
    label: "Three-Digit",
    min: 100,
    max: 999,
    regroupChance: 0.55,
    points: 20,
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
  { id: "three_digit_solve", label: "Three-Digit Champ", check: (s) => s.threeDigitSolved >= 1 },
  { id: "carry_solve", label: "Carry Captain", check: (s) => s.carrySolved >= 1 },
  { id: "borrow_solve", label: "Borrow Boss", check: (s) => s.borrowSolved >= 1 },
  { id: "free_solve", label: "Free Thinker", check: (s) => s.freeSolved >= 1 },
];

const STORAGE_KEY = "additionSubtractionQuestState";

// ---------- Persisted stats ----------

function loadStats() {
  const defaults = {
    score: 0,
    xp: 0,
    level: 1,
    streak: 0,
    bestStreak: 0,
    totalSolved: 0,
    threeDigitSolved: 0,
    carrySolved: 0,
    borrowSolved: 0,
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
  difficulty: "twoDigit",
  operation: "mixed",
  mode: "guided",
  problem: null, // {a, b, op, answer, length, regroup}
  guided: null,
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
  const p = state.problem;
  stats.totalSolved += 1;
  stats.streak += 1;
  if (stats.streak > stats.bestStreak) stats.bestStreak = stats.streak;
  if (state.difficulty === "threeDigit") stats.threeDigitSolved += 1;
  if (p.op === "add" && p.regroup) stats.carrySolved += 1;
  if (p.op === "sub" && p.regroup) stats.borrowSolved += 1;
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

function digitsOf(n, length) {
  return String(n).padStart(length, "0").split("").map(Number);
}

// Digit-by-digit generation so every column (not just ones) respects the
// no-regroup / must-regroup decision — a composite "everything but ones"
// comparison let uncontrolled carries/borrows sneak into 3-digit problems.
function genAddition(length, chance) {
  const wantCarry = Math.random() < chance;
  const ad = new Array(length);
  const bd = new Array(length);

  if (!wantCarry) {
    for (let i = 0; i < length; i++) {
      const isLeading = i === 0;
      ad[i] = isLeading ? randInt(1, 8) : randInt(0, 9);
      const bMax = 9 - ad[i];
      bd[i] = isLeading ? randInt(1, Math.max(1, bMax)) : randInt(0, bMax);
    }
  } else {
    const carryCol = randInt(0, length - 1);
    for (let i = 0; i < length; i++) {
      const isLeading = i === 0;
      if (i === carryCol) {
        ad[i] = randInt(1, 9);
        bd[i] = randInt(10 - ad[i], 9);
      } else {
        ad[i] = isLeading ? randInt(1, 9) : randInt(0, 9);
        bd[i] = isLeading ? randInt(1, 9) : randInt(0, 9);
      }
    }
  }
  return { a: Number(ad.join("")), b: Number(bd.join("")) };
}

function genSubtraction(length, chance) {
  const wantBorrow = length > 1 && Math.random() < chance;
  const bd = new Array(length);
  bd[0] = randInt(1, 9);
  for (let i = 1; i < length; i++) bd[i] = randInt(0, 9);

  const ad = new Array(length);
  const noBorrow = () => {
    for (let i = 0; i < length; i++) ad[i] = randInt(bd[i], 9);
  };

  if (!wantBorrow) {
    noBorrow();
  } else {
    let borrowCol = randInt(1, length - 1);
    if (bd[borrowCol] === 0) {
      let found = -1;
      for (let c = 1; c < length; c++) {
        if (bd[c] > 0) {
          found = c;
          break;
        }
      }
      borrowCol = found;
    }
    if (borrowCol === -1 || bd[0] >= 9) {
      noBorrow();
    } else {
      ad[0] = randInt(bd[0] + 1, 9);
      for (let i = 1; i < length; i++) {
        ad[i] = i === borrowCol ? randInt(0, bd[i] - 1) : randInt(0, 9);
      }
    }
  }
  return { a: Number(ad.join("")), b: Number(bd.join("")) };
}

function additionNeedsRegroup(a, b, length) {
  const ad = digitsOf(a, length);
  const bd = digitsOf(b, length);
  let carry = 0;
  for (let i = length - 1; i >= 0; i--) {
    const s = ad[i] + bd[i] + carry;
    if (s >= 10) return true;
    carry = Math.floor(s / 10);
  }
  return false;
}

function subtractionNeedsBorrow(a, b, length) {
  const ad = digitsOf(a, length).slice();
  const bd = digitsOf(b, length);
  let regrouped = false;
  function borrowFrom(j) {
    if (ad[j] === 0) {
      borrowFrom(j - 1);
      ad[j] = 10;
    }
    ad[j] -= 1;
  }
  for (let i = length - 1; i >= 0; i--) {
    if (ad[i] < bd[i]) {
      regrouped = true;
      borrowFrom(i - 1);
      ad[i] += 10;
    }
  }
  return regrouped;
}

function generateProblem(difficulty, operationSetting) {
  const cfg = DIFFICULTY[difficulty];
  const length = String(cfg.max).length;
  const op = operationSetting === "mixed" ? (Math.random() < 0.5 ? "add" : "sub") : operationSetting;

  let a, b;
  for (let attempt = 0; attempt < 20; attempt++) {
    if (op === "add") {
      ({ a, b } = genAddition(length, cfg.regroupChance));
    } else {
      ({ a, b } = genSubtraction(length, cfg.regroupChance));
    }
    if (a >= cfg.min && a <= cfg.max && b >= cfg.min && b <= cfg.max && (op === "add" || a >= b)) break;
  }
  a = Math.min(Math.max(a, cfg.min), cfg.max);
  b = Math.min(Math.max(b, cfg.min), cfg.max);
  if (op === "sub" && a < b) {
    const t = a;
    a = b;
    b = t;
  }

  const answer = op === "add" ? a + b : a - b;
  const regroup = op === "add" ? additionNeedsRegroup(a, b, length) : subtractionNeedsBorrow(a, b, length);
  return { a, b, op, answer, length, regroup };
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
  const colors = ["#f97316", "#facc15", "#22c55e", "#06b6d4", "#0d9488", "#ec4899"];
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

// ---------- UI: difficulty / operation / mode selectors ----------

function setupSelectors() {
  document.querySelectorAll("#difficultyGroup .pill").forEach((btn) => {
    btn.addEventListener("click", () => {
      state.difficulty = btn.dataset.difficulty;
      updateSelectorUI();
      newProblem();
    });
  });
  document.querySelectorAll("#operationGroup .pill").forEach((btn) => {
    btn.addEventListener("click", () => {
      state.operation = btn.dataset.operation;
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
  document.querySelectorAll("#operationGroup .pill").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.operation === state.operation);
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
  state.problem = generateProblem(state.difficulty, state.operation);
  document.getElementById("feedback").textContent = "";
  document.getElementById("feedback").className = "feedback";
  renderPanel(state.problem);
  if (state.mode === "guided") {
    startGuided();
  } else {
    startFree();
  }
}

function renderPanel(problem) {
  const totalCols = problem.length + 2;
  document.getElementById("asPanel").style.gridTemplateColumns = `repeat(${totalCols}, max-content)`;

  const carryRow = document.getElementById("asCarryRow");
  const topRow = document.getElementById("asTopRow");
  const bottomRow = document.getElementById("asBottomRow");
  const answerRow = document.getElementById("asAnswerRow");
  carryRow.innerHTML = "";
  topRow.innerHTML = "";
  bottomRow.innerHTML = "";
  answerRow.innerHTML = "";

  const topDigits = digitsOf(problem.a, problem.length);
  const bottomDigits = digitsOf(problem.b, problem.length);

  for (let c = 0; c < totalCols; c++) {
    const cell = document.createElement("div");
    cell.className = "as-cell as-carry";
    cell.style.gridColumn = String(c + 1);
    cell.id = `asCarry_${c}`;
    carryRow.appendChild(cell);
  }

  const topBlank0 = document.createElement("div");
  topBlank0.className = "as-cell";
  topBlank0.style.gridColumn = "1";
  topRow.appendChild(topBlank0);
  const topBlank1 = document.createElement("div");
  topBlank1.className = "as-cell";
  topBlank1.style.gridColumn = "2";
  topRow.appendChild(topBlank1);
  topDigits.forEach((d, i) => {
    const cell = document.createElement("div");
    cell.className = "as-cell as-top-digit";
    cell.style.gridColumn = String(i + 3);
    cell.id = `asTop_${i}`;
    cell.textContent = d;
    topRow.appendChild(cell);
  });

  const bottomBlank0 = document.createElement("div");
  bottomBlank0.className = "as-cell";
  bottomBlank0.style.gridColumn = "1";
  bottomRow.appendChild(bottomBlank0);
  const opCell = document.createElement("div");
  opCell.className = "as-cell as-op";
  opCell.style.gridColumn = "2";
  opCell.textContent = problem.op === "add" ? "+" : "−";
  bottomRow.appendChild(opCell);
  bottomDigits.forEach((d, i) => {
    const cell = document.createElement("div");
    cell.className = "as-cell as-bottom-digit";
    cell.style.gridColumn = String(i + 3);
    cell.textContent = d;
    bottomRow.appendChild(cell);
  });

  const overflowCell = document.createElement("div");
  overflowCell.className = "as-cell as-answer-digit";
  overflowCell.style.gridColumn = "1";
  overflowCell.id = "asAnswerOverflow";
  answerRow.appendChild(overflowCell);
  const answerBlank1 = document.createElement("div");
  answerBlank1.className = "as-cell";
  answerBlank1.style.gridColumn = "2";
  answerRow.appendChild(answerBlank1);
  for (let i = 0; i < problem.length; i++) {
    const cell = document.createElement("div");
    cell.className = "as-cell as-answer-digit as-blank";
    cell.style.gridColumn = String(i + 3);
    cell.id = `asAnswer_${i}`;
    answerRow.appendChild(cell);
  }
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

function placeNameForIndex(i, length) {
  const names = ["ones", "tens", "hundreds"];
  return names[length - 1 - i] || `10^${length - 1 - i}`;
}

function setAnswerDigit(i, val) {
  const el = document.getElementById(`asAnswer_${i}`);
  el.textContent = val;
  el.classList.remove("as-blank");
}

function setOverflowDigit(val) {
  const el = document.getElementById("asAnswerOverflow");
  el.textContent = val;
}

function setCarryMarker(colIdx, val) {
  const el = document.getElementById(`asCarry_${colIdx + 2}`);
  if (el) el.textContent = val;
}

function updateTopDigitDisplay(j) {
  const el = document.getElementById(`asTop_${j}`);
  if (!el) return;
  el.textContent = state.guided.topDigits[j];
  el.classList.remove("as-changed");
  void el.offsetWidth;
  el.classList.add("as-changed");
}

function revealFullAnswer(answer, length) {
  const s = String(answer);
  if (s.length > length) {
    setOverflowDigit(s[0]);
    s.slice(1).split("").forEach((ch, i) => setAnswerDigit(i, ch));
  } else {
    s.padStart(length, "0").split("").forEach((ch, i) => setAnswerDigit(i, ch));
  }
}

// ---------- Guided mode ----------

function startGuided() {
  const p = state.problem;
  state.guided = {
    topDigits: digitsOf(p.a, p.length),
    bottomDigits: digitsOf(p.b, p.length),
    colIndex: p.length - 1,
    carryIn: 0,
  };
  advanceColumn();
}

function performBorrowCascade(j) {
  const g = state.guided;
  if (g.topDigits[j] === 0) {
    performBorrowCascade(j - 1);
    g.topDigits[j] = 10;
  }
  g.topDigits[j] -= 1;
  updateTopDigitDisplay(j);
}

function advanceColumn() {
  const g = state.guided;
  const p = state.problem;
  if (g.colIndex < 0) {
    renderFinalControls();
    return;
  }
  if (p.op === "add") {
    renderAddColumnControls();
  } else {
    const i = g.colIndex;
    if (g.topDigits[i] < g.bottomDigits[i]) {
      performBorrowCascade(i - 1);
      g.topDigits[i] += 10;
      showFeedback("Borrowed 1 ten from the next column!", true);
    }
    renderSubColumnControls();
  }
}

function wireColInput(handler) {
  const input = document.getElementById("colInput");
  input.focus();
  const submit = () => handler();
  document.getElementById("colSubmitBtn").addEventListener("click", submit);
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") submit();
  });
}

function renderAddColumnControls() {
  const g = state.guided;
  const i = g.colIndex;
  const controlRow = document.getElementById("controlRow");
  const carryText = g.carryIn > 0 ? ` + ${g.carryIn}` : "";
  controlRow.innerHTML = `
    <label>${g.topDigits[i]} + ${g.bottomDigits[i]}${carryText} = <input type="number" id="colInput" class="num-input" /></label>
    <button class="btn primary" id="colSubmitBtn">Add</button>
  `;
  setHint(`Add the ${placeNameForIndex(i, state.problem.length)} column${g.carryIn > 0 ? " — don't forget the carried 1!" : "."}`);
  wireColInput(handleAddColumnSubmit);
}

function handleAddColumnSubmit() {
  const g = state.guided;
  const i = g.colIndex;
  const val = parseInt(document.getElementById("colInput").value, 10);
  const expected = g.topDigits[i] + g.bottomDigits[i] + g.carryIn;

  if (isNaN(val) || val !== expected) {
    showFeedback("Not quite — try that addition again.", false);
    shakeCard();
    return;
  }

  const resultDigit = expected % 10;
  const carryOut = Math.floor(expected / 10);
  setAnswerDigit(i, resultDigit);
  showFeedback("Correct!", true);
  addPoints(1);

  if (carryOut > 0 && i > 0) {
    setCarryMarker(i - 1, carryOut);
    g.carryIn = carryOut;
  } else if (carryOut > 0) {
    setOverflowDigit(carryOut);
    g.carryIn = 0;
  } else {
    g.carryIn = 0;
  }

  g.colIndex -= 1;
  advanceColumn();
}

function renderSubColumnControls() {
  const g = state.guided;
  const i = g.colIndex;
  const controlRow = document.getElementById("controlRow");
  controlRow.innerHTML = `
    <label>${g.topDigits[i]} &minus; ${g.bottomDigits[i]} = <input type="number" id="colInput" class="num-input" /></label>
    <button class="btn primary" id="colSubmitBtn">Subtract</button>
  `;
  setHint(`Subtract the ${placeNameForIndex(i, state.problem.length)} column.`);
  wireColInput(handleSubColumnSubmit);
}

function handleSubColumnSubmit() {
  const g = state.guided;
  const i = g.colIndex;
  const val = parseInt(document.getElementById("colInput").value, 10);
  const expected = g.topDigits[i] - g.bottomDigits[i];

  if (isNaN(val) || val !== expected) {
    showFeedback("Not quite — try that subtraction again.", false);
    shakeCard();
    return;
  }

  setAnswerDigit(i, expected);
  showFeedback("Correct!", true);
  addPoints(1);
  g.colIndex -= 1;
  advanceColumn();
}

function renderFinalControls() {
  const controlRow = document.getElementById("controlRow");
  controlRow.innerHTML = `
    <label>Full answer: <input type="number" id="finalAnswerInput" class="num-input" /></label>
    <button class="btn primary" id="submitFinalBtn">Check Answer</button>
  `;
  setHint("Read the digits you built, left to right, and type the whole answer.");
  const input = document.getElementById("finalAnswerInput");
  input.focus();
  const submit = () => handleFinalSubmit();
  document.getElementById("submitFinalBtn").addEventListener("click", submit);
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") submit();
  });
}

function handleFinalSubmit() {
  const p = state.problem;
  const val = parseInt(document.getElementById("finalAnswerInput").value, 10);
  const opSymbol = p.op === "add" ? "+" : "−";

  if (val === p.answer) {
    showFeedback(`Correct! ${p.a} ${opSymbol} ${p.b} = ${p.answer}.`, true);
    popCard();
    addPoints(DIFFICULTY[state.difficulty].points);
    registerSolve();
    if (stats.streak > 0 && stats.streak % 5 === 0) launchConfetti();
    pendingAdvanceTimeout = setTimeout(newProblem, 1600);
  } else {
    showFeedback(`Not quite. Correct answer: ${p.answer}.`, false);
    shakeCard();
    registerMiss();
    pendingAdvanceTimeout = setTimeout(newProblem, 2200);
  }
}

// ---------- Free mode ----------

function startFree() {
  const controlRow = document.getElementById("controlRow");
  controlRow.innerHTML = `
    <label>Answer: <input type="number" id="freeAnswerInput" class="num-input" /></label>
    <button class="btn primary" id="submitFreeBtn">Check Answer</button>
  `;
  setHint("Work it out on paper (or in your head), then enter your answer.");
  const input = document.getElementById("freeAnswerInput");
  input.focus();
  const submit = () => handleFreeSubmit();
  document.getElementById("submitFreeBtn").addEventListener("click", submit);
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") submit();
  });
}

function handleFreeSubmit() {
  const p = state.problem;
  const val = parseInt(document.getElementById("freeAnswerInput").value, 10);
  const opSymbol = p.op === "add" ? "+" : "−";

  if (val === p.answer) {
    showFeedback(`Correct! ${p.a} ${opSymbol} ${p.b} = ${p.answer}.`, true);
    revealFullAnswer(p.answer, p.length);
    popCard();
    addPoints(Math.round(DIFFICULTY[state.difficulty].points * 1.5));
    registerSolve();
    if (stats.streak > 0 && stats.streak % 5 === 0) launchConfetti();
    pendingAdvanceTimeout = setTimeout(newProblem, 1600);
  } else {
    showFeedback(`Not quite. Correct answer: ${p.answer}.`, false);
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
