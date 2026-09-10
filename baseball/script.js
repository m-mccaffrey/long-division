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
  { id: "force_solve", label: "Force Out Fielder", check: (s) => s.forceSolved >= 1 },
  { id: "tagup_solve", label: "Tag-Up Timer", check: (s) => s.tagupSolved >= 1 },
];

const STORAGE_KEY = "baseballQuestState";

const POSITIONS = ["pitcher", "catcher", "first baseman", "second baseman", "shortstop", "third baseman", "left fielder", "center fielder", "right fielder"];

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
    forceSolved: 0,
    tagupSolved: 0,
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

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = randInt(0, i);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function ordinal(n) {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

function xpForLevel(level) {
  return 150 * level;
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
  if (category === "force") stats.forceSolved += 1;
  if (category === "tagup") stats.tagupSolved += 1;
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

function diamondSVG(occupied) {
  const size = 170,
    cx = size / 2,
    cy = size / 2 + 8,
    r = 55;
  const home = { x: cx, y: cy + r };
  const first = { x: cx + r, y: cy };
  const second = { x: cx, y: cy - r };
  const third = { x: cx - r, y: cy };
  function baseCircle(pt, filled) {
    return `<circle cx="${pt.x}" cy="${pt.y}" r="10" fill="${filled ? "#facc15" : "#fff"}" stroke="#1f2937" stroke-width="2.5"/>`;
  }
  const pathD = `M ${home.x} ${home.y} L ${first.x} ${first.y} L ${second.x} ${second.y} L ${third.x} ${third.y} Z`;
  return `<div class="diamond-wrap"><svg viewBox="0 0 ${size} ${size}" width="${size}" height="${size}">
    <path d="${pathD}" fill="#86efac" stroke="#166534" stroke-width="3"/>
    ${baseCircle(second, occupied.second)}
    ${baseCircle(third, occupied.third)}
    ${baseCircle(first, occupied.first)}
    <rect x="${home.x - 7}" y="${home.y - 7}" width="14" height="14" fill="#fff" stroke="#1f2937" stroke-width="2" transform="rotate(45 ${home.x} ${home.y})"/>
  </svg></div>`;
}

function scorebugHTML(gs) {
  const halfArrow = gs.half === "top" ? "▲" : "▼";
  const outsDots = [0, 1, 2].map((i) => `<span class="out-dot ${i < gs.outs ? "filled" : ""}"></span>`).join("");
  return `<div class="scorebug">
    <div class="scorebug-inning">${halfArrow} ${ordinal(gs.inning)}</div>
    <div class="scorebug-count">${gs.balls}-${gs.strikes}</div>
    <div class="scorebug-outs">${outsDots}</div>
    ${diamondSVG(gs)}
  </div>`;
}

function positionCaption(position) {
  return `<div class="position-caption">📍 You're playing ${position}</div>`;
}

// ---------- Rules engine ----------

function randomGameState() {
  return {
    inning: randInt(1, 7),
    half: choice(["top", "bottom"]),
    balls: randInt(0, 3),
    strikes: randInt(0, 2),
    outs: randInt(0, 2),
    first: Math.random() < 0.5,
    second: Math.random() < 0.5,
    third: Math.random() < 0.5,
  };
}

function randomBaseState() {
  let bases;
  do {
    bases = { first: Math.random() < 0.5, second: Math.random() < 0.5, third: Math.random() < 0.5 };
  } while (!bases.first && !bases.second && !bases.third);
  return bases;
}

// A runner already on base is forced to advance only if every base behind
// them (toward home, including the batter) is occupied.
function forcedRunners(bases) {
  return {
    first: bases.first,
    second: bases.second && bases.first,
    third: bases.third && bases.first && bases.second,
  };
}

// ---------- Question generators: Easy (read the scorebug / trivia) ----------

function genReadCount(tier) {
  const gs = randomGameState();
  const askBalls = Math.random() < 0.5;
  const value = askBalls ? gs.balls : gs.strikes;

  return {
    category: "read",
    visualHTML: scorebugHTML(gs),
    promptText: askBalls ? "How many balls?" : "How many strikes?",
    inputs: [{ id: "v", label: askBalls ? "Balls" : "Strikes", type: "number", min: 0, max: askBalls ? 3 : 2 }],
    check: (v) => Number(v.v) === value,
    correctSummary: () => String(value),
    hint: 'The count is shown as "balls-strikes", like "2-1" means 2 balls and 1 strike.',
  };
}

function genReadOuts(tier) {
  const gs = randomGameState();

  return {
    category: "read",
    visualHTML: scorebugHTML(gs),
    promptText: "How many outs are there?",
    inputs: [{ id: "v", label: "Outs", type: "number", min: 0, max: 2 }],
    check: (v) => Number(v.v) === gs.outs,
    correctSummary: () => String(gs.outs),
    hint: "Each filled dot is one out. There are 3 outs per side, so the dots only show 0, 1, or 2.",
  };
}

function genReadInning(tier) {
  const gs = randomGameState();

  return {
    category: "read",
    visualHTML: scorebugHTML(gs),
    promptText: "What inning is it?",
    inputs: [
      { id: "h", label: "Half", type: "select", options: ["Top", "Bottom"] },
      { id: "n", label: "Inning", type: "number", min: 1, max: 9 },
    ],
    check: (v) => Number(v.h) === (gs.half === "top" ? 0 : 1) && Number(v.n) === gs.inning,
    correctSummary: () => `${gs.half === "top" ? "Top" : "Bottom"} of the ${ordinal(gs.inning)}`,
    hint: "▲ means the top of the inning (away team batting). ▼ means the bottom (home team batting).",
  };
}

function genReadBase(tier) {
  const gs = randomGameState();
  const baseKey = choice(["first", "second", "third"]);
  const baseLabel = { first: "1st", second: "2nd", third: "3rd" }[baseKey];
  const occupied = gs[baseKey];

  return {
    category: "read",
    visualHTML: scorebugHTML(gs),
    promptText: `Is there a runner on ${baseLabel} base?`,
    inputs: [{ id: "v", label: "Runner there?", type: "select", options: ["Yes", "No"] }],
    check: (v) => Number(v.v) === (occupied ? 0 : 1),
    correctSummary: () => (occupied ? "Yes" : "No"),
    hint: "A filled yellow dot on the diamond means a runner is standing on that base.",
  };
}

const TRIVIA = [
  { q: "How many strikes make a strikeout?", a: "3", d: ["2", "4"] },
  { q: "How many balls make a walk?", a: "4", d: ["3", "5"] },
  { q: "How many outs does a team get each inning before switching sides?", a: "3", d: ["2", "4"] },
  { q: "Not counting home plate, how many bases are on the field?", a: "3", d: ["2", "4"] },
  { q: "The count is already 2 strikes. The batter hits a foul ball. What happens to the strike count?", a: "Stays at 2 strikes", d: ["Becomes a strikeout (3 strikes)", "Goes back to 0 strikes"] },
  { q: "A batter draws a walk. Where do they go?", a: "First base", d: ["Second base", "Back to the dugout"] },
  { q: "The batter swings and misses the pitch. What is that called?", a: "A strike", d: ["A ball", "An out"] },
  { q: "A fielder catches a fly ball before it touches the ground. What happens to the batter?", a: "They're out", d: ["They're safe on first", "It's just a strike"] },
  { q: "The batter doesn't swing, and the pitch is outside the strike zone. What is that called?", a: "A ball", d: ["A strike", "A walk"] },
];

function genRulesTrivia(tier) {
  const item = choice(TRIVIA);
  const options = shuffle([item.a, ...item.d]);
  const correctIndex = options.indexOf(item.a);

  return {
    category: "trivia",
    visualHTML: `<div class="phrase-display">${item.q}</div>`,
    promptText: "Choose the correct answer.",
    inputs: [{ id: "t", label: "Answer", type: "select", options }],
    check: (v) => Number(v.t) === correctIndex,
    correctSummary: () => item.a,
    hint: "Think about the basic rules of the game.",
  };
}

// ---------- Question generators: Hard (situational rules) ----------

function genForcedRunners(tier) {
  const bases = randomBaseState();
  const forced = forcedRunners(bases);
  const position = choice(POSITIONS);

  const allOptions = [{ key: "batter", label: "The batter (running to 1st)" }];
  if (bases.first) allOptions.push({ key: "first", label: "Runner on 1st (running to 2nd)" });
  if (bases.second) allOptions.push({ key: "second", label: "Runner on 2nd (running to 3rd)" });
  if (bases.third) allOptions.push({ key: "third", label: "Runner on 3rd (running to home)" });
  const options = shuffle(allOptions);
  const forcedMap = { batter: true, first: forced.first, second: forced.second, third: forced.third };
  const correctKeys = options.filter((o) => forcedMap[o.key]).map((o) => o.key).sort();

  return {
    category: "force",
    visualHTML: positionCaption(position) + diamondSVG(bases),
    promptText: "A ground ball is hit. Which runners are FORCED to run to the next base?",
    inputs: [{ id: "forced", label: "", type: "checkboxGroup", options }],
    check: (v) => JSON.stringify([...v.forced].sort()) === JSON.stringify(correctKeys),
    correctSummary: () => (correctKeys.length ? options.filter((o) => correctKeys.includes(o.key)).map((o) => o.label).join("; ") : "No one is forced"),
    hint: "A runner is forced only if every base behind them, all the way to home (including the batter), is occupied too. The batter is always forced to run to 1st.",
  };
}

function genForceOutBases(tier) {
  const bases = randomBaseState();
  const forced = forcedRunners(bases);
  const position = choice(POSITIONS);

  const options = [
    { key: "first", label: "1st base" },
    { key: "second", label: "2nd base" },
    { key: "third", label: "3rd base" },
    { key: "home", label: "Home plate" },
  ];
  const availableMap = { first: true, second: forced.first, third: forced.second, home: forced.third };
  const correctKeys = options.filter((o) => availableMap[o.key]).map((o) => o.key).sort();

  return {
    category: "force",
    visualHTML: positionCaption(position) + diamondSVG(bases),
    promptText: "A ground ball is hit to you. Which base(s) have an automatic force out available?",
    inputs: [{ id: "bases", label: "", type: "checkboxGroup", options }],
    check: (v) => JSON.stringify([...v.bases].sort()) === JSON.stringify(correctKeys),
    correctSummary: () => options.filter((o) => correctKeys.includes(o.key)).map((o) => o.label).join("; "),
    hint: "1st base is always a force out on a ground ball, since the batter always has to run. Each base after that is only forced if every base behind it is also occupied.",
  };
}

function genForceOrTag(tier) {
  const bases = randomBaseState();
  const forced = forcedRunners(bases);
  const occupiedKeys = ["first", "second", "third"].filter((k) => bases[k]);
  const chosen = choice(occupiedKeys);
  const isForced = forced[chosen];
  const baseLabel = { first: "1st", second: "2nd", third: "3rd" }[chosen];
  const nextLabel = { first: "2nd base", second: "3rd base", third: "home plate" }[chosen];
  const position = choice(POSITIONS);
  const options = ["Force play — just touch the base", "Tag play — must tag the runner"];

  return {
    category: "force",
    visualHTML: positionCaption(position) + diamondSVG(bases),
    promptText: `The runner on ${baseLabel} base is running to ${nextLabel}. Is this a force play or a tag play?`,
    inputs: [{ id: "ft", label: "Play type", type: "select", options }],
    check: (v) => Number(v.ft) === (isForced ? 0 : 1),
    correctSummary: () => (isForced ? "Force play" : "Tag play"),
    hint: "A runner is forced only if every base behind them, back to home (including the batter), is occupied too. If not forced, you must physically tag them.",
  };
}

function genTagUp(tier) {
  const baseKey = choice(["first", "second", "third"]);
  const baseLabel = { first: "1st", second: "2nd", third: "3rd" }[baseKey];
  const nextLabel = { first: "2nd base", second: "3rd base", third: "home plate" }[baseKey];
  const outfielder = choice(["left fielder", "center fielder", "right fielder"]);
  const options = [`Go back and touch ${baseLabel} base first, then run`, `Just run to ${nextLabel} right away`, "They're automatically out"];

  return {
    category: "tagup",
    visualHTML: `<div class="phrase-display">Fly ball to the ${outfielder} — CAUGHT for the out!</div>${diamondSVG({ [baseKey]: true })}`,
    promptText: `The runner on ${baseLabel} wants to try to advance to ${nextLabel}. What must they do first?`,
    inputs: [{ id: "t", label: "What happens", type: "select", options }],
    check: (v) => Number(v.t) === 0,
    correctSummary: () => `Tag up: go back and touch ${baseLabel} base first, then run.`,
    hint: "After a fly ball is caught, any runner trying to advance must go back and touch their base (tag up) before running — even if they were standing off the base when it was caught.",
  };
}

const POOLS = {
  easy: [genReadCount, genReadCount, genReadOuts, genReadInning, genReadBase, genRulesTrivia, genRulesTrivia],
  hard: [genForcedRunners, genForcedRunners, genForceOutBases, genForceOrTag, genForceOrTag, genTagUp],
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
      if (inp.type === "checkboxGroup") {
        const rows = inp.options.map((o, i) => `<label class="checkbox-row"><input type="checkbox" id="inp_${inp.id}_${i}" /> ${o.label}</label>`).join("");
        return `<div class="checkbox-group">${rows}</div>`;
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
  controlRow.querySelectorAll("input[type=number]").forEach((inp) =>
    inp.addEventListener("keydown", (e) => {
      if (e.key === "Enter") submit();
    })
  );
}

function handleSubmit() {
  const p = state.problem;
  const values = {};
  for (const inp of p.inputs) {
    if (inp.type === "checkboxGroup") {
      values[inp.id] = inp.options.filter((o, i) => document.getElementById(`inp_${inp.id}_${i}`).checked).map((o) => o.key);
    } else {
      values[inp.id] = document.getElementById(`inp_${inp.id}`).value;
    }
  }
  if (Object.values(values).some((v) => v === "" || v === null)) {
    showFeedback("Fill in all the boxes.", false);
    shakeCard();
    return;
  }

  if (p.check(values)) {
    showFeedback(`Correct! ${p.correctSummary()}.`, true);
    popCard();
    addPoints(DIFFICULTY[state.difficulty].points);
    registerSolve(p.category);
    if (stats.streak > 0 && stats.streak % 5 === 0) launchConfetti();
    pendingAdvanceTimeout = setTimeout(newProblem, 1600);
  } else {
    showFeedback(`Not quite. ${p.correctSummary()}.`, false);
    shakeCard();
    registerMiss();
    pendingAdvanceTimeout = setTimeout(newProblem, 2600);
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
