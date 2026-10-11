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

  const unitRounded = Math.round(better.unitCents);

  return {
    category: "money",
    visualHTML: visual,
    promptText: "Which package is the better deal?",
    inputs: [selectInput("pick", "Better deal", ["Size A", "Size B"])],
    check: (v) => Number(v.pick) === betterIdx,
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







// Open-ended: many valid budgets, so it's graded by rules instead of one answer.
function genBuildBudget(tier) {
  const JOBS = ["Junior Mechanic", "Dental Assistant", "Bank Teller", "Electrician Apprentice", "Pastry Chef", "Office Coordinator"];
  for (let tries = 0; tries < 200; tries++) {
    const gross = randInt(28, 48) * 100;
    const taxPct = choice([15, 18, 20, 22]);
    const taxes = Math.round((gross * taxPct) / 100);
    const net = gross - taxes;
    const rentCap = Math.floor(net * 0.3);
    const apts = [
      { name: "Room in a shared house (2 roommates)", rent: randInt(10, 15) * 50 },
      { name: "Small studio apartment", rent: randInt(16, 24) * 50 },
      { name: "Nice 1-bedroom with a balcony", rent: randInt(26, 36) * 50 },
    ];
    const bills = [["Phone", randInt(4, 8) * 5], ["Internet", randInt(10, 15) * 5], ["Electric & gas", randInt(12, 24) * 5], ["Health insurance", randInt(10, 30) * 10]];
    const billsTotal = sum(bills.map((b) => b[1]));
    const transport = [
      { name: "Monthly bus pass", cost: randInt(6, 12) * 10 },
      { name: "Car (payment + insurance + gas)", cost: randInt(40, 65) * 10 },
    ];
    const foodMin = randInt(25, 35) * 10;
    const saveMin = Math.ceil(net * 0.1);
    const okApts = apts.filter((a) => a.rent <= rentCap);
    if (!okApts.length || apts[2].rent <= rentCap) continue;
    const cheapest = okApts[0].rent + billsTotal + transport[0].cost + foodMin + saveMin;
    if (net - cheapest < 150) continue;

    const ex = { taxes, housing: okApts[okApts.length - 1].rent, bills: billsTotal, transport: transport[0].cost, food: foodMin + 50, savings: saveMin };
    const exMin = { ...ex, housing: okApts[0].rent, food: foodMin };
    const pick = net - (ex.housing + ex.bills + ex.transport + ex.food + ex.savings) >= 0 ? ex : exMin;
    const spare = net - (pick.housing + pick.bills + pick.transport + pick.food + pick.savings);
    pick.savings += Math.floor(spare / 2);
    pick.fun = spare - Math.floor(spare / 2);
    const example = { ...pick };

    const payLine =
      tier === "hard"
        ? `Salary: <b>${money(gross * 1200)} per year</b> (paid monthly)`
        : `Gross pay: <b>${money(gross * 100)} per month</b>`;
    const visual = `<div class="doc"><div class="doc-title">🏙️ Your First Apartment</div>
      <div>💼 Job: ${choice(JOBS)}</div><div>${payLine}</div><div>🧾 Taxes withheld: <b>${taxPct}%</b> of gross</div>
      <div class="doc-note"><b>Apartments</b> (pick one)<br>${apts.map((a) => `${a.name} — ${money(a.rent * 100)}/mo`).join("<br>")}</div>
      <div class="doc-note"><b>Getting to work</b> (pick one)<br>${transport.map((t) => `${t.name} — ${money(t.cost * 100)}/mo`).join("<br>")}</div>
      <div class="doc-note"><b>Monthly bills</b> (you pay all)<br>${bills.map(([n, c]) => `${n} — ${money(c * 100)}`).join("<br>")}</div>
      <div class="fine-print" style="margin-top:10px"><b>Rules of thumb:</b><ul>
        <li>Housing: no more than <b>30% of take-home pay</b> (pay after taxes)</li>
        <li>Food: at least <b>${money(foodMin * 100)}</b> for groceries</li>
        <li>Savings: at least <b>10% of take-home pay</b></li>
        <li>Every dollar gets a job: all the boxes must add up to exactly your <b>gross</b> pay</li></ul></div></div>`;

    const keys = ["taxes", "housing", "bills", "transport", "food", "savings", "fun"];
    const labels = ["Taxes", "Housing", "Bills", "Transportation", "Food", "Savings", "Fun"];
    const toNum = (x) => parseFloat(String(x).replace(/[$,\s]/g, ""));
    const rules = (v) => {
      const n = {};
      keys.forEach((k) => (n[k] = toNum(v[k])));
      const total = sum(keys.map((k) => n[k] || 0));
      return [
        [Math.abs(n.taxes - taxes) < 0.005, `Taxes are ${taxPct}% of ${money(gross * 100)} = ${money(taxes * 100)}`],
        [apts.some((a) => a.rent === n.housing), "Housing must be the rent of one of the apartments"],
        [n.housing <= rentCap, `Housing must be at most 30% of take-home (${money(net * 100)} × 0.30 = ${money(rentCap * 100)})`],
        [Math.abs(n.bills - billsTotal) < 0.005, `Bills add up to ${money(billsTotal * 100)}`],
        [transport.some((t) => t.cost === n.transport), "Transportation must be one of the two options"],
        [n.food >= foodMin, `Food must be at least ${money(foodMin * 100)}`],
        [n.savings >= saveMin - 0.005, `Savings must be at least 10% of take-home (${money(saveMin * 100)})`],
        [n.fun >= 0, "Fun money can't be negative"],
        [Math.abs(total - gross) < 0.005, `Everything must add up to ${money(gross * 100)} (yours adds up to ${money(Math.round(total * 100))})`],
      ];
    };

    return {
      category: "money",
      visualHTML: visual,
      promptText:
        tier === "hard"
          ? "Build your MONTHLY budget. First figure out your monthly gross pay from the salary — then give every dollar a job."
          : "Build your monthly budget. Give every dollar a job!",
      inputs: keys.map((k, i) => ({ id: k, label: labels[i] + " ($)", type: "number", min: 0, max: 100000, step: 0.01, cls: "money" })),
      live: (v) => {
        const total = sum(keys.map((k) => toNum(v[k]) || 0));
        const left = gross - total;
        return `Assigned ${money(Math.round(total * 100))} of ${money(gross * 100)} — ${
          Math.abs(left) < 0.005 ? "✅ every dollar has a job" : left > 0 ? `${money(Math.round(left * 100))} still needs a job` : `⚠️ over by ${money(Math.round(-left * 100))}`
        }`;
      },
      example,
      check: (v) => rules(v).every((r) => r[0]),
      correctSummary: (v) => {
        const r = v ? rules(v) : [];
        const failed = r.filter((x) => !x[0]);
        if (v && !failed.length) return `Your budget follows every rule. You have ${money(Math.round(toNum(v.fun) * 100))} a month for fun and save ${money(Math.round(toNum(v.savings) * 100))}`;
        return `${failed.map((x) => "❌ " + x[1]).join("<br>")}<br>One budget that works: ${keys.map((k, i) => `${labels[i]} ${money(example[k] * 100)}`).join(", ")}`;
      },
      hint:
        (tier === "hard" ? `Monthly gross = yearly salary ÷ 12. ` : "") +
        "Start with what's fixed: taxes, then bills. Pick the apartment and transportation that fit. Then food and savings minimums. Whatever is left is fun money!",
      lesson:
        "This is called a zero-based budget — every dollar is assigned before the month starts. It doesn't mean spending it all: savings counts as a job!",
    };
  }
  return genBuildBudget(tier);
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

  const policy = `<div class="doc fine-print"><div class="doc-title">${store} Return Policy</div><ul>
    <li>Most items may be returned within <b>${window} days</b> of purchase for a full refund to your original payment.</li>
    <li>No receipt? We'll offer <b>store credit</b> instead of a refund.</li>
    <li>Opened electronics are subject to a <b>${fee}% restocking fee</b>.</li>
    <li>Clearance items are <b>FINAL SALE</b> — no returns or exchanges.</li>
    <li>No returns after ${window} days.</li></ul></div>`;
  const scenario = `<div class="scenario">You want to return a <b>${name}</b> that cost ${money(price)}. ${timing} ${receipt} ${openedTxt} ${choice(DISTRACTORS)}</div>`;


  const why = {
    clean: "Within the time limit, receipt in hand, nothing special — full refund",
    opened: `It's opened electronics, so the ${fee}% restocking fee comes out of your refund`,
    noreceipt: "No receipt means store credit instead of your money back",
    late: `${days} days is past the ${window}-day window — no return`,
    final: "Clearance items are final sale — no return, no matter what",
  }[kind];

  return {
    category: "fineprint",
    visualHTML: policy + scenario,
    promptText: "Read the policy. What happens when you try to return it?",
    inputs: [selectInput("o", "What happens?", outcomes)],
    check: (v) => Number(v.o) === ans,
    correctSummary: () => why,
    hint:
      tier === "hard"
        ? "First figure out how long ago you bought it (use a calendar if you need to — months have 28 to 31 days). Then go down the policy rule by rule. Some details in the story don't matter at all."
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

function genPromo(tier) {
  const kind = choice(tier === "medium" ? ["bogo", "oneItem", "exclusions"] : ["bogo", "oneItem", "exclusions", "shipping"]);

  if (kind === "bogo") {
    const thing = choice([["T-shirt", "T-shirt"], ["pair of jeans", "pair of jeans"], ["video game", "video game"]]);
    const colors = shuffle(["red", "blue", "black", "green"]);
    let a = randInt(15, 60) * 100 - 2;
    let b = randInt(10, 50) * 100 - 2;
    if (a === b) b -= 300;
    const opts = [`The ${colors[0]} ${thing[0]} (${money(a)})`, `The ${colors[1]} ${thing[1]} (${money(b)})`, "Both — 50% off everything", "Whichever one you choose"];
    const ans = a < b ? 0 : 1;
    return {
      category: "fineprint",
      visualHTML: `<div class="doc" style="text-align:center"><b>Buy one, get one 50% off!</b><br><span class="fine-print">*Discount applies to the lower-priced item.</span></div>
        <div class="scenario">You're buying a ${colors[0]} ${thing[0]} for ${money(a)} and a ${colors[1]} ${thing[1]} for ${money(b)}.</div>`,
      promptText: "Which item gets the 50% discount?",
      inputs: [selectInput("p", "Discounted item", opts)],
      check: (v) => Number(v.p) === ans,
      correctSummary: () => `The fine print says the LOWER-priced item — that's ${opts[ans].replace(/^The /, "the ")}`,
      hint: "The answer is hiding in the tiny print under the big sign.",
      lesson: "That asterisk (*) always means 'read the fine print.' Here it means the store picks which item is discounted — and it's never the expensive one.",
    };
  }
  if (kind === "oneItem") {
    const names = shuffle(["Headphones", "Hoodie", "Water bottle", "Phone charger", "Board game", "Sneakers"]).slice(0, 3);
    const prices = shuffle([randInt(10, 20) * 100 - 1, randInt(22, 35) * 100 - 1, randInt(40, 70) * 100 - 1]);
    const opts = names.map((n, i) => `${n} (${money(prices[i])})`);
    const ans = prices.indexOf(Math.max(...prices));
    return {
      category: "fineprint",
      visualHTML: `<div class="doc" style="text-align:center"><b>25% OFF any ONE item!</b><br><span class="fine-print">*Limit one item per purchase.</span></div>
        <div class="scenario">You're buying: ${opts.join(", ")}.</div>`,
      promptText: "Which item should you use the coupon on to save the MOST money?",
      inputs: [selectInput("p", "Use it on", opts)],
      check: (v) => Number(v.p) === ans,
      correctSummary: () => `${opts[ans]} — a percent off saves the most on the most expensive item`,
      hint: "25% of a big number is more than 25% of a small number.",
      lesson: "Percent-off coupons → use them on the priciest item. Dollar-off coupons → it doesn't matter which item.",
    };
  }
  if (kind === "exclusions") {
    const excluded = choice([["Gift card", 2500], ["Clearance lamp", 1500], ["Gift card", 2000]]);
    const regular = randInt(30, 52) * 100 + choice([0, 49, 99]);
    const sub = regular + excluded[1];
    const ok = regular >= 5000;
    return {
      category: "fineprint",
      visualHTML: `<div class="doc" style="text-align:center"><b>$10 OFF orders of $50+</b><br><span class="fine-print">*Minimum purchase of $50.00 before tax. Gift cards and clearance items do not count toward the minimum.</span></div>
        <div class="doc receipt"><table><tr><td>Regular-price items</td><td class="num">${money(regular)}</td></tr><tr><td>${excluded[0]}</td><td class="num">${money(excluded[1])}</td></tr>
        <tr class="total-row"><td>Subtotal</td><td class="num">${money(sub)}</td></tr></table></div>`,
      promptText: "Your subtotal is over $50. Does the $10 coupon work?",
      inputs: [selectInput("p", "Coupon works?", ["Yes — the subtotal is over $50", `No — the ${excluded[0].toLowerCase()} doesn't count`])],
      check: (v) => Number(v.p) === (ok ? 0 : 1),
      correctSummary: () => (ok ? `Yes — even without the ${excluded[0].toLowerCase()}, the regular items reach $50` : `No — take out the ${excluded[0].toLowerCase()} and only ${money(regular)} counts, which is under $50`),
      hint: "Read the second sentence of the fine print. What's left if you take out the things that don't count?",
      lesson: "Coupon exclusions are everywhere. Stores advertise the big number and hide the rules in the small print.",
    };
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
    hint: "Does adding the socks actually reach $35? Compare both totals.",
    lesson: "Free-shipping minimums are designed to make you spend more. Sometimes it's worth it — but always check.",
  };
}

function genPayStub(tier) {
  const rate = randInt(14, 22) * 100 + choice([0, 25, 50]);
  const hours = randInt(30, 40);
  const gross = rate * hours;
  const lines = [
    ["Federal income tax", Math.round(gross * 0.1)],
    ["State income tax", Math.round(gross * 0.04)],
    ["Social Security", Math.round(gross * 0.062)],
    ["Medicare", Math.round(gross * 0.0145)],
    ["Health insurance", choice([2800, 3500, 4200])],
  ];
  const deductions = sum(lines.map((l) => l[1]));
  const net = gross - deductions;
  const period = randInt(5, 20);
  const ytd = (c) => c * period;
  const company = choice(["Riverside Grocery", "Summit Hardware", "Lakeview Pool & Fitness", "Copper Kettle Café"]);

  const showYtd = tier !== "easy";
  const row = (label, c, bold) =>
    `<tr${bold ? ' class="total-row"' : ""}><td>${label}</td><td class="num">${money(c)}</td>${showYtd ? `<td class="num">${money(ytd(c))}</td>` : ""}</tr>`;
  const visual = `<div class="doc"><div class="doc-title">💵 ${company}</div><div class="doc-sub">Pay stub · ${hours} hours × ${money(rate)}/hr${showYtd ? ` · Paycheck #${period} this year` : ""}</div>
    <table><tr><th></th><th class="num">This check</th>${showYtd ? `<th class="num">Year to date</th>` : ""}</tr>
    ${row("<b>Gross pay</b>", gross)}${lines.map(([n, c]) => row(n, c)).join("")}${row("Total deductions", deductions)}${row("NET PAY", net, true)}</table></div>`;

  const qs = [
    { q: "Which amount actually gets deposited into your bank account this paycheck?", a: net, why: "Net pay is what's left after every deduction — that's what you actually get" },
    { q: "How much did you earn this paycheck BEFORE anything was taken out?", a: gross, why: "That's gross pay — your hours times your hourly rate, before deductions" },
    { q: "How much was taken out of this paycheck in total?", a: deductions, why: "Look for the 'Total deductions' line" },
  ];
  if (showYtd) {
    qs.push({ q: "How much have you paid in Social Security so far THIS YEAR?", a: ytd(lines[2][1]), why: "'Year to date' (YTD) adds up every paycheck since January" });
    qs.push({ q: "How much have you taken home in total so far this year?", a: ytd(net), why: "Net pay, in the year-to-date column" });
  }
  const pick = choice(tier === "hard" ? qs.slice(2) : qs);
  const pool = [gross, net, deductions, ...lines.map((l) => l[1])].concat(showYtd ? [ytd(gross), ytd(net), ytd(lines[2][1]), ytd(deductions)] : []);
  const distractors = shuffle([...new Set(pool.filter((c) => c !== pick.a))]).slice(0, 3);
  const opts = shuffle([pick.a, ...distractors]);
  return {
    category: "money",
    visualHTML: visual,
    promptText: pick.q,
    inputs: [selectInput("a", "Amount", opts.map(money))],
    check: (v) => Number(v.a) === opts.indexOf(pick.a),
    correctSummary: () => `${money(pick.a)}. ${pick.why}`,
    hint: "Gross = before deductions. Net = after. 'Year to date' = everything since January.",
    lesson: "Social Security and Medicare (often labeled FICA) come out of almost every US paycheck — they fund benefits for retirees.",
  };
}

const LABEL_FOODS = [
  { name: "Potato Chips", size: "1 oz (about 15 chips)" },
  { name: "Fruit Soda", size: "8 fl oz" },
  { name: "Canned Chicken Noodle Soup", size: "1 cup" },
  { name: "Granola Bars", size: "1 bar" },
  { name: "Frozen Burrito", size: "1 burrito" },
  { name: "Trail Mix", size: "¼ cup" },
];

function genNutritionLabel(tier) {
  const food = choice(LABEL_FOODS);
  const servings = choice([2, 2.5, 3, 4, 6]);
  const cal = randInt(10, 30) * 10;
  const nutrients = [
    ["Total Fat", randInt(1, 18) + "g", randInt(1, 25)],
    ["Sodium", randInt(5, 90) * 10 + "mg", randInt(1, 40)],
    ["Total Sugars", randInt(0, 30) + "g", null],
    ["Protein", randInt(1, 20) + "g", null],
    ["Fiber", randInt(0, 8) + "g", randInt(0, 30)],
  ];
  // keep sodium's %DV clearly in the low (≤5) or high (≥20) zone, or clearly in between
  const sodiumZone = choice(["low", "mid", "high"]);
  nutrients[1][2] = sodiumZone === "low" ? randInt(1, 5) : sodiumZone === "mid" ? randInt(8, 16) : randInt(20, 40);
  nutrients[1][1] = Math.round((nutrients[1][2] / 100) * 2300 / 10) * 10 + "mg";

  const visual = `<div class="doc" style="font-family:Helvetica,Arial,sans-serif; border:2px solid #111; max-width:270px">
    <div style="font-weight:900;font-size:1.4rem;border-bottom:6px solid #111">Nutrition Facts</div>
    <div style="font-size:0.8rem;margin:4px 0">${food.name}</div>
    <div><b>${servings} servings per container</b></div>
    <div style="border-bottom:6px solid #111;padding-bottom:4px">Serving size <b>${food.size}</b></div>
    <div style="display:flex;justify-content:space-between;font-weight:900;font-size:1.3rem;border-bottom:3px solid #111">Calories<span>${cal}</span></div>
    <div style="text-align:right;font-size:0.7rem;font-weight:700">% Daily Value*</div>
    ${nutrients.map(([n, amt, dv]) => `<div style="display:flex;justify-content:space-between;border-bottom:1px solid #111"><span><b>${n}</b> ${amt}</span><span>${dv === null ? "" : dv + "%"}</span></div>`).join("")}
    <div class="fine-print" style="margin-top:4px">*% Daily Value shows how much a nutrient in one serving adds to a daily diet. 5% DV or less is LOW. 20% DV or more is HIGH.</div></div>`;

  const qs = [
    { q: "How many servings are in this whole package?", opts: [String(servings), "1", String(servings * 2), String(cal)], a: String(servings), why: `The label says ${servings} servings per container`, tier: 0 },
    { q: "What is ONE serving?", opts: [food.size, "The whole package", "Half the package", "100 grams"], a: food.size, why: `Serving size: ${food.size}`, tier: 0 },
    {
      q: "Is this food low or high in sodium?",
      opts: ["Low in sodium", "Neither low nor high", "High in sodium"],
      a: { low: "Low in sodium", mid: "Neither low nor high", high: "High in sodium" }[sodiumZone],
      why: `Sodium is ${nutrients[1][2]}% DV. The fine print says 5% or less is low and 20% or more is high`,
      tier: 1,
    },
    {
      q: "The calories on the label are for…",
      opts: ["One serving", "The whole package", "One bite", "A whole day"],
      a: "One serving",
      why: `They're per serving — eat the whole thing and you'd get ${servings} times as much`,
      tier: 0,
    },
  ];
  const usable = qs.filter((q) => (tier === "easy" ? q.tier === 0 : true));
  const pick = tier === "easy" ? choice(usable) : choice([...usable, qs[2]]);
  const opts = pick.q.startsWith("Is this food") ? pick.opts : shuffle([...new Set(pick.opts)]);
  return {
    category: "planning",
    visualHTML: visual,
    promptText: pick.q,
    inputs: [selectInput("a", "Answer", opts)],
    check: (v) => opts[Number(v.a)] === pick.a,
    correctSummary: () => `${pick.a}. ${pick.why}`,
    hint: "Everything you need is printed on the label — including the fine print at the bottom.",
    lesson: "A single bag or bottle is often more than one serving. The top of the label is the most important fine print in the grocery store.",
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





// ---------- Pools ----------

const POOLS = {
  easy: [genPayStub, genNutritionLabel, genReturnPolicy, genWarranty, genWarranty, genBusSchedule, genProcedure, genProcedure, genLifeFact, genLifeFact],
  medium: [
    genUnitPrice, genBuildBudget, genPayStub,
    genReturnPolicy, genWarranty, genPromo, genPromo,
    genProcedure, genLifeFact,
    genBusSchedule, genNutritionLabel,
  ],
  hard: [
    genUnitPrice, genBuildBudget, genBuildBudget, genPayStub,
    genReturnPolicy, genReturnPolicy, genWarranty, genPromo, genPromo,
    genProcedure, genLifeFact,
    genBusSchedule,
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
  const liveHtml = p.live ? `<div class="live-total" id="liveTotal"></div>` : "";
  controlRow.innerHTML = `${promptHtml}<div class="input-row">${inputsHtml}</div>${liveHtml}<button class="btn primary" id="submitBtn">Check Answer</button>`;
  if (p.live) {
    const update = () => {
      const v = {};
      p.inputs.forEach((inp) => (v[inp.id] = document.getElementById(`inp_${inp.id}`).value));
      document.getElementById("liveTotal").innerHTML = p.live(v);
    };
    controlRow.querySelectorAll("input").forEach((inp) => inp.addEventListener("input", update));
    update();
  }

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
    showFeedback(`Correct! ${p.correctSummary(values)}.${lesson}`, true);
    popCard();
    addPoints(Math.round(DIFFICULTY[state.difficulty].points * (state.mode === "free" ? 1.15 : 1)));
    registerSolve(p.category);
    if (stats.streak > 0 && stats.streak % 5 === 0) launchConfetti();
    pendingAdvanceTimeout = setTimeout(newProblem, p.lesson ? 4500 : 1800);
  } else {
    // No auto-advance on a miss: the explanation is the point, so the kid moves on when ready.
    showFeedback(`Not quite. ${p.correctSummary(values)}.${lesson}`, false);
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
