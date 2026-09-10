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
  { id: "mix_solve", label: "Coin Collector", check: (s) => s.mixSolved >= 1 },
  { id: "change_solve", label: "Change Champ", check: (s) => s.changeSolved >= 1 },
];

const STORAGE_KEY = "moneyQuestState";

const TIER_UNLOCK = { medium: 3, hard: 5 };

const LEGACY_KEYS = [
  { key: "money1QuestState", xpBase: 130 },
  { key: "money2QuestState", xpBase: 175 },
];

const COIN_TYPES = {
  penny: { value: 1, label: "penny", plural: "pennies", cls: "penny", short: "1¢" },
  nickel: { value: 5, label: "nickel", plural: "nickels", cls: "nickel", short: "5¢" },
  dime: { value: 10, label: "dime", plural: "dimes", cls: "dime", short: "10¢" },
  quarter: { value: 25, label: "quarter", plural: "quarters", cls: "quarter", short: "25¢" },
};

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
    mixSolved: 0,
    changeSolved: 0,
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

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = randInt(0, i);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
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
  if (category === "coinMix") stats.mixSolved += 1;
  if (category === "change") stats.changeSolved += 1;
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

function centsToDollarString(cents) {
  return `$${(cents / 100).toFixed(2)}`;
}

function coinRowHTML(coinCounts) {
  let pieces = [];
  Object.entries(coinCounts).forEach(([type, count]) => {
    const c = COIN_TYPES[type];
    for (let i = 0; i < count; i++) {
      pieces.push(`<div class="coin ${c.cls}">${c.short}</div>`);
    }
  });
  pieces = shuffle(pieces);
  return `<div class="coin-row">${pieces.join("")}</div>`;
}

// ---------- Question generators ----------

function genCoinCount(tier) {
  const typeKey = tier === "easy" ? choice(["penny", "nickel", "dime"]) : choice(["penny", "nickel", "dime", "quarter"]);
  const type = COIN_TYPES[typeKey];
  const n = tier === "easy" ? randInt(2, 6) : randInt(3, 9);
  const totalCents = n * type.value;

  return {
    category: "coinCount",
    visualHTML: coinRowHTML({ [typeKey]: n }),
    promptText: `How many ${type.plural} are there, and what is their total value (in cents)?`,
    inputs: [
      { id: "n", label: "Count", type: "number", min: 0, max: 20 },
      { id: "v", label: "Value (¢)", type: "number", min: 0, max: 500 },
    ],
    check: (v) => Number(v.n) === n && Number(v.v) === totalCents,
    correctSummary: () => `${n} ${type.plural}, worth ${totalCents}¢`,
    hint: `Each ${type.label} is worth ${type.value}¢. Count the coins, then multiply by ${type.value}.`,
  };
}

function genCoinMix(tier) {
  const allTypes = ["penny", "nickel", "dime", "quarter"];
  const numTypes = tier === "easy" ? 2 : tier === "medium" ? 3 : 4;
  const typesUsed = shuffle(allTypes).slice(0, numTypes);
  const counts = {};
  let totalCents = 0;
  typesUsed.forEach((t) => {
    const n = randInt(1, tier === "hard" ? 6 : 4);
    counts[t] = n;
    totalCents += n * COIN_TYPES[t].value;
  });

  const asDollars = tier === "hard";

  return {
    category: "coinMix",
    visualHTML: coinRowHTML(counts),
    promptText: asDollars ? "What is the total value, in dollars?" : "What is the total value, in cents?",
    inputs: asDollars
      ? [{ id: "d", label: "Value ($)", type: "number", min: 0, max: 50, step: "0.01" }]
      : [{ id: "v", label: "Value (¢)", type: "number", min: 0, max: 500 }],
    check: (v) => (asDollars ? Math.round(Number(v.d) * 100) === totalCents : Number(v.v) === totalCents),
    correctSummary: () => (asDollars ? centsToDollarString(totalCents) : `${totalCents}¢`),
    hint: "Add up the value of each coin one at a time: pennies count by 1s, nickels by 5s, dimes by 10s, quarters by 25s.",
  };
}

function genChangeMaking(tier) {
  const payCents = tier === "medium" ? 100 : choice([100, 200, 500]);
  const priceCents = randInt(tier === "medium" ? 10 : 5, payCents - (tier === "medium" ? 15 : 5));
  const changeCents = payCents - priceCents;

  return {
    category: "change",
    visualHTML: `<div class="price-tag">Item: ${centsToDollarString(priceCents)}</div><div class="bill-row"><div class="bill">${centsToDollarString(payCents)}</div></div>`,
    promptText: `You pay with ${centsToDollarString(payCents)}. How much change do you get (in cents)?`,
    inputs: [{ id: "c", label: "Change (¢)", type: "number", min: 0, max: 500 }],
    check: (v) => Number(v.c) === changeCents,
    correctSummary: () => `${changeCents}¢`,
    hint: "Subtract the price from the amount you paid.",
  };
}

const POOLS = {
  easy: [genCoinCount, genCoinCount, genCoinCount, genCoinMix],
  medium: [genCoinCount, genCoinMix, genCoinMix, genChangeMaking],
  hard: [genCoinMix, genCoinMix, genChangeMaking, genChangeMaking],
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
