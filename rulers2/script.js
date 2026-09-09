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
  { id: "convert_solve", label: "Unit Converter", check: (s) => s.convertSolved >= 1 },
  { id: "perimeter_solve", label: "Perimeter Pro", check: (s) => s.perimeterSolved >= 1 },
];

const STORAGE_KEY = "rulers2QuestState";

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
    convertSolved: 0,
    perimeterSolved: 0,
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
  if (category === "convert") stats.convertSolved += 1;
  if (category === "perimeter") stats.perimeterSolved += 1;
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

// ---------- Fraction helpers ----------

function plainMixed(whole, num, den) {
  if (num === 0) return String(whole);
  return whole > 0 ? `${whole} ${num}/${den}` : `${num}/${den}`;
}

// ---------- Visual builders ----------

function rulerSVG(unit, totalUnits, ticksPerUnit, objStart, objEnd) {
  const pxPerUnit = unit === "in" ? 40 : 28;
  const width = totalUnits * pxPerUnit + 20;
  const height = 110;
  const rulerY = 70;
  const totalTicks = totalUnits * ticksPerUnit;
  let ticks = "";
  for (let t = 0; t <= totalTicks; t++) {
    const x = 10 + (t / ticksPerUnit) * pxPerUnit;
    const isMajor = t % ticksPerUnit === 0;
    const isHalf = ticksPerUnit % 2 === 0 && t % (ticksPerUnit / 2) === 0;
    const tickLen = isMajor ? 26 : isHalf ? 17 : 9;
    ticks += `<line x1="${x.toFixed(1)}" y1="${rulerY}" x2="${x.toFixed(1)}" y2="${(rulerY - tickLen).toFixed(1)}" stroke="#1f2937" stroke-width="${isMajor ? 2 : 1}"/>`;
    if (isMajor) {
      ticks += `<text x="${x.toFixed(1)}" y="${rulerY + 16}" text-anchor="middle" font-size="11" fill="#1f2937">${t / ticksPerUnit}</text>`;
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
    <rect x="5" y="${rulerY - 30}" width="${width - 10}" height="34" rx="4" fill="#e2e8f0" stroke="#1f2937" stroke-width="2"/>
    ${bar}
    ${ticks}
  </svg></div>`;
}

function rectDiagramSVG(wLabel, hLabel) {
  const boxW = 200,
    boxH = 130;
  return `<div class="rect-wrap"><svg viewBox="0 0 260 180" width="260" height="180">
    <rect x="30" y="20" width="${boxW}" height="${boxH}" fill="none" stroke="#1f2937" stroke-width="3"/>
    <text x="${30 + boxW / 2}" y="14" text-anchor="middle" font-size="16" font-weight="700" fill="#1f2937">${wLabel}</text>
    <text x="16" y="${20 + boxH / 2}" text-anchor="middle" font-size="16" font-weight="700" fill="#1f2937" transform="rotate(-90 16 ${20 + boxH / 2})">${hLabel}</text>
  </svg></div>`;
}

// ---------- Question generators ----------

function genReadRulerEighths(tier) {
  const denom = tier === "easy" ? 4 : 8;
  const totalInches = 12;
  const startTicks = randInt(0, (totalInches - 4) * denom);
  const maxLenTicks = Math.min(6 * denom, totalInches * denom - startTicks);
  const lengthTicks = randInt(1, maxLenTicks);
  const endTicks = startTicks + lengthTicks;
  const lengthWhole = Math.floor(lengthTicks / denom);
  const lengthNum = lengthTicks % denom;

  return {
    category: "read",
    visualHTML: rulerSVG("in", totalInches, denom, startTicks / denom, endTicks / denom),
    promptText: `How long is the red bar (in inches, over ${denom})?`,
    inputs: [
      { id: "w", label: "Whole", type: "number", min: 0, max: totalInches },
      { id: "n", label: "Numerator", type: "number", min: 0, max: denom - 1 },
    ],
    check: (v) => Number(v.w) === lengthWhole && Number(v.n) === lengthNum,
    correctSummary: () => `${plainMixed(lengthWhole, lengthNum, denom)} in`,
    hint: "The bar doesn't start at 0. Count the small marks from where the bar starts to where it ends.",
  };
}

const CONV_POOLS = {
  easy: [
    { from: "ft", to: "in", factor: 12 },
    { from: "in", to: "ft", factor: 12, inverse: true },
    { from: "m", to: "cm", factor: 100 },
    { from: "cm", to: "m", factor: 100, inverse: true },
  ],
  medium: [
    { from: "yd", to: "ft", factor: 3 },
    { from: "ft", to: "yd", factor: 3, inverse: true },
    { from: "cm", to: "mm", factor: 10 },
    { from: "mm", to: "cm", factor: 10, inverse: true },
    { from: "km", to: "m", factor: 1000 },
    { from: "m", to: "km", factor: 1000, inverse: true },
  ],
  hard: [
    { from: "yd", to: "in", factor: 36 },
    { from: "in", to: "yd", factor: 36, inverse: true },
    { from: "m", to: "mm", factor: 1000 },
    { from: "mm", to: "m", factor: 1000, inverse: true },
    { from: "km", to: "m", factor: 1000 },
    { from: "ft", to: "in", factor: 12 },
  ],
};

function genUnitConversion(tier) {
  const conv = choice(CONV_POOLS[tier]);
  let value, result;
  if (conv.inverse) {
    const multiplier = randInt(2, tier === "hard" ? 40 : 20);
    value = conv.factor * multiplier;
    result = multiplier;
  } else {
    value = randInt(2, tier === "hard" ? 40 : 20);
    result = value * conv.factor;
  }

  return {
    category: "convert",
    visualHTML: `<div class="equation-display">${value} ${conv.from} = ? ${conv.to}</div>`,
    promptText: `Convert ${value} ${conv.from} to ${conv.to}.`,
    inputs: [{ id: "r", label: conv.to, type: "number", min: 0, max: 100000 }],
    check: (v) => Number(v.r) === result,
    correctSummary: () => `${result} ${conv.to}`,
    hint: conv.inverse
      ? `There are ${conv.factor} ${conv.from} in 1 ${conv.to}, so divide by ${conv.factor}.`
      : `There are ${conv.factor} ${conv.to} in 1 ${conv.from}, so multiply by ${conv.factor}.`,
  };
}

function genMixedUnitArith(tier) {
  const range = tier === "easy" ? [1, 5] : tier === "medium" ? [1, 10] : [2, 15];
  const op = choice(["add", "subtract"]);
  let f1 = randInt(range[0], range[1]);
  let i1 = randInt(0, 11);
  let f2 = randInt(range[0], range[1]);
  let i2 = randInt(0, 11);
  let totalIn1 = f1 * 12 + i1;
  let totalIn2 = f2 * 12 + i2;
  let resultIn;

  if (op === "add") {
    resultIn = totalIn1 + totalIn2;
  } else {
    if (totalIn1 < totalIn2) [totalIn1, totalIn2] = [totalIn2, totalIn1];
    resultIn = totalIn1 - totalIn2;
    f1 = Math.floor(totalIn1 / 12);
    i1 = totalIn1 % 12;
    f2 = Math.floor(totalIn2 / 12);
    i2 = totalIn2 % 12;
  }
  const resultFt = Math.floor(resultIn / 12);
  const resultInRem = resultIn % 12;

  return {
    category: "mixedArith",
    visualHTML: `<div class="equation-display">${f1} ft ${i1} in ${op === "add" ? "+" : "&minus;"} ${f2} ft ${i2} in</div>`,
    promptText: "What is the result?",
    inputs: [
      { id: "f", label: "Feet", type: "number", min: 0, max: 999 },
      { id: "i", label: "Inches", type: "number", min: 0, max: 11 },
    ],
    check: (v) => Number(v.f) === resultFt && Number(v.i) === resultInRem,
    correctSummary: () => `${resultFt} ft ${resultInRem} in`,
    hint:
      op === "add"
        ? "Add the feet together and the inches together. If the inches reach 12 or more, carry a foot."
        : "Subtract the inches and feet separately. If you don't have enough inches, borrow a foot (12 inches).",
  };
}

function genPerimeterRect(tier) {
  const w = randInt(tier === "easy" ? 2 : 5, tier === "easy" ? 15 : 30);
  const h = randInt(tier === "easy" ? 2 : 5, tier === "easy" ? 15 : 30);
  const unit = choice(["ft", "cm", "in", "m"]);
  const perimeter = 2 * (w + h);

  return {
    category: "perimeter",
    visualHTML: rectDiagramSVG(`${w} ${unit}`, `${h} ${unit}`),
    promptText: "What is the perimeter of the rectangle?",
    inputs: [{ id: "p", label: `Perimeter (${unit})`, type: "number", min: 0, max: 1000 }],
    check: (v) => Number(v.p) === perimeter,
    correctSummary: () => `${perimeter} ${unit}`,
    hint: "Perimeter is the distance all the way around: add all four sides, or use 2 × (length + width).",
  };
}

function genMissingSide(tier) {
  const w = randInt(3, 25);
  const h = randInt(3, 25);
  const perimeter = 2 * (w + h);
  const unit = choice(["ft", "cm", "in", "m"]);
  const hideWidth = Math.random() < 0.5;

  return {
    category: "perimeter",
    visualHTML: rectDiagramSVG(hideWidth ? "?" : `${w} ${unit}`, hideWidth ? `${h} ${unit}` : "?"),
    promptText: `The perimeter is ${perimeter} ${unit}. What is the missing side?`,
    inputs: [{ id: "s", label: `Missing side (${unit})`, type: "number", min: 0, max: 500 }],
    check: (v) => Number(v.s) === (hideWidth ? w : h),
    correctSummary: () => `${hideWidth ? w : h} ${unit}`,
    hint: "Perimeter = 2 × (length + width). Divide the perimeter by 2, then subtract the known side.",
  };
}

function genPolygonPerimeter(tier) {
  const unit = choice(["ft", "cm", "in", "m"]);
  const numSides = randInt(5, 6);
  const sides = [];
  for (let i = 0; i < numSides; i++) sides.push(randInt(2, 20));
  const perimeter = sides.reduce((a, b) => a + b, 0);

  return {
    category: "perimeter",
    visualHTML: `<div class="phrase-display">A shape has sides: ${sides.join(", ")} (${unit})</div>`,
    promptText: "What is the perimeter (the total distance around the shape)?",
    inputs: [{ id: "p", label: `Perimeter (${unit})`, type: "number", min: 0, max: 2000 }],
    check: (v) => Number(v.p) === perimeter,
    correctSummary: () => `${perimeter} ${unit}`,
    hint: "Add up the length of every side.",
  };
}

function genLeftoverLength(tier) {
  const unit = choice(["ft", "in", "cm", "m"]);
  const pieceLen = randInt(2, 8);
  const numPieces = randInt(2, 5);
  const usedLen = pieceLen * numPieces;
  const leftover = randInt(1, 15);
  const totalLen = usedLen + leftover;

  return {
    category: "wordProblem",
    visualHTML: `<div class="phrase-display">A board is ${totalLen} ${unit} long. You cut ${numPieces} pieces that are ${pieceLen} ${unit} each.</div>`,
    promptText: "How much of the board is left over?",
    inputs: [{ id: "l", label: `Leftover (${unit})`, type: "number", min: 0, max: 200 }],
    check: (v) => Number(v.l) === leftover,
    correctSummary: () => `${leftover} ${unit}`,
    hint: `First find the total length used: ${numPieces} × ${pieceLen}. Then subtract that from the total board length.`,
  };
}

const POOLS = {
  easy: [genReadRulerEighths, genUnitConversion, genMixedUnitArith, genPerimeterRect],
  medium: [genReadRulerEighths, genUnitConversion, genMixedUnitArith, genPerimeterRect, genMissingSide],
  hard: [genReadRulerEighths, genUnitConversion, genMixedUnitArith, genPolygonPerimeter, genMissingSide, genLeftoverLength],
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
