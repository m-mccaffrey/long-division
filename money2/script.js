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
  { id: "tax_solve", label: "Tax Whiz", check: (s) => s.taxSolved >= 1 },
  { id: "deal_solve", label: "Deal Detective", check: (s) => s.dealSolved >= 1 },
];

const STORAGE_KEY = "moneyQuestState";

const LEGACY_KEYS = [
  { key: "money1QuestState", xpBase: 130 },
  { key: "money2QuestState", xpBase: 175 },
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
    taxSolved: 0,
    dealSolved: 0,
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
  if (category === "tax" || category === "discountTax") stats.taxSolved += 1;
  if (category === "betterDeal") stats.dealSolved += 1;
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

// ---------- Helpers: money formatting ----------

function money(cents) {
  return `$${(cents / 100).toFixed(2)}`;
}

function receiptHTML(lines, totalLabel, totalCents) {
  const rows = lines.map((l) => `<div class="receipt-line"><span>${l.label}</span><span>${money(l.cents)}</span></div>`).join("");
  const totalRow = totalLabel ? `<div class="receipt-rule"></div><div class="receipt-line"><strong>${totalLabel}</strong><strong>${money(totalCents)}</strong></div>` : "";
  return `<div class="receipt">${rows}${totalRow}</div>`;
}

// ---------- Question generators ----------

function genTotalCost(tier) {
  const n = tier === "easy" ? 2 : 3;
  const items = [];
  let totalCents = 0;
  for (let i = 0; i < n; i++) {
    const cents = randInt(50, 1999);
    items.push({ label: `Item ${i + 1}`, cents });
    totalCents += cents;
  }

  return {
    category: "totalCost",
    visualHTML: receiptHTML(items, null, 0),
    promptText: "What is the total cost?",
    inputs: [{ id: "t", label: "Total ($)", type: "number", min: 0, max: 500, step: "0.01" }],
    check: (v) => Math.round(Number(v.t) * 100) === totalCents,
    correctSummary: () => money(totalCents),
    hint: "Add up all the item prices, dollars with dollars and cents with cents.",
  };
}

function genChangeFromBill(tier) {
  const billCents = tier === "easy" ? 2000 : choice([2000, 5000, 10000]);
  const priceCents = randInt(100, billCents - 50);
  const changeCents = billCents - priceCents;

  return {
    category: "change",
    visualHTML: `<div class="price-tag">Total: ${money(priceCents)}</div><div class="bill-row"><div class="bill">${money(billCents)}</div></div>`,
    promptText: `You pay with ${money(billCents)}. How much change do you get?`,
    inputs: [{ id: "c", label: "Change ($)", type: "number", min: 0, max: 500, step: "0.01" }],
    check: (v) => Math.round(Number(v.c) * 100) === changeCents,
    correctSummary: () => money(changeCents),
    hint: "Subtract the total from the amount you paid.",
  };
}

function genDiscount(tier) {
  const priceCents = randInt(5, 400) * 20;
  const pct = choice([10, 20, 25, 50]);
  const discountCents = (priceCents * pct) / 100;
  const saleCents = priceCents - discountCents;

  return {
    category: "discount",
    visualHTML: `<div class="price-tag">${money(priceCents)} <span style="font-size:1rem; color:var(--muted);">(${pct}% off)</span></div>`,
    promptText: "What is the sale price?",
    inputs: [{ id: "s", label: "Sale price ($)", type: "number", min: 0, max: 500, step: "0.01" }],
    check: (v) => Math.round(Number(v.s) * 100) === saleCents,
    correctSummary: () => money(saleCents),
    hint: `Find ${pct}% of the price to get the discount, then subtract that from the original price.`,
  };
}

function genTip(tier) {
  const billCents = randInt(500, 6000);
  const pct = choice([10, 15, 18, 20, 25]);
  const tipCents = Math.round((billCents * pct) / 100);

  return {
    category: "tip",
    visualHTML: `<div class="price-tag">Bill: ${money(billCents)} <span style="font-size:1rem; color:var(--muted);">(${pct}% tip)</span></div>`,
    promptText: "How much should you leave as a tip?",
    inputs: [{ id: "t", label: "Tip ($)", type: "number", min: 0, max: 500, step: "0.01" }],
    check: (v) => Math.round(Number(v.t) * 100) === tipCents,
    correctSummary: () => money(tipCents),
    hint: `Find ${pct}% of the bill total. Try finding 10% first, then adjust.`,
  };
}

function genTax(tier) {
  const priceCents = randInt(100, 8000);
  const pct = choice([5, 6, 7, 8, 9, 10]);
  const totalCents = Math.round(priceCents * (1 + pct / 100));

  return {
    category: "tax",
    visualHTML: `<div class="price-tag">${money(priceCents)} <span style="font-size:1rem; color:var(--muted);">(+${pct}% tax)</span></div>`,
    promptText: "What is the total price after tax?",
    inputs: [{ id: "t", label: "Total ($)", type: "number", min: 0, max: 500, step: "0.01" }],
    check: (v) => Math.round(Number(v.t) * 100) === totalCents,
    correctSummary: () => money(totalCents),
    hint: `Find ${pct}% of the price for the tax amount, then add it to the original price.`,
  };
}

function genDiscountThenTax(tier) {
  const priceCents = randInt(5, 300) * 20;
  const discountPct = choice([10, 20, 25, 50]);
  const taxPct = choice([5, 6, 7, 8, 9, 10]);
  const saleCents = priceCents - (priceCents * discountPct) / 100;
  const totalCents = Math.round(saleCents * (1 + taxPct / 100));

  return {
    category: "discountTax",
    visualHTML: `<div class="price-tag">${money(priceCents)} <span style="font-size:1rem; color:var(--muted);">(${discountPct}% off, then +${taxPct}% tax)</span></div>`,
    promptText: "What is the final price, after the discount and tax?",
    inputs: [{ id: "t", label: "Final price ($)", type: "number", min: 0, max: 500, step: "0.01" }],
    check: (v) => Math.round(Number(v.t) * 100) === totalCents,
    correctSummary: () => money(totalCents),
    hint: "First apply the discount to get the sale price. Then add tax on top of that sale price.",
  };
}

function genBetterDeal(tier) {
  let qtyA, qtyB, priceA, priceB;
  do {
    qtyA = choice([4, 6, 8, 10, 12, 16, 20]);
    qtyB = choice([4, 6, 8, 10, 12, 16, 20]);
    priceA = randInt(100, 900);
    priceB = randInt(100, 900);
  } while (priceA * qtyB === priceB * qtyA);

  const aIsBetter = priceA * qtyB < priceB * qtyA;

  return {
    category: "betterDeal",
    visualHTML: `<div class="deal-options">
      <div class="deal-card"><div class="deal-label">Option A</div>${qtyA} for ${money(priceA)}</div>
      <div class="deal-card"><div class="deal-label">Option B</div>${qtyB} for ${money(priceB)}</div>
    </div>`,
    promptText: "Which is the better deal (cheaper per item)?",
    inputs: [{ id: "opt", label: "Better deal", type: "select", options: ["Option A", "Option B"] }],
    check: (v) => Number(v.opt) === (aIsBetter ? 0 : 1),
    correctSummary: () => (aIsBetter ? "Option A" : "Option B"),
    hint: "Compare the price per item for each option. Divide the price by the quantity to find the unit price.",
  };
}

const POOLS = {
  easy: [genTotalCost, genTotalCost, genChangeFromBill],
  medium: [genDiscount, genDiscount, genTip, genChangeFromBill],
  hard: [genTax, genTax, genDiscountThenTax, genBetterDeal],
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
