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
  { id: "measure_solve", label: "Protractor Pro", check: (s) => s.measureSolved >= 1 },
  { id: "sum_solve", label: "Angle Adder", check: (s) => s.sumSolved >= 1 },
];

const STORAGE_KEY = "angles2QuestState";

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
    measureSolved: 0,
    sumSolved: 0,
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
  if (category === "measure" || category === "classify") stats.measureSolved += 1;
  if (category === "addition" || category === "sum") stats.sumSolved += 1;
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

function angleSVG(measureDeg, baseRotation, size) {
  size = size || 220;
  const cx = size / 2;
  const cy = size * 0.68;
  const armLen = size * 0.4;
  const rad = (deg) => (deg * Math.PI) / 180;
  function pointAt(angleDeg, r) {
    return { x: cx + r * Math.cos(rad(angleDeg)), y: cy - r * Math.sin(rad(angleDeg)) };
  }
  const p1 = pointAt(baseRotation, armLen);
  const p2 = pointAt(baseRotation + measureDeg, armLen);
  const arcR = size * 0.16;
  const a1 = pointAt(baseRotation, arcR);
  const a2 = pointAt(baseRotation + measureDeg, arcR);
  const largeArc = measureDeg > 180 ? 1 : 0;
  return `<div class="angle-wrap"><svg viewBox="0 0 ${size} ${size}" width="${size}" height="${size}">
    <line x1="${cx}" y1="${cy}" x2="${p1.x.toFixed(1)}" y2="${p1.y.toFixed(1)}" stroke="#1f2937" stroke-width="5" stroke-linecap="round"/>
    <line x1="${cx}" y1="${cy}" x2="${p2.x.toFixed(1)}" y2="${p2.y.toFixed(1)}" stroke="#1f2937" stroke-width="5" stroke-linecap="round"/>
    <path d="M ${a1.x.toFixed(1)} ${a1.y.toFixed(1)} A ${arcR} ${arcR} 0 ${largeArc} 0 ${a2.x.toFixed(1)} ${a2.y.toFixed(1)}" fill="none" stroke="#065f46" stroke-width="3"/>
    <circle cx="${cx}" cy="${cy}" r="5" fill="#1f2937"/>
  </svg></div>`;
}

function protractorSVG(measureDeg) {
  const cx = 150,
    cy = 150,
    r = 120;
  function pt(angleDeg, radius) {
    const rad = (angleDeg * Math.PI) / 180;
    return { x: cx + radius * Math.cos(rad), y: cy - radius * Math.sin(rad) };
  }
  let ticks = "";
  for (let d = 0; d <= 180; d += 10) {
    const isMajor = d % 30 === 0;
    const p1 = pt(d, r);
    const p2 = pt(d, r - (isMajor ? 14 : 8));
    ticks += `<line x1="${p1.x.toFixed(1)}" y1="${p1.y.toFixed(1)}" x2="${p2.x.toFixed(1)}" y2="${p2.y.toFixed(1)}" stroke="#1f2937" stroke-width="${isMajor ? 2 : 1}"/>`;
    if (isMajor) {
      const lp = pt(d, r + 16);
      ticks += `<text x="${lp.x.toFixed(1)}" y="${lp.y.toFixed(1)}" font-size="11" text-anchor="middle" fill="#1f2937">${d}</text>`;
    }
  }
  const rayEnd = pt(measureDeg, r * 0.85);
  const baseEnd = pt(0, r * 0.85);
  return `<div class="protractor-wrap"><svg viewBox="0 0 300 175" width="300" height="175">
    <path d="M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}" fill="#fef9c3" stroke="#1f2937" stroke-width="2"/>
    <line x1="${cx - r}" y1="${cy}" x2="${cx + r}" y2="${cy}" stroke="#1f2937" stroke-width="1"/>
    ${ticks}
    <line x1="${cx}" y1="${cy}" x2="${baseEnd.x.toFixed(1)}" y2="${baseEnd.y.toFixed(1)}" stroke="#dc2626" stroke-width="4"/>
    <line x1="${cx}" y1="${cy}" x2="${rayEnd.x.toFixed(1)}" y2="${rayEnd.y.toFixed(1)}" stroke="#dc2626" stroke-width="4"/>
    <circle cx="${cx}" cy="${cy}" r="4" fill="#1f2937"/>
  </svg></div>`;
}

function clockSVG(hour, minute) {
  const cx = 100,
    cy = 100,
    r = 90;
  const hourAngle = ((hour % 12) + minute / 60) * 30;
  const minuteAngle = minute * 6;
  let ticks = "";
  for (let i = 0; i < 12; i++) {
    const angle = i * 30;
    const rad = ((angle - 90) * Math.PI) / 180;
    const x1 = cx + (r - 8) * Math.cos(rad),
      y1 = cy + (r - 8) * Math.sin(rad);
    const x2 = cx + r * Math.cos(rad),
      y2 = cy + r * Math.sin(rad);
    ticks += `<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" stroke="#1f2937" stroke-width="3"/>`;
  }
  let numbers = "";
  for (let n = 1; n <= 12; n++) {
    const angle = n * 30;
    const rad = ((angle - 90) * Math.PI) / 180;
    const x = cx + (r - 24) * Math.cos(rad),
      y = cy + (r - 24) * Math.sin(rad);
    numbers += `<text x="${x.toFixed(1)}" y="${(y + 6).toFixed(1)}" text-anchor="middle" font-size="16" font-weight="700" fill="#1f2937">${n}</text>`;
  }
  const hourRad = ((hourAngle - 90) * Math.PI) / 180;
  const hx = cx + 50 * Math.cos(hourRad),
    hy = cy + 50 * Math.sin(hourRad);
  const minRad = ((minuteAngle - 90) * Math.PI) / 180;
  const mx = cx + 75 * Math.cos(minRad),
    my = cy + 75 * Math.sin(minRad);
  return `<div class="clock-wrap"><svg viewBox="0 0 200 200" width="220" height="220">
    <circle cx="${cx}" cy="${cy}" r="${r}" fill="#fff" stroke="#1f2937" stroke-width="4"/>
    ${ticks}${numbers}
    <line x1="${cx}" y1="${cy}" x2="${hx.toFixed(1)}" y2="${hy.toFixed(1)}" stroke="#1f2937" stroke-width="6" stroke-linecap="round"/>
    <line x1="${cx}" y1="${cy}" x2="${mx.toFixed(1)}" y2="${my.toFixed(1)}" stroke="#7c3aed" stroke-width="4" stroke-linecap="round"/>
    <circle cx="${cx}" cy="${cy}" r="5" fill="#1f2937"/>
  </svg></div>`;
}

// ---------- Question generators ----------

function genMeasureAngle(tier) {
  const step = tier === "hard" ? 5 : 10;
  const maxMult = Math.floor(175 / step);
  const measure = randInt(1, maxMult) * step;

  return {
    category: "measure",
    visualHTML: protractorSVG(measure),
    promptText: `What is the measure of this angle (to the nearest ${step}°)?`,
    inputs: [{ id: "m", label: "Degrees", type: "number", min: 0, max: 180 }],
    check: (v) => Number(v.m) === measure,
    correctSummary: () => `${measure}°`,
    hint: "Line up the bottom ray with 0° on the protractor's scale, then read where the other ray crosses the numbers.",
  };
}

function genClassifyAngleDeg(tier) {
  const typesPool = tier === "easy" ? ["acute", "right", "obtuse"] : tier === "medium" ? ["acute", "right", "obtuse", "straight"] : ["acute", "right", "obtuse", "straight", "reflex"];
  const type = choice(typesPool);
  let measure;
  if (type === "right") measure = 90;
  else if (type === "straight") measure = 180;
  else if (type === "acute") measure = randInt(10, 80);
  else if (type === "obtuse") measure = randInt(100, 170);
  else measure = randInt(190, 350);

  const options = ["Acute", "Right", "Obtuse", "Straight", "Reflex"];
  const correctIndex = options.findIndex((o) => o.toLowerCase() === type);

  return {
    category: "classify",
    visualHTML: angleSVG(measure, randInt(0, 340)),
    promptText: "What type of angle is this?",
    inputs: [{ id: "t", label: "Angle type", type: "select", options }],
    check: (v) => Number(v.t) === correctIndex,
    correctSummary: () => `${options[correctIndex]} (${measure}°)`,
    hint: "Acute: less than 90°. Right: exactly 90°. Obtuse: between 90° and 180°. Straight: exactly 180°. Reflex: more than 180°.",
  };
}

function genAngleAddition(tier) {
  const subtype = choice(["sum", "missing"]);
  if (subtype === "sum") {
    const aPart = randInt(10, 80);
    const bPart = randInt(10, 80);
    const total = aPart + bPart;
    return {
      category: "addition",
      visualHTML: `<div class="phrase-display">Angle AOB is ${aPart}°. Angle BOC is ${bPart}°. Ray OB lies between rays OA and OC.</div>`,
      promptText: "What is the measure of angle AOC?",
      inputs: [{ id: "r", label: "Degrees", type: "number", min: 0, max: 180 }],
      check: (v) => Number(v.r) === total,
      correctSummary: () => `${total}°`,
      hint: "When one ray splits an angle into two parts, the two smaller angles add up to the whole angle.",
    };
  }
  const total = randInt(60, 170);
  const part = randInt(10, total - 10);
  const other = total - part;
  return {
    category: "addition",
    visualHTML: `<div class="phrase-display">Angle AOC is ${total}°. Ray OB lies between rays OA and OC, and angle AOB is ${part}°.</div>`,
    promptText: "What is the measure of angle BOC?",
    inputs: [{ id: "r", label: "Degrees", type: "number", min: 0, max: 180 }],
    check: (v) => Number(v.r) === other,
    correctSummary: () => `${other}°`,
    hint: "Subtract the known part from the whole angle to find the missing part.",
  };
}

function genComplementSupplement(tier) {
  const type = choice(["complement", "supplement"]);
  if (type === "complement") {
    const a = randInt(10, 80);
    const b = 90 - a;
    return {
      category: "sum",
      visualHTML: `<div class="phrase-display">Angle A is ${a}°. Angle A and Angle B are complementary (they add up to 90°).</div>`,
      promptText: "What is the measure of Angle B?",
      inputs: [{ id: "b", label: "Degrees", type: "number", min: 0, max: 90 }],
      check: (v) => Number(v.b) === b,
      correctSummary: () => `${b}°`,
      hint: "Complementary angles add up to 90°. Subtract the known angle from 90.",
    };
  }
  const a = randInt(10, 170);
  const b = 180 - a;
  return {
    category: "sum",
    visualHTML: `<div class="phrase-display">Angle A is ${a}°. Angle A and Angle B are supplementary (they add up to 180°).</div>`,
    promptText: "What is the measure of Angle B?",
    inputs: [{ id: "b", label: "Degrees", type: "number", min: 0, max: 180 }],
    check: (v) => Number(v.b) === b,
    correctSummary: () => `${b}°`,
    hint: "Supplementary angles add up to 180°. Subtract the known angle from 180.",
  };
}

function genTriangleSum(tier) {
  const a = randInt(20, 100);
  const b = randInt(20, 150 - a);
  const c = 180 - a - b;

  return {
    category: "sum",
    visualHTML: `<div class="phrase-display">A triangle has two angles that measure ${a}° and ${b}°.</div>`,
    promptText: "What is the measure of the third angle?",
    inputs: [{ id: "c", label: "Degrees", type: "number", min: 0, max: 180 }],
    check: (v) => Number(v.c) === c,
    correctSummary: () => `${c}°`,
    hint: "The three angles in any triangle always add up to 180°.",
  };
}

function genClockAngle(tier) {
  const hour = randInt(1, 11);
  const rawAngle = hour * 30;
  const angle = Math.min(rawAngle, 360 - rawAngle);

  return {
    category: "clock",
    visualHTML: clockSVG(hour, 0),
    promptText: "What is the angle between the hour and minute hands?",
    inputs: [{ id: "d", label: "Degrees", type: "number", min: 0, max: 180 }],
    check: (v) => Number(v.d) === angle,
    correctSummary: () => `${angle}°`,
    hint: "Each number on the clock is 30° apart (360° ÷ 12 numbers). Count how many numbers are between the two hands, then multiply by 30.",
  };
}

const POOLS = {
  easy: [genMeasureAngle, genMeasureAngle, genClassifyAngleDeg, genAngleAddition, genComplementSupplement],
  medium: [genMeasureAngle, genClassifyAngleDeg, genClassifyAngleDeg, genAngleAddition, genComplementSupplement, genTriangleSum, genClockAngle],
  hard: [genMeasureAngle, genMeasureAngle, genClassifyAngleDeg, genClassifyAngleDeg, genAngleAddition, genComplementSupplement, genTriangleSum, genTriangleSum, genClockAngle],
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
