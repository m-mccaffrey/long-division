// ---------- Config ----------

const DIFFICULTY = {
  easy: { label: "Easy", points: 8 },
  medium: { label: "Medium", points: 15 },
  hard: { label: "Hard", points: 30 },
};

const BADGE_DEFS = [
  { id: "streak_5", label: "Streak x5", check: (s) => s.bestStreak >= 5 },
  { id: "streak_10", label: "Streak x10", check: (s) => s.bestStreak >= 10 },
  { id: "streak_20", label: "Unstoppable", check: (s) => s.bestStreak >= 20 },
  { id: "hard_solve", label: "Hard Mode Hero", check: (s) => s.hardSolved >= 1 },
  { id: "money_10", label: "Budget Boss", check: (s) => s.moneySolved >= 10 },
  { id: "fineprint_10", label: "Fine Print Detective", check: (s) => s.fineprintSolved >= 10 },
  { id: "howto_10", label: "Handy Helper", check: (s) => s.howtoSolved >= 10 },
  { id: "planning_10", label: "Master Planner", check: (s) => s.planningSolved >= 10 },
];

const STORAGE_KEY = "lifeQuestState";

const TIER_UNLOCK = { medium: 3, hard: 5 };

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
    moneySolved: 0,
    fineprintSolved: 0,
    howtoSolved: 0,
    planningSolved: 0,
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

function sum(arr) {
  return arr.reduce((a, b) => a + b, 0);
}

function money(cents) {
  const neg = cents < 0;
  const abs = Math.abs(Math.round(cents));
  const s = "$" + Math.floor(abs / 100).toLocaleString("en-US") + "." + String(abs % 100).padStart(2, "0");
  return neg ? "−" + s : s;
}

// Typed dollars vs. expected cents, allowing `tol` cents of rounding slack.
function centsNear(typed, cents, tol = 0) {
  const v = parseFloat(String(typed).replace(/[$,\s]/g, ""));
  if (isNaN(v)) return false;
  return Math.abs(v * 100 - cents) <= tol + 0.5;
}

function numNear(typed, target, tol = 0.01) {
  const v = parseFloat(String(typed).replace(/[,\s]/g, ""));
  if (isNaN(v)) return false;
  return Math.abs(v - target) <= tol;
}

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

function dateStr(d) {
  return `${MONTHS[d.getMonth()]} ${d.getDate()}`;
}

function clockStr(mins) {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  const ampm = h >= 12 ? "PM" : "AM";
  const h12 = ((h + 11) % 12) + 1;
  return `${h12}:${String(m).padStart(2, "0")} ${ampm}`;
}

function fracStr(x) {
  const whole = Math.floor(x + 1e-9);
  const rem = Math.round((x - whole) * 8) / 8;
  const glyph = { 0.125: "⅛", 0.25: "¼", 0.375: "⅜", 0.5: "½", 0.625: "⅝", 0.75: "¾", 0.875: "⅞" }[rem] || "";
  if (!whole) return glyph || "0";
  return glyph ? `${whole} ${glyph}` : String(whole);
}

function moneyInput(id, label) {
  return { id, label, type: "number", min: 0, max: 100000, step: 0.01, cls: "money" };
}

function selectInput(id, label, options) {
  return { id, label, type: "select", options, cls: "wide" };
}

function xpForLevel(level) {
  return 150 * level;
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
  const key = category + "Solved";
  if (key in stats) stats[key] += 1;
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

// ================================================================
// MONEY
// ================================================================

const GROCERIES = [
  ["Milk (gallon)", 289, 449], ["Bread", 229, 399], ["Eggs (dozen)", 299, 549], ["Bananas", 129, 249],
  ["Cereal", 349, 599], ["Chicken breast", 699, 1199], ["Apples (bag)", 399, 649], ["Cheddar cheese", 299, 549],
  ["Spaghetti", 129, 229], ["Pasta sauce", 199, 379], ["Rice (2 lb)", 249, 449], ["Yogurt cup", 89, 139],
  ["Peanut butter", 249, 429], ["Frozen pizza", 499, 799], ["Orange juice", 299, 479], ["Carrots (bag)", 99, 199],
];

function shelfPrice(lo, hi) {
  return randInt(Math.ceil(lo / 10), Math.floor(hi / 10)) * 10 + 9;
}

function genReceiptTotal(tier) {
  const n = tier === "easy" ? 3 : tier === "medium" ? 4 : 5;
  const items = shuffle(GROCERIES)
    .slice(0, n)
    .map(([name, lo, hi]) => ({ name, price: shelfPrice(lo, hi), qty: tier === "easy" ? 1 : choice([1, 1, 2, 3]) }));
  const subtotal = sum(items.map((i) => i.price * i.qty));
  const couponItem = tier === "hard" ? choice(items) : null;
  const coupon = couponItem ? 100 : 0;
  const taxRate = tier === "easy" ? 0 : choice([5, 6, 7, 8]);
  const taxable = subtotal - coupon;
  const tax = Math.round((taxable * taxRate) / 100);
  const total = taxable + tax;

  const rows = items
    .map((i) => `<tr><td>${i.name}</td><td class="num">${i.qty} × ${money(i.price)}</td></tr>`)
    .join("");
  const notes = [];
  if (couponItem) notes.push(`✂️ Coupon: $1.00 off ${couponItem.name}`);
  if (taxRate) notes.push(`Sales tax: ${taxRate}%`);
  const visual = `<div class="doc receipt"><div class="doc-title">🛒 Your Cart</div><table>${rows}</table>${notes
    .map((n) => `<div class="doc-note">${n}</div>`)
    .join("")}</div>`;

  const prompt =
    tier === "easy"
      ? "What is the total for everything in your cart?"
      : tier === "medium"
      ? "What will you pay after sales tax? (Round the tax to the nearest cent.)"
      : "Use the coupon, then add sales tax. What will you pay? (Round tax to the nearest cent.)";

  let work = `Items add up to ${money(subtotal)}`;
  if (coupon) work += `, minus the $1.00 coupon = ${money(taxable)}`;
  if (taxRate) work += `, plus ${taxRate}% tax (${money(tax)})`;
  work += ` = ${money(total)}`;

  return {
    category: "money",
    visualHTML: visual,
    promptText: prompt,
    inputs: [moneyInput("t", "Total ($)")],
    check: (v) => centsNear(v.t, total, taxRate ? 1 : 0),
    correctSummary: () => work,
    hint:
      tier === "easy"
        ? "Line up the decimal points and add the prices."
        : tier === "medium"
        ? "Find the subtotal (don't forget the quantities!), then tax = subtotal × rate ÷ 100. Add them."
        : "Order matters: subtotal → subtract the coupon → then figure the tax on what's left.",
    lesson: taxRate
      ? "Price tags in most US stores don't include sales tax — your total at the register will be higher than the tags add up to."
      : "Keeping a running total while you shop means no surprises at the register.",
  };
}

const UNIT_PRODUCTS = [
  { name: "Cereal", unit: "oz", small: [12, 14, 18], big: [24, 32], cpu: [14, 30] },
  { name: "Orange juice", unit: "fl oz", small: [32, 52], big: [64, 89], cpu: [5, 11] },
  { name: "Laundry detergent", unit: "load", small: [24, 32], big: [64, 96], cpu: [18, 35] },
  { name: "Peanut butter", unit: "oz", small: [16, 18], big: [28, 40], cpu: [14, 26] },
  { name: "Rice", unit: "lb", small: [2, 5], big: [10, 20], cpu: [90, 200] },
];

function genUnitPrice(tier) {
  const prod = choice(UNIT_PRODUCTS);
  let a, b;
  for (let tries = 0; tries < 100; tries++) {
    const sa = choice(prod.small);
    const sb = choice(prod.big);
    const pa = Math.round(sa * randInt(prod.cpu[0] * 10, prod.cpu[1] * 10) / 10);
    const pb = Math.round(sb * randInt(prod.cpu[0] * 10, prod.cpu[1] * 10) / 10);
    const ua = pa / sa;
    const ub = pb / sb;
    if (Math.min(ua, ub) <= 0.88 * Math.max(ua, ub)) {
      a = { size: sa, price: pa, unitCents: ua };
      b = { size: sb, price: pb, unitCents: ub };
      break;
    }
  }
  const betterIdx = a.unitCents < b.unitCents ? 0 : 1;
  const better = betterIdx === 0 ? a : b;
  const bigIsWorse = betterIdx === 0;

  const visual = `<div class="doc"><div class="doc-title">${prod.name}</div><table>
    <tr><th>Package</th><th class="num">Size</th><th class="num">Price</th></tr>
    <tr><td>Size A</td><td class="num">${a.size} ${prod.unit}</td><td class="num">${money(a.price)}</td></tr>
    <tr><td>Size B</td><td class="num">${b.size} ${prod.unit}</td><td class="num">${money(b.price)}</td></tr>
  </table></div>`;

  const inputs = [selectInput("pick", "Better deal", ["Size A", "Size B"])];
  if (tier === "hard") inputs.push(moneyInput("u", `Its price per ${prod.unit} ($)`));
  const unitRounded = Math.round(better.unitCents);

  return {
    category: "money",
    visualHTML: visual,
    promptText:
      tier === "hard"
        ? `Which is the better deal, and what is its price per ${prod.unit} (to the nearest cent)?`
        : `Which package is the better deal?`,
    inputs,
    check: (v) => Number(v.pick) === betterIdx && (tier !== "hard" || centsNear(v.u, unitRounded, 1)),
    correctSummary: () =>
      `A: ${money(a.price)} ÷ ${a.size} ≈ ${money(Math.round(a.unitCents))} per ${prod.unit}. B: ${money(b.price)} ÷ ${b.size} ≈ ${money(
        Math.round(b.unitCents)
      )} per ${prod.unit}. Size ${betterIdx === 0 ? "A" : "B"} wins, at ${money(unitRounded)} per ${prod.unit}`,
    hint: `Divide each price by its size to get the cost of ONE ${prod.unit}. The lower number is the better deal.`,
    lesson: bigIsWorse
      ? "Surprise! The bigger package was the worse deal this time. Stores know people assume bigger = cheaper."
      : "Most shelf tags show a tiny 'unit price' — it's the fairest way to compare sizes.",
  };
}

function genTip(tier) {
  if (tier === "easy") {
    const bill = randInt(4, 16) * 500;
    const pct = choice([10, 20]);
    const tip = (bill * pct) / 100;
    return {
      category: "money",
      visualHTML: restaurantBill(bill),
      promptText: `You want to leave a ${pct}% tip. How much is the tip?`,
      inputs: [moneyInput("t", "Tip ($)")],
      check: (v) => centsNear(v.t, tip),
      correctSummary: () => `${pct}% of ${money(bill)} = ${money(tip)}`,
      hint: pct === 10 ? "10% is easy: move the decimal point one place to the left." : "Find 10% (move the decimal one place left), then double it.",
      lesson: "Quick trick: 10% → move the decimal. 20% → double that. 15% → 10% plus half of 10%.",
    };
  }
  const bill = randInt(1800, 9800);
  const pct = choice([15, 18, 20]);
  const tip = Math.round((bill * pct) / 100);
  if (tier === "medium") {
    return {
      category: "money",
      visualHTML: restaurantBill(bill),
      promptText: `You leave a ${pct}% tip. What is the total you pay, including the tip? (Round the tip to the nearest cent.)`,
      inputs: [moneyInput("t", "Total ($)")],
      check: (v) => centsNear(v.t, bill + tip, 1),
      correctSummary: () => `Tip = ${pct}% of ${money(bill)} = ${money(tip)}. Total = ${money(bill + tip)}`,
      hint: "Tip = bill × percent ÷ 100. Then add it to the bill.",
      lesson: "In the US, servers are often paid a low base wage, so tips are a big part of their pay.",
    };
  }
  const people = randInt(3, 6);
  const total = bill + tip;
  const share = Math.round(total / people);
  return {
    category: "money",
    visualHTML: restaurantBill(bill),
    promptText: `${people} friends split the bill evenly and add a ${pct}% tip. How much does each person pay? (Nearest cent.)`,
    inputs: [moneyInput("t", "Each pays ($)")],
    check: (v) => centsNear(v.t, share, 2),
    correctSummary: () => `Tip ${money(tip)} + bill ${money(bill)} = ${money(total)}. ÷ ${people} ≈ ${money(share)} each`,
    hint: "Figure out the tip on the whole bill first, add it on, then divide by the number of people.",
    lesson: "Splitting evenly is simplest — but if someone ordered a lot more, it's fair to split by what each person ordered.",
  };
}

function restaurantBill(cents) {
  return `<div class="doc receipt"><div class="doc-title">🍽️ Rosa's Diner</div><table>
    <tr><td>Food &amp; drinks</td><td class="num">${money(cents)}</td></tr>
    <tr class="total-row"><td>Amount due</td><td class="num">${money(cents)}</td></tr>
  </table><div class="doc-sub" style="margin-top:8px">Tip: ______</div></div>`;
}

function genPaycheck(tier) {
  const rate = tier === "medium" ? randInt(6, 10) * 2 : randInt(12, 20);
  const hours = tier === "easy" ? randInt(8, 25) : tier === "medium" ? randInt(42, 50) : randInt(20, 40);
  const reg = Math.min(hours, 40);
  const ot = Math.max(0, hours - 40);
  const gross = reg * rate * 100 + ot * rate * 150;

  const job = choice(["Lifeguard", "Grocery Clerk", "Camp Counselor", "Barista", "Dog Walker"]);
  let rows = `<tr><td>Job</td><td class="num">${job}</td></tr>
    <tr><td>Hourly rate</td><td class="num">${money(rate * 100)}</td></tr>
    <tr><td>Hours worked</td><td class="num">${hours}</td></tr>`;
  let taxPct = 0,
    insurance = 0;
  if (tier === "hard") {
    taxPct = choice([10, 12, 15]);
    insurance = choice([2500, 3500, 4500]);
    rows += `<tr><td>Taxes withheld</td><td class="num">${taxPct}% of gross</td></tr>
      <tr><td>Health insurance</td><td class="num">${money(insurance)}</td></tr>`;
  }
  const note = tier === "medium" ? `<div class="doc-note">Overtime: hours over 40 pay 1.5× the hourly rate.</div>` : "";
  const visual = `<div class="doc"><div class="doc-title">💵 Pay Stub</div><table>${rows}</table>${note}</div>`;

  if (tier === "hard") {
    const tax = Math.round((gross * taxPct) / 100);
    const net = gross - tax - insurance;
    return {
      category: "money",
      visualHTML: visual,
      promptText: "What is your NET pay (the amount that actually lands in your bank account)?",
      inputs: [moneyInput("n", "Net pay ($)")],
      check: (v) => centsNear(v.n, net, 1),
      correctSummary: () => `Gross = ${hours} × ${money(rate * 100)} = ${money(gross)}. Minus taxes ${money(tax)} and insurance ${money(insurance)} = ${money(net)}`,
      hint: "Gross pay = hours × rate. Then subtract the tax (a percent of gross) and the insurance (a flat amount).",
      lesson: "Your first paycheck is usually smaller than people expect — 'gross' is what you earned, 'net' is what you keep.",
    };
  }
  return {
    category: "money",
    visualHTML: visual,
    promptText: "What is your gross pay for this period (before any deductions)?",
    inputs: [moneyInput("g", "Gross pay ($)")],
    check: (v) => centsNear(v.g, gross),
    correctSummary: () =>
      ot
        ? `40 × ${money(rate * 100)} = ${money(40 * rate * 100)}, plus ${ot} overtime hours × ${money(rate * 150)} = ${money(ot * rate * 150)}. Total ${money(gross)}`
        : `${hours} × ${money(rate * 100)} = ${money(gross)}`,
    hint: ot ? "Split the hours: the first 40 at the normal rate, the rest at 1.5× the rate." : "Multiply hours worked by the hourly rate.",
    lesson: ot ? "Overtime is the law for most hourly jobs in the US — know your rights when you start working!" : "Always double-check your pay stub hours against what you actually worked.",
  };
}

const GOALS = [
  ["new bike", 18000], ["game console", 35000], ["pair of sneakers", 8500], ["concert ticket", 12000],
  ["skateboard", 9500], ["guitar", 22000], ["phone case and earbuds", 6500],
];

function genSavingsGoal(tier) {
  const [item, goal] = choice(GOALS);
  let saved, weekly, spend = 0;
  if (tier === "easy") {
    saved = 0;
    weekly = choice([500, 1000, 2000, 2500].filter((w) => goal % w === 0)) || 500;
  } else {
    saved = randInt(1, 8) * 500;
    weekly = randInt(6, 25) * 100;
    if (tier === "hard") spend = randInt(2, 5) * 100;
  }
  const net = weekly - spend;
  const weeks = Math.ceil((goal - saved) / net);
  const lines = [`🎯 Goal: ${item} — ${money(goal)}`];
  if (saved) lines.push(`🐷 Already saved: ${money(saved)}`);
  lines.push(`💼 You earn ${money(weekly)} every week`);
  if (spend) lines.push(`🍿 You spend ${money(spend)} of it each week on snacks`);
  const visual = `<div class="doc"><div class="doc-title">Savings Plan</div>${lines.map((l) => `<div style="margin:6px 0">${l}</div>`).join("")}</div>`;
  return {
    category: "money",
    visualHTML: visual,
    promptText: "How many weeks until you can buy it?",
    inputs: [{ id: "w", label: "Weeks", type: "number", min: 0, max: 500 }],
    check: (v) => Number(v.w) === weeks,
    correctSummary: () =>
      `You still need ${money(goal - saved)} and save ${money(net)} a week. ${money(goal - saved)} ÷ ${money(net)} = ${((goal - saved) / net).toFixed(2).replace(/\.00$/, "")}${
        (goal - saved) % net ? `, so round UP to ${weeks} weeks` : " weeks"
      }`,
    hint: tier === "easy" ? "Divide the price by how much you save each week." : "Subtract what you've saved from the goal. Divide by what you save each week — and if there's a remainder, you need one more week!",
    lesson: spend ? "Small weekly spending adds up — cutting snacks could get you there weeks sooner." : "Saving a set amount every week is called 'paying yourself first.'",
  };
}

function genBudget(tier) {
  const income = choice([180000, 200000, 220000, 240000, 260000]);
  const exp = [
    ["Rent", randInt(28, 44) * 2500],
    ["Groceries", randInt(25, 40) * 1000],
    ["Phone", randInt(35, 75) * 100],
    ["Bus pass", randInt(6, 12) * 1000],
    ["Utilities", randInt(9, 18) * 1000],
    ["Fun money", randInt(10, 25) * 1000],
  ];
  const spent = sum(exp.map((e) => e[1]));
  const left = income - spent;
  const rows = exp.map(([n, c]) => `<tr><td>${n}</td><td class="num">${money(c)}</td></tr>`).join("");
  const visual = `<div class="doc"><div class="doc-title">📒 Monthly Budget</div><table>
    <tr><td><b>Take-home pay</b></td><td class="num"><b>${money(income)}</b></td></tr>
    <tr><th colspan="2">Expenses</th></tr>${rows}</table></div>`;

  const variant = tier === "medium" ? "left" : choice(["save", "rent"]);
  if (variant === "left" || left <= 0) {
    return {
      category: "money",
      visualHTML: visual,
      promptText: "How much money is left over at the end of the month? (If you're over budget, type a negative number.)",
      inputs: [{ id: "l", label: "Left over ($)", type: "number", min: -100000, max: 100000, step: 0.01, cls: "money" }],
      check: (v) => centsNear(v.l, left),
      correctSummary: () => `Expenses total ${money(spent)}. ${money(income)} − ${money(spent)} = ${money(left)}`,
      hint: "Add up all the expenses, then subtract from take-home pay.",
      lesson: left < 0 ? "Over budget! Real budgets need cuts somewhere — fun money and groceries are usually the easiest to trim." : "Whatever's left over is your chance to save. Many people aim to save at least 10% of their pay.",
    };
  }
  if (variant === "save") {
    const fun = exp[5][1];
    const target = left + randInt(2, Math.max(2, Math.floor(fun / 2500))) * 2500;
    const cut = target - left;
    return {
      category: "money",
      visualHTML: visual,
      promptText: `You want to put ${money(target)} into savings every month. How much do you need to cut from Fun money?`,
      inputs: [moneyInput("c", "Cut ($)")],
      check: (v) => centsNear(v.c, cut),
      correctSummary: () => `Right now ${money(left)} is left over. You need ${money(target)}, so cut ${money(target)} − ${money(left)} = ${money(cut)}`,
      hint: "First find what's left over now. The cut is the difference between your savings goal and that amount.",
      lesson: "Budgets are about choices — every dollar of fun money you trim goes straight to savings.",
    };
  }
  const rent = exp[0][1];
  const pct = Math.round((rent / income) * 100);
  return {
    category: "money",
    visualHTML: visual,
    promptText: "What percent of your take-home pay goes to rent? (Nearest whole percent.)",
    inputs: [{ id: "p", label: "Percent", type: "number", min: 0, max: 100 }],
    check: (v) => Number(v.p) === pct,
    correctSummary: () => `${money(rent)} ÷ ${money(income)} = ${((rent / income) * 100).toFixed(1)}% ≈ ${pct}%`,
    hint: "Divide rent by take-home pay, then multiply by 100.",
    lesson: `A common rule of thumb is to keep rent at or below about 30% of your income. This one is ${pct > 30 ? "above" : "within"} that.`,
  };
}

function genCreditCard(tier) {
  const rate = choice([1.5, 2, 2.5]);
  const balance = randInt(20, 80) * 2500;
  const pay = randInt(2, 6) * 1000;
  const months = choice([1, 2]);
  let b = balance;
  const steps = [];
  for (let m = 1; m <= months; m++) {
    const after = b - pay;
    const interest = Math.round((after * rate) / 100);
    steps.push(`Month ${m}: ${money(b)} − ${money(pay)} = ${money(after)}, + ${rate}% interest (${money(interest)}) = ${money(after + interest)}`);
    b = after + interest;
  }
  const visual = `<div class="doc"><div class="doc-title">💳 Credit Card Statement</div><table>
    <tr><td>Balance owed</td><td class="num">${money(balance)}</td></tr>
    <tr><td>Your payment each month</td><td class="num">${money(pay)}</td></tr>
  </table><div class="fine-print" style="margin-top:8px">Interest of <b>${rate}% per month</b> is charged on any balance remaining after your payment.</div></div>`;
  return {
    category: "money",
    visualHTML: visual,
    promptText: `After ${months === 1 ? "one month" : "two months"} of payments and interest, how much do you owe? (Round interest to the nearest cent each month.)`,
    inputs: [moneyInput("b", "You owe ($)")],
    check: (v) => centsNear(v.b, b, months),
    correctSummary: () => steps.join(". "),
    hint: "Each month: subtract your payment first, THEN add the interest on what's left.",
    lesson: `You paid ${money(pay * months)} but the balance only dropped by ${money(balance - b)}. That gap is interest — it's why paying the full balance is so powerful.`,
  };
}

// ================================================================
// FINE PRINT
// ================================================================

const ELECTRONICS = [["wireless headphones", 7999], ["Bluetooth speaker", 4999], ["video game controller", 5999], ["tablet", 14999]];
const REGULAR_ITEMS = [["winter jacket", 8999], ["pair of sneakers", 6499], ["board game", 2999], ["backpack", 3999]];
const CLEARANCE_ITEMS = [["clearance lamp", 1999], ["clearance hoodie", 1499], ["clearance blender", 2499]];
const DISTRACTORS = [
  "You paid with a debit card.",
  "The box has a small dent in it.",
  "You bought it on a Saturday.",
  "It was a gift for your cousin, but they already had one.",
  "You decided you just don't like the color.",
];

function genReturnPolicy(tier) {
  const store = choice(["MegaMart", "Brightside Goods", "Northpoint Outfitters", "Value Hub"]);
  const window = choice([14, 30, 60]);
  const fee = choice([10, 15, 20]);
  const kind = choice(["clean", "late", "final", "noreceipt", "opened"]);

  let item, isElec;
  if (kind === "final") {
    item = choice(CLEARANCE_ITEMS);
    isElec = false;
  } else if (kind === "opened") {
    item = choice(ELECTRONICS);
    isElec = true;
  } else if (kind === "noreceipt") {
    item = choice(REGULAR_ITEMS);
    isElec = false;
  } else {
    isElec = Math.random() < 0.5;
    item = choice(isElec ? ELECTRONICS : REGULAR_ITEMS);
  }
  const [name, price] = item;
  const days = kind === "late" ? window + randInt(2, 20) : randInt(2, window - 2);

  let timing;
  if (tier === "hard") {
    const d1 = new Date(2026, randInt(0, 10), randInt(1, 28));
    const d2 = new Date(2026, d1.getMonth(), d1.getDate() + days);
    timing = `You bought it on <b>${dateStr(d1)}</b>. Today is <b>${dateStr(d2)}</b>.`;
  } else {
    timing = `You bought it <b>${days} days ago</b>.`;
  }
  const receipt = kind === "noreceipt" ? "You <b>lost the receipt</b>." : "You have the receipt.";
  const openedTxt = isElec ? (kind === "opened" ? "You opened it and used it a few times." : "It's still sealed in the box.") : "";

  const outcomes = ["Full refund", "Refund minus the restocking fee", "Store credit only", "No return allowed"];
  const ans = { clean: 0, opened: 1, noreceipt: 2, late: 3, final: 3 }[kind];
  const back = [price, price - Math.round((price * fee) / 100), price, 0][ans];

  const policy = `<div class="doc fine-print"><div class="doc-title">${store} Return Policy</div><ul>
    <li>Most items may be returned within <b>${window} days</b> of purchase for a full refund to your original payment.</li>
    <li>No receipt? We'll offer <b>store credit</b> instead of a refund.</li>
    <li>Opened electronics are subject to a <b>${fee}% restocking fee</b>.</li>
    <li>Clearance items are <b>FINAL SALE</b> — no returns or exchanges.</li>
    <li>No returns after ${window} days.</li></ul></div>`;
  const scenario = `<div class="scenario">You want to return a <b>${name}</b> that cost ${money(price)}. ${timing} ${receipt} ${openedTxt} ${choice(DISTRACTORS)}</div>`;

  const inputs = [selectInput("o", "What happens?", outcomes)];
  if (tier === "hard") inputs.push(moneyInput("amt", "Money or credit back ($)"));

  const why = {
    clean: "Within the time limit, receipt in hand, nothing special — full refund",
    opened: `Opened electronics get a ${fee}% restocking fee: ${money(price)} − ${money(price - back)} = ${money(back)}`,
    noreceipt: `No receipt means store credit instead of cash — still the full ${money(price)}`,
    late: `${days} days is past the ${window}-day window — no return`,
    final: "Clearance items are final sale — no return, no matter what",
  }[kind];

  return {
    category: "fineprint",
    visualHTML: policy + scenario,
    promptText: tier === "hard" ? "Read the policy. What happens, and how much do you get back?" : "Read the policy. What happens when you try to return it?",
    inputs,
    check: (v) => Number(v.o) === ans && (tier !== "hard" || centsNear(v.amt, back, 1)),
    correctSummary: () => (tier === "hard" ? `${why} (${money(back)} back)` : why),
    hint:
      tier === "hard"
        ? "First count the days between the two dates (watch for months with 30 vs. 31 days!). Then go down the policy rule by rule. Some details in the story don't matter at all."
        : "Check each rule against the story. Some details in the story don't matter at all — find the ones that do.",
    lesson: {
      clean: "Keep receipts (or take a photo of them) — they make returns painless.",
      opened: "Restocking fees are common on electronics. Test things right away so you can decide before the window closes.",
      noreceipt: "Store credit only works at that store — a receipt gets you real money back.",
      late: "Return windows are strict. Put the deadline in your phone the day you buy something pricey.",
      final: "'Final sale' means the deal is final too — be sure before you buy clearance.",
    }[kind],
  };
}

function genWarranty(tier) {
  const brand = choice(["Zentro", "Kelvix", "BrightHome", "AudioMax"]);
  const product = choice(["blender", "pair of headphones", "game console", "hair dryer", "tablet", "electric toothbrush"]);
  const term = choice([
    { label: "90 days", inMonths: [1, 2], outMonths: [4, 5, 6, 8] },
    { label: "1 year", inMonths: [2, 4, 7, 10], outMonths: [14, 16, 18, 20] },
    { label: "2 years", inMonths: [3, 9, 15, 20], outMonths: [27, 30, 36] },
  ]);
  const defects = ["it suddenly stopped turning on", "one of the buttons stopped working", "it started making a loud grinding noise", "it won't charge anymore"];
  const kinds = tier === "easy" ? ["defectIn", "defectOut", "drop", "water"] : ["defectIn", "defectIn", "defectOut", "drop", "water", "selfRepair", "scratch"];
  const kind = choice(kinds);
  const months = choice(kind === "defectOut" ? term.outMonths : term.inMonths);
  const when = `${months} month${months === 1 ? "" : "s"} after you bought it`;

  const story = {
    defectIn: `${when}, ${choice(defects)}. You've always been careful with it.`,
    defectOut: `${when}, ${choice(defects)}. You've always been careful with it.`,
    drop: `${when}, you dropped it on the sidewalk and now it's cracked and won't work.`,
    water: `${when}, it fell into the sink full of water. Now it won't turn on.`,
    selfRepair: `${when}, ${choice(defects)}. Your uncle opened it up to try fixing it, but couldn't.`,
    scratch: `${when}, you noticed some scratches on the outside. It still works fine, but you want it to look new.`,
  }[kind];
  const covered = kind === "defectIn";
  const why = {
    defectIn: `It broke on its own within ${term.label} — that's exactly what a defect warranty covers`,
    defectOut: `${months} months is past the ${term.label} warranty${term.label.includes("year") ? ` (${term.label} = ${term.label === "1 year" ? 12 : 24} months)` : " (about 3 months)"}`,
    drop: "Drops are accidental damage, which is excluded",
    water: "Water damage is excluded",
    selfRepair: `Repairs by anyone other than ${brand} void the coverage`,
    scratch: "Scratches are normal wear and tear, which is excluded",
  }[kind];

  const doc = `<div class="doc fine-print"><div class="doc-title">${brand} Limited Warranty</div>
    ${brand} covers defects in materials and workmanship for <b>${term.label}</b> from the date of purchase.
    <div style="margin-top:8px">This warranty does <b>NOT</b> cover:</div>
    <ul><li>Accidental damage (such as drops or cracked screens)</li>
    <li>Water or other liquid damage</li>
    <li>Normal wear and tear (such as scratches or scuffs)</li>
    <li>Damage from repairs by anyone other than ${brand}</li></ul>
    <div style="margin-top:6px">Keep your receipt as proof of purchase.</div></div>`;
  const scenario = `<div class="scenario">You have a ${brand} <b>${product}</b>. ${story}</div>`;

  return {
    category: "fineprint",
    visualHTML: doc + scenario,
    promptText: "Will the warranty cover a free repair or replacement?",
    inputs: [selectInput("c", "Covered?", ["Yes — covered", "No — not covered"])],
    check: (v) => Number(v.c) === (covered ? 0 : 1),
    correctSummary: () => `${covered ? "Covered" : "Not covered"}: ${why}`,
    hint: "Two checks: (1) Is it still within the time limit? (2) Is the cause on the 'NOT cover' list?",
    lesson: covered
      ? "Many people never use warranties they have! When something breaks on its own, check before paying for a fix."
      : "Warranties cover things that break on their own — not accidents. That's what insurance or 'protection plans' are sold for.",
  };
}

function genPromo(tier) {
  const kinds = tier === "medium" ? ["bogo", "threshold"] : ["bogo", "threshold", "oneItem", "shipping"];
  const kind = choice(kinds);

  if (kind === "bogo") {
    const thing = choice(["T-shirts", "pairs of jeans", "video games", "books"]);
    let a = randInt(15, 60) * 100 - 2;
    let b = randInt(10, 50) * 100 - 2;
    if (a === b) b -= 300;
    const lower = Math.min(a, b);
    const total = a + b - lower / 2;
    return promoProblem(
      `<b>Buy one, get one 50% off!</b><br><span class="fine-print">*Discount applies to the lower-priced item.</span>`,
      `You buy two ${thing}: one is ${money(a)} and the other is ${money(b)}.`,
      "What do you pay (before tax)?",
      total,
      `The cheaper item (${money(lower)}) is half off: ${money(lower / 2)}. ${money(Math.max(a, b))} + ${money(lower / 2)} = ${money(total)}`,
      "Only the CHEAPER item gets the discount. Find half of it, then add the full price of the other.",
      "That asterisk (*) always means 'read the fine print.' Here it means the store picks which item is discounted — and it's never the expensive one."
    );
  }
  if (kind === "threshold") {
    const prices = [randInt(8, 25) * 100 + choice([0, 49, 99]), randInt(8, 25) * 100 + choice([0, 49, 99]), randInt(5, 15) * 100 + choice([0, 49, 99])];
    const sub = sum(prices);
    const total = sub >= 5000 ? sub - 1000 : sub;
    return promoProblem(
      `<b>$10 OFF</b> your order!<br><span class="fine-print">*On purchases of $50.00 or more, before tax.</span>`,
      `Your cart: ${prices.map(money).join(", ")}.`,
      "What do you pay (before tax)?",
      total,
      sub >= 5000 ? `Subtotal ${money(sub)} is at least $50, so take $10 off: ${money(total)}` : `Subtotal ${money(sub)} is under $50 — the coupon doesn't apply! You pay ${money(sub)}`,
      "Add the cart first. Does it reach the minimum in the fine print?",
      sub >= 5000
        ? "Nice — you qualified. Be careful of buying extra stuff you don't need just to reach a minimum."
        : `So close! Stores set minimums so you'll add ${money(5000 - sub)} more to your cart.`
    );
  }
  if (kind === "oneItem") {
    const prices = shuffle([randInt(10, 20) * 100 - 1, randInt(22, 35) * 100 - 1, randInt(40, 70) * 100 - 1]);
    const max = Math.max(...prices);
    const save = Math.round(max * 0.25);
    const total = sum(prices) - save;
    return promoProblem(
      `<b>25% OFF any ONE item!</b><br><span class="fine-print">*Limit one item per purchase.</span>`,
      `You're buying three things: ${prices.map(money).join(", ")}.`,
      "Using the coupon in the smartest way, what is the LOWEST total you can pay?",
      total,
      `Use it on the most expensive item: 25% of ${money(max)} = ${money(save)} off. ${money(sum(prices))} − ${money(save)} = ${money(total)}`,
      "25% off saves the most money on the most expensive item.",
      "Percent-off coupons → use on the priciest item. Dollar-off coupons → it doesn't matter which item."
    );
  }
  const cart = randInt(26, 33) * 100 + choice([0, 50]);
  const ship = 799;
  const socks = choice([499, 599, 899, 999]);
  const withSocks = cart + socks >= 3500 ? cart + socks : cart + socks + ship;
  const withoutSocks = cart + ship;
  const ans = withSocks < withoutSocks ? 0 : 1;
  return {
    category: "fineprint",
    visualHTML: `<div class="doc"><div class="doc-title">🚚 Online Store</div>FREE shipping on orders of <b>$35</b> or more!<div class="fine-print" style="margin-top:6px">*Orders under $35: shipping is ${money(ship)}.</div></div>
      <div class="scenario">Your cart is ${money(cart)}. You could add a pair of socks for ${money(socks)} to get free shipping.</div>`,
    promptText: "Which way costs LESS in total?",
    inputs: [selectInput("p", "Cheaper", ["Add the socks", "Skip the socks, pay shipping"])],
    check: (v) => Number(v.p) === ans,
    correctSummary: () =>
      `With socks: ${money(withSocks)}. Without: ${money(cart)} + ${money(ship)} = ${money(withoutSocks)}. ${ans === 0 ? "Adding socks is cheaper (and you get socks!)" : "Paying shipping is cheaper"}`,
    hint: "Work out both totals. Does adding the socks actually reach $35?",
    lesson: "Free-shipping minimums are designed to make you spend more. Sometimes it's worth it — but always do the math.",
  };
}

function promoProblem(sign, story, prompt, total, work, hint, lesson) {
  return {
    category: "fineprint",
    visualHTML: `<div class="doc" style="text-align:center">${sign}</div><div class="scenario">${story}</div>`,
    promptText: prompt,
    inputs: [moneyInput("t", "You pay ($)")],
    check: (v) => centsNear(v.t, total, 1),
    correctSummary: () => work,
    hint,
    lesson,
  };
}

// ================================================================
// HOW-TO
// ================================================================

const PROCEDURES = [
  {
    title: "🛞 Change a Flat Tire",
    steps: [
      "Pull over somewhere flat and safe, turn on hazard lights, and set the parking brake",
      "Get out the spare tire, the jack, and the lug wrench",
      "Loosen the lug nuts a little while the tire is still on the ground",
      "Jack up the car until the flat tire is off the ground",
      "Remove the lug nuts and pull off the flat tire",
      "Put on the spare and hand-tighten the lug nuts",
      "Lower the car back to the ground",
      "Tighten the lug nuts fully, in a star pattern",
    ],
    lesson: "You loosen the nuts BEFORE jacking because a lifted wheel just spins when you try to turn the wrench.",
  },
  {
    title: "🔋 Jump-Start a Car",
    steps: [
      "Park the working car close to the dead one and turn both cars off",
      "Clamp one RED cable end to the dead battery's + terminal",
      "Clamp the other RED end to the good battery's + terminal",
      "Clamp one BLACK end to the good battery's − terminal",
      "Clamp the last BLACK end to bare, unpainted metal on the dead car, away from the battery",
      "Start the working car and let it run a few minutes",
      "Start the dead car",
      "Remove the cables in the reverse order you attached them",
    ],
    lesson: "The last clamp goes on bare metal, away from the battery, because a small spark is normal and batteries can give off flammable gas.",
  },
  {
    title: "⛽ Check Tire Pressure",
    steps: [
      "Check when the tires are cold (before driving, or after sitting a few hours)",
      "Find the recommended PSI on the sticker inside the driver's door frame",
      "Unscrew the cap from the tire's valve stem",
      "Press the gauge firmly onto the valve stem and read the number",
      "If it's low, add air, then check again",
      "Screw the valve cap back on",
    ],
    lesson: "Underinflated tires wear out faster and waste gas. Checking once a month takes five minutes.",
  },
  {
    title: "🍝 Cook Pasta",
    steps: [
      "Fill a big pot with water and bring it to a rolling boil",
      "Add a good pinch of salt to the water",
      "Add the pasta and stir so it doesn't stick",
      "Cook for the time on the box, stirring now and then",
      "Taste a piece to check that it's tender",
      "Drain the pasta in a colander in the sink",
    ],
    lesson: "Point the pot away from you when you drain it — that steam is hot enough to burn.",
  },
  {
    title: "🧺 Get a Stain Out of a Shirt",
    steps: [
      "Act fast and blot (don't rub) the extra off with a paper towel",
      "Rinse the stain from the BACK of the fabric with cold water",
      "Rub a little detergent or stain remover into the stain",
      "Let it sit for about 5–10 minutes",
      "Wash it as the care label says",
      "Check that the stain is gone BEFORE putting it in the dryer",
    ],
    lesson: "The dryer's heat can lock a stain in permanently — always check before drying.",
  },
];

function genProcedure(tier) {
  const proc = choice(PROCEDURES);
  const steps = proc.steps;
  const mixed = shuffle(steps);
  const visual = `<div class="doc"><div class="doc-title">${proc.title}</div><div class="doc-sub">The steps are mixed up!</div><ul class="step-list">${mixed
    .map((s) => `<li>${s}</li>`)
    .join("")}</ul></div>`;

  let prompt, answerText, hint;
  if (tier === "easy") {
    answerText = steps[0];
    prompt = "Which step comes FIRST?";
    hint = "Think about what has to be true before you can start any of the other steps. Safety usually comes first!";
  } else if (tier === "medium") {
    const i = randInt(0, steps.length - 2);
    answerText = steps[i + 1];
    prompt = `Which step comes RIGHT AFTER: “${steps[i]}”?`;
    hint = "Picture yourself actually doing it. What are you able to do next?";
  } else {
    if (Math.random() < 0.5) {
      const i = randInt(1, steps.length - 1);
      answerText = steps[i - 1];
      prompt = `Which step comes RIGHT BEFORE: “${steps[i]}”?`;
    } else {
      const i = randInt(2, steps.length - 2);
      answerText = steps[i];
      prompt = `Put them in order in your head. Which step is #${i + 1}?`;
    }
    hint = "Try ordering ALL the steps first, then find the one you need.";
  }
  const optIdx = mixed.indexOf(answerText);
  return {
    category: "howto",
    visualHTML: visual,
    promptText: prompt,
    inputs: [selectInput("s", "Step", mixed)],
    check: (v) => Number(v.s) === optIdx,
    correctSummary: () => `“${answerText}”. Full order: ${steps.map((s, i) => `${i + 1}) ${s}`).join("  ")}`,
    hint,
    lesson: proc.lesson,
  };
}

const LIFE_FACTS = [
  {
    q: "A pan of cooking oil on the stove catches fire. What should you do?",
    a: "Cover it with a lid and turn off the burner",
    wrong: ["Pour water on it", "Carry the pan outside", "Blow on it hard"],
    lesson: "Water makes a grease fire explode outward. Smother it with a lid (or baking soda), and call 911 if it spreads.",
  },
  {
    q: "Where do you find the correct air pressure for your car's tires?",
    a: "On a sticker inside the driver's door frame",
    wrong: ["The big number printed on the side of the tire", "Always exactly 50 PSI", "On the gas cap"],
    lesson: "The number on the tire itself is the MAXIMUM it can hold — not the pressure you should use.",
  },
  {
    q: "What's the difference between gross pay and net pay?",
    a: "Gross is before taxes and deductions; net is what you take home",
    wrong: ["Net is before taxes; gross is after", "They mean the same thing", "Gross pay only counts overtime"],
    lesson: "When a job says '$15/hour,' that's gross. Plan your budget around net.",
  },
  {
    q: "What does the APR on a credit card tell you?",
    a: "The yearly interest rate charged on balances you don't pay off",
    wrong: ["How much you're allowed to spend", "Your credit score", "How many days until the card expires"],
    lesson: "If you pay the whole balance every month, APR doesn't cost you anything at all.",
  },
  {
    q: "Unopened crackers say “Best By June 10.” It's June 12 and they look and smell fine. What's true?",
    a: "“Best by” is about quality, not safety — they're likely still fine",
    wrong: ["They became unsafe on June 10", "It's illegal to eat them", "They must be thrown out within a day"],
    lesson: "Lots of good food gets wasted because of date confusion. “Best by” ≠ “bad after.” (Baby formula is the exception — follow its date.)",
  },
  {
    q: "The power goes out in just ONE room of your house. What should you check first?",
    a: "The breaker panel, for a tripped circuit breaker",
    wrong: ["Call the power company", "Replace all the outlets", "Unplug the refrigerator"],
    lesson: "A tripped breaker sits in the middle position. Push it fully OFF, then back ON.",
  },
  {
    q: "A pipe under the sink bursts and water is spraying everywhere. What should you do FIRST?",
    a: "Turn off the water at the shut-off valve",
    wrong: ["Mop up the floor", "Wrap it in a towel and wait", "Turn on the faucet to relieve pressure"],
    lesson: "Find your home's main water shut-off valve BEFORE an emergency — ask a grown-up to show you.",
  },
  {
    q: "What is a credit score mainly used for?",
    a: "Helping lenders decide whether to lend you money, and at what interest rate",
    wrong: ["Measuring how much money is in your bank account", "Grading your math skills", "Counting your credit cards"],
    lesson: "Paying bills on time is the #1 thing that builds a good credit score.",
  },
  {
    q: "Why should you have an emergency fund?",
    a: "To pay for surprises like car repairs without going into debt",
    wrong: ["Banks require one by law", "To buy things when they go on sale", "To pay for vacations"],
    lesson: "A common goal is 3–6 months of expenses, but even a few hundred dollars helps a lot.",
  },
  {
    q: "An email says you won a prize — you just need to send your bank password to claim it. What do you do?",
    a: "Don't reply — it's a scam. Real companies never ask for passwords",
    wrong: ["Send it fast before the prize expires", "Reply and ask for more details", "Forward it to friends so they can win too"],
    lesson: "Scams create urgency (“act NOW!”) so you don't stop to think. Slowing down is your superpower.",
  },
  {
    q: "On an insurance policy, what is the “deductible”?",
    a: "The amount you pay yourself before insurance starts paying",
    wrong: ["The monthly price of the insurance", "A discount for safe drivers", "Money insurance pays you every year"],
    lesson: "A higher deductible means a cheaper monthly price — but more out of pocket if something happens.",
  },
  {
    q: "Your smoke alarm chirps once every minute or so. What does that usually mean?",
    a: "Its battery is low and needs replacing",
    wrong: ["There's a fire somewhere", "It's working perfectly", "Someone is at the door"],
    lesson: "Many people change smoke alarm batteries when the clocks change for daylight saving time.",
  },
  {
    q: "When should you read the fine print on a contract or sign-up form?",
    a: "Before you sign or click “I agree”",
    wrong: ["After you sign it", "Only if something goes wrong", "Never — nobody reads it"],
    lesson: "Once you sign, you've agreed to everything in it — even the tiny print.",
  },
  {
    q: "A “free trial” asks for your credit card number. What usually happens if you forget to cancel?",
    a: "You're automatically charged when the trial ends",
    wrong: ["Nothing — it just stops", "They send you a reminder and wait for permission", "The card gets a refund"],
    lesson: "Set a phone reminder a couple of days before any free trial ends.",
  },
];

function genLifeFact(tier) {
  const f = choice(LIFE_FACTS);
  const opts = shuffle([f.a, ...f.wrong]);
  const ansIdx = opts.indexOf(f.a);
  return {
    category: "howto",
    visualHTML: `<div class="phrase-display" style="font-size:1.25rem">${f.q}</div>`,
    promptText: "Choose the best answer.",
    inputs: [selectInput("a", "Answer", opts)],
    check: (v) => Number(v.a) === ansIdx,
    correctSummary: () => f.a,
    hint: "Think about what keeps you safe and protects your money.",
    lesson: f.lesson,
  };
}

// ================================================================
// PLANNING
// ================================================================

const STOP_NAMES = ["Maple Ave", "Main St", "Library", "City Park", "Mall", "High School", "Hospital", "Train Station"];

function genBusSchedule(tier) {
  const stops = shuffle(STOP_NAMES).slice(0, 4);
  const legs = [0, randInt(4, 12), randInt(4, 12), randInt(4, 12)];
  const offsets = legs.map((_, i) => sum(legs.slice(0, i + 1)));
  const first = 6 * 60 + 30 + randInt(0, 12) * 5;
  const headway = choice([15, 20, 30]);
  const trips = 5;
  const times = [...Array(trips)].map((_, t) => offsets.map((o) => first + t * headway + o));
  const route = choice(["4", "12", "22", "7X"]);

  const table = `<div class="doc"><div class="doc-title">🚌 Route ${route} — Weekday Mornings</div><table class="timetable">
    <tr>${stops.map((s) => `<th>${s}</th>`).join("")}</tr>
    ${times.map((row) => `<tr>${row.map((m) => `<td>${clockStr(m)}</td>`).join("")}</tr>`).join("")}
  </table></div>`;

  if (tier === "easy") {
    const t = randInt(0, trips - 1);
    const k = randInt(1, 3);
    const opts = times.map((r) => clockStr(r[k]));
    return {
      category: "planning",
      visualHTML: table,
      promptText: `You catch the bus that leaves ${stops[0]} at ${clockStr(times[t][0])}. What time does it reach ${stops[k]}?`,
      inputs: [selectInput("a", "Arrives", opts)],
      check: (v) => Number(v.a) === t,
      correctSummary: () => `Follow that row across: ${clockStr(times[t][k])}`,
      hint: "Each ROW is one bus. Find your departure time, then slide across that row to the stop you want.",
      lesson: "Bus schedules read across for one trip and down for the next bus.",
    };
  }
  if (tier === "medium" || Math.random() < 0.5) {
    const j = randInt(1, trips - 1);
    const deadline = times[j][3] + randInt(1, headway - 1);
    const opts = times.map((r) => clockStr(r[0]));
    return {
      category: "planning",
      visualHTML: table,
      promptText: `You need to be at ${stops[3]} by ${clockStr(deadline)}. What is the LATEST bus you can catch from ${stops[0]}?`,
      inputs: [selectInput("a", "Leave at", opts)],
      check: (v) => Number(v.a) === j,
      correctSummary: () => `The ${clockStr(times[j][0])} bus arrives at ${clockStr(times[j][3])} — just in time. The next one would be late`,
      hint: `Look down the ${stops[3]} column for the last time that's still before your deadline, then go back across to ${stops[0]}.`,
      lesson: "In real life, plan for the bus BEFORE that one — buses run late more often than early!",
    };
  }
  const j = randInt(1, trips - 1);
  const arrive = times[j][1] - randInt(1, headway - 1);
  const opts = times.map((r) => clockStr(r[3]));
  return {
    category: "planning",
    visualHTML: table,
    promptText: `You get to the ${stops[1]} stop at ${clockStr(arrive)}. On the next bus, what time will you reach ${stops[3]}?`,
    inputs: [selectInput("a", "Arrive", opts)],
    check: (v) => Number(v.a) === j,
    correctSummary: () => `The next bus at ${stops[1]} is ${clockStr(times[j][1])}, which reaches ${stops[3]} at ${clockStr(times[j][3])}`,
    hint: `Find the first ${stops[1]} time AFTER you arrive (you just missed the one before). Then follow that row.`,
    lesson: "Most transit apps do this for you — but when your phone dies, the paper schedule still works.",
  };
}

const RECIPES = [
  {
    name: "Pancakes",
    serves: 4,
    items: [["flour", 1.5, "cups"], ["milk", 1.25, "cups"], ["sugar", 2, "tablespoons"], ["baking powder", 2, "teaspoons"], ["salt", 0.5, "teaspoon"]],
    extra: "1 egg",
  },
  {
    name: "Mac & Cheese",
    serves: 4,
    items: [["elbow pasta", 2, "cups"], ["milk", 1.5, "cups"], ["shredded cheese", 2, "cups"], ["butter", 2, "tablespoons"], ["flour", 2, "tablespoons"]],
    extra: "a pinch of salt",
  },
  {
    name: "Chocolate Chip Cookies",
    serves: 24,
    items: [["butter", 1, "cup"], ["brown sugar", 0.75, "cup"], ["flour", 2.25, "cups"], ["chocolate chips", 2, "cups"], ["vanilla", 1, "teaspoon"]],
    extra: "2 eggs",
  },
];

function genRecipeScale(tier) {
  const r = choice(RECIPES);
  const factors = tier === "hard" ? [1.5, 3, 0.75] : [2, 0.5];
  const f = choice(factors);
  const target = r.serves * f;
  const [ing, amt, unit] = choice(r.items);
  const ans = amt * f;
  const unitLabel = r.name.includes("Cookies") ? "cookies" : "people";
  const visual = `<div class="doc"><div class="doc-title">📖 ${r.name}</div><div class="doc-sub">Makes ${r.serves} ${unitLabel === "cookies" ? "cookies" : "servings"}</div><ul class="step-list">${r.items
    .map(([n, a, u]) => `<li><b>${fracStr(a)}</b> ${u} ${n}</li>`)
    .join("")}<li>${r.extra}</li></ul></div>`;
  return {
    category: "planning",
    visualHTML: visual,
    promptText: `You need to make ${target} ${unitLabel === "cookies" ? "cookies" : "servings"}. How much <b>${ing}</b> do you need? (${unit} — decimals are fine, like 0.75)`,
    inputs: [{ id: "a", label: unit, type: "number", min: 0, max: 100, step: 0.01 }],
    check: (v) => numNear(v.a, ans, 0.02),
    correctSummary: () => `${target} ÷ ${r.serves} = ×${f}. ${fracStr(amt)} × ${f} = ${fracStr(ans)} ${unit} (${ans})`,
    hint: `First find the scale: ${target} ÷ ${r.serves}. Then multiply the amount by that number. (½ = 0.5, ¼ = 0.25, ¾ = 0.75)`,
    lesson: f < 1 && r.extra.includes("egg") ? "Halving a recipe with one egg? Beat the egg in a cup and use half of it!" : "Measuring cups usually come in 1, ½, ⅓, and ¼ — scaling recipes is real-life fraction math.",
  };
}

function genPacks(tier) {
  const pair = choice([
    { a: "hot dogs", aPack: 10, aPrice: 429, b: "hot dog buns", bPack: 8, bPrice: 279 },
    { a: "burger patties", aPack: 6, aPrice: 899, b: "burger buns", bPack: 8, bPrice: 329 },
    { a: "juice boxes", aPack: 8, aPrice: 449, b: "bags of chips", bPack: 12, bPrice: 799 },
  ]);
  const guests = randInt(9, 24);
  const each = choice([1, 2]);
  const need = guests * each;
  const aPacks = Math.ceil(need / pair.aPack);
  const bPacks = Math.ceil(need / pair.bPack);
  const visual = `<div class="doc"><div class="doc-title">🎉 Party Shopping</div><table>
    <tr><th>Item</th><th class="num">Per pack</th><th class="num">Price</th></tr>
    <tr><td>${pair.a}</td><td class="num">${pair.aPack}</td><td class="num">${money(pair.aPrice)}</td></tr>
    <tr><td>${pair.b}</td><td class="num">${pair.bPack}</td><td class="num">${money(pair.bPrice)}</td></tr>
  </table><div class="doc-note">${guests} guests · each gets ${each} ${pair.a.replace(/s$/, "")}${each > 1 ? "s" : ""} and ${each} of the ${pair.b}</div></div>`;

  if (tier === "medium") {
    return {
      category: "planning",
      visualHTML: visual,
      promptText: `How many packs of ${pair.b} do you need to buy?`,
      inputs: [{ id: "p", label: "Packs", type: "number", min: 0, max: 100 }],
      check: (v) => Number(v.p) === bPacks,
      correctSummary: () => `You need ${need}. ${need} ÷ ${pair.bPack} = ${(need / pair.bPack).toFixed(2).replace(/\.00$/, "")}${need % pair.bPack ? ` → round UP to ${bPacks}` : ""} packs`,
      hint: "Find how many you need in total, divide by the pack size, and round UP — you can't buy part of a pack.",
      lesson: "When you can't buy part of something, always round up. Leftovers beat running out!",
    };
  }
  const total = aPacks * pair.aPrice + bPacks * pair.bPrice;
  return {
    category: "planning",
    visualHTML: visual,
    promptText: `What is the total cost for the ${pair.a} AND the ${pair.b}?`,
    inputs: [moneyInput("t", "Total ($)")],
    check: (v) => centsNear(v.t, total),
    correctSummary: () =>
      `Need ${need} of each. ${aPacks} pack${aPacks > 1 ? "s" : ""} of ${pair.a} (${money(aPacks * pair.aPrice)}) + ${bPacks} pack${bPacks > 1 ? "s" : ""} of ${pair.b} (${money(bPacks * pair.bPrice)}) = ${money(total)}`,
    hint: "For EACH item: total needed ÷ pack size, rounded up. Multiply packs by price, then add the two.",
    lesson: "The packs don't match, so you'll end up with leftovers. Party planners call that 'the hot dog problem.'",
  };
}

function genNutrition(tier) {
  const foods = [
    { name: "Potato Chips", size: "1 oz (about 15 chips)", servings: [2, 3, 4] },
    { name: "Fruit Soda (20 fl oz bottle)", size: "8 fl oz", servings: [2.5] },
    { name: "Trail Mix", size: "¼ cup", servings: [3, 4, 5] },
    { name: "Cookies", size: "3 cookies", servings: [2, 3, 4] },
  ];
  const food = choice(tier === "easy" ? foods.filter((f) => !f.servings.includes(2.5)) : foods);
  const servings = choice(food.servings);
  const cal = randInt(10, 25) * 10;
  const sugar = randInt(3, 20) * 2;
  const askSugar = tier !== "easy" && Math.random() < 0.5;
  const ans = askSugar ? sugar * servings : cal * servings;
  const visual = `<div class="doc" style="font-family:Helvetica,Arial,sans-serif; border:2px solid #111; max-width:260px">
    <div style="font-weight:900;font-size:1.4rem;border-bottom:6px solid #111">Nutrition Facts</div>
    <div style="font-size:0.8rem;margin:4px 0">${food.name}</div>
    <div><b>${servings} servings per container</b></div>
    <div style="border-bottom:6px solid #111;padding-bottom:4px">Serving size <b>${food.size}</b></div>
    <div style="display:flex;justify-content:space-between;font-weight:900;font-size:1.3rem;border-bottom:3px solid #111">Calories<span>${cal}</span></div>
    <div style="border-bottom:1px solid #111">Total Sugars <b>${sugar}g</b></div>
    <div class="fine-print" style="margin-top:4px">Amounts are per serving.</div></div>`;
  return {
    category: "planning",
    visualHTML: visual,
    promptText: `You eat or drink the WHOLE container. How many ${askSugar ? "grams of sugar" : "calories"} is that?`,
    inputs: [{ id: "a", label: askSugar ? "Grams" : "Calories", type: "number", min: 0, max: 10000 }],
    check: (v) => numNear(v.a, ans, 0.01),
    correctSummary: () => `${servings} servings × ${askSugar ? sugar + "g" : cal} = ${ans}${askSugar ? "g" : " calories"}`,
    hint: "The label's numbers are for ONE serving. Multiply by the number of servings in the container.",
    lesson: "A single bag or bottle is often more than one serving — that fine print at the top of the label matters!",
  };
}

// ---------- Pools ----------

const POOLS = {
  easy: [genReceiptTotal, genTip, genPaycheck, genSavingsGoal, genNutrition, genWarranty, genBusSchedule, genProcedure, genLifeFact, genLifeFact],
  medium: [
    genReceiptTotal, genUnitPrice, genTip, genPaycheck, genSavingsGoal, genBudget,
    genReturnPolicy, genWarranty, genPromo,
    genProcedure, genLifeFact,
    genBusSchedule, genRecipeScale, genPacks, genNutrition,
  ],
  hard: [
    genReceiptTotal, genUnitPrice, genTip, genPaycheck, genBudget, genCreditCard,
    genReturnPolicy, genReturnPolicy, genWarranty, genPromo, genPromo,
    genProcedure, genLifeFact,
    genBusSchedule, genRecipeScale, genPacks,
  ],
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
  state.answered = false;
  document.getElementById("feedback").textContent = "";
  document.getElementById("feedback").className = "feedback";
  document.getElementById("newProblemBtn").textContent = "🔄 New Problem";
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
      const cls = "num-input" + (inp.cls ? " " + inp.cls : "");
      if (inp.type === "select") {
        const opts = [`<option value="" selected disabled>— choose —</option>`]
          .concat(inp.options.map((o, i) => `<option value="${i}">${o}</option>`))
          .join("");
        return `<label>${inp.label}<select id="inp_${inp.id}" class="${cls}">${opts}</select></label>`;
      }
      const step = inp.step ? ` step="${inp.step}"` : "";
      return `<label>${inp.label}<input type="number" inputmode="decimal" id="inp_${inp.id}" class="${cls}" min="${inp.min}" max="${inp.max}"${step} /></label>`;
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
  if (state.answered) return;
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
  state.answered = true;
  document.getElementById("submitBtn").disabled = true;
  const lesson = p.lesson ? `<div class="lesson">💡 ${p.lesson}</div>` : "";

  if (p.check(values)) {
    showFeedback(`Correct! ${p.correctSummary()}.${lesson}`, true);
    popCard();
    addPoints(Math.round(DIFFICULTY[state.difficulty].points * (state.mode === "free" ? 1.15 : 1)));
    registerSolve(p.category);
    if (stats.streak > 0 && stats.streak % 5 === 0) launchConfetti();
    pendingAdvanceTimeout = setTimeout(newProblem, p.lesson ? 4500 : 1800);
  } else {
    // No auto-advance on a miss: the explanation is the point, so the kid moves on when ready.
    showFeedback(`Not quite. ${p.correctSummary()}.${lesson}`, false);
    shakeCard();
    registerMiss();
    document.getElementById("newProblemBtn").textContent = "Next Problem ›";
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
