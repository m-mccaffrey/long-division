// ---------- Config ----------

const DIFFICULTY = {
  easy: { label: "Easy", points: 10 },
  medium: { label: "Medium", points: 18 },
  hard: { label: "Hard", points: 32 },
};

const BADGE_DEFS = [
  { id: "streak_5", label: "Streak x5", check: (s) => s.bestStreak >= 5 },
  { id: "streak_10", label: "Streak x10", check: (s) => s.bestStreak >= 10 },
  { id: "streak_20", label: "Unstoppable", check: (s) => s.bestStreak >= 20 },
  { id: "hard_solve", label: "Hard Mode Hero", check: (s) => s.hardSolved >= 1 },
  { id: "addsub_10", label: "Plus & Minus Pro", check: (s) => s.addsubSolved >= 10 },
  { id: "muldiv_10", label: "Groups Guru", check: (s) => s.muldivSolved >= 10 },
  { id: "multistep_10", label: "Parentheses Pro", check: (s) => s.multistepSolved >= 10 },
  { id: "extra_5", label: "Distraction Detective", check: (s) => s.extraSolved >= 5 },
];

const STORAGE_KEY = "numberSentenceQuestState";

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
    addsubSolved: 0,
    muldivSolved: 0,
    multistepSolved: 0,
    extraSolved: 0,
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
  tries: 0,
  done: false,
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

function registerSolve(p) {
  stats.totalSolved += 1;
  stats.streak += 1;
  if (stats.streak > stats.bestStreak) stats.bestStreak = stats.streak;
  if (state.difficulty === "hard") stats.hardSolved += 1;
  stats[p.category + "Solved"] += 1;
  if (p.extra) stats.extraSolved += 1;
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
// Expressions: build, parse, print, evaluate, compare
// ================================================================

const N = (v) => (typeof v === "number" ? { t: "n", v } : v);
const add = (l, r) => ({ t: "+", l: N(l), r: N(r) });
const sub = (l, r) => ({ t: "-", l: N(l), r: N(r) });
const mul = (l, r) => ({ t: "*", l: N(l), r: N(r) });
const div = (l, r) => ({ t: "/", l: N(l), r: N(r) });

function evaluate(a) {
  switch (a.t) {
    case "n": return a.v;
    case "+": return evaluate(a.l) + evaluate(a.r);
    case "-": return evaluate(a.l) - evaluate(a.r);
    case "*": return evaluate(a.l) * evaluate(a.r);
    case "/": return evaluate(a.l) / evaluate(a.r);
  }
}

// Canonical form that treats + and × as order-free and folds subtraction/division
// into signed terms, so 20 − 3 − 5 and 20 − (3 + 5) compare equal.
function norm(a) {
  if (a.t === "n") return String(a.v);
  const additive = a.t === "+" || a.t === "-";
  const [plus, minus, tag] = additive ? ["+", "-", "S"] : ["*", "/", "P"];
  const parts = [];
  (function walk(n, positive) {
    if (n.t === plus) {
      walk(n.l, positive);
      walk(n.r, positive);
    } else if (n.t === minus) {
      walk(n.l, positive);
      walk(n.r, !positive);
    } else {
      parts.push((positive ? "+" : "-") + norm(n));
    }
  })(a, true);
  return `${tag}(${parts.sort().join(",")})`;
}

const PREC = { "+": 1, "-": 1, "*": 2, "/": 2 };
const SYM = { "+": "+", "-": "−", "*": "×", "/": "÷" };

function fmt(a, parentPrec = 0, rightSide = false, parentOp = null) {
  if (a.t === "n") return String(a.v);
  const p = PREC[a.t];
  const s = `${fmt(a.l, p, false, a.t)} ${SYM[a.t]} ${fmt(a.r, p, true, a.t)}`;
  const needParens = p < parentPrec || (p === parentPrec && rightSide && (parentOp === "-" || parentOp === "/"));
  return needParens ? `(${s})` : s;
}

function tokenize(str) {
  const s = str
    .replace(/[−–—]/g, "-")
    .replace(/[×xX*·•]/g, "*")
    .replace(/[÷:]/g, "/")
    .replace(/(\d),(?=\d{3}\b)/g, "$1")
    .replace(/\$/g, "");
  const tokens = [];
  let i = 0;
  while (i < s.length) {
    const c = s[i];
    if (/\s/.test(c)) {
      i++;
    } else if (/\d|\./.test(c)) {
      let j = i;
      while (j < s.length && /[\d.]/.test(s[j])) j++;
      const v = parseFloat(s.slice(i, j));
      if (isNaN(v)) return null;
      tokens.push({ k: "n", v });
      i = j;
    } else if ("+-*/()=".includes(c)) {
      tokens.push({ k: c });
      i++;
    } else {
      return null;
    }
  }
  // "3(4 + 5)" and "(2 + 3)(4)" mean multiplication
  const out = [];
  tokens.forEach((t, idx) => {
    const prev = tokens[idx - 1];
    if (t.k === "(" && prev && (prev.k === "n" || prev.k === ")")) out.push({ k: "*" });
    out.push(t);
  });
  return out;
}

function parseSide(tokens) {
  let pos = 0;
  const peek = () => tokens[pos];
  function expr() {
    let node = term();
    while (peek() && (peek().k === "+" || peek().k === "-")) {
      const op = tokens[pos++].k;
      node = { t: op, l: node, r: term() };
    }
    return node;
  }
  function term() {
    let node = factor();
    while (peek() && (peek().k === "*" || peek().k === "/")) {
      const op = tokens[pos++].k;
      node = { t: op, l: node, r: factor() };
    }
    return node;
  }
  function factor() {
    const t = tokens[pos++];
    if (!t) throw new Error("end");
    if (t.k === "n") return { t: "n", v: t.v };
    if (t.k === "(") {
      const node = expr();
      if (!peek() || peek().k !== ")") throw new Error("paren");
      pos++;
      return node;
    }
    throw new Error("unexpected");
  }
  const node = expr();
  if (pos !== tokens.length) throw new Error("trailing");
  return node;
}

function parseEquation(str) {
  const tokens = tokenize(str);
  if (!tokens) return { error: "Use only numbers and the symbols + − × ÷ ( ) =." };
  const eqCount = tokens.filter((t) => t.k === "=").length;
  if (eqCount !== 1) return { error: "A number sentence needs exactly one = sign, like 4 + 3 = 7." };
  const at = tokens.findIndex((t) => t.k === "=");
  try {
    return { left: parseSide(tokens.slice(0, at)), right: parseSide(tokens.slice(at + 1)) };
  } catch (e) {
    return { error: "Hmm, I can't read that. Check for a missing number or parenthesis." };
  }
}

const near = (a, b) => Math.abs(a - b) < 1e-9;

// accept: list of [sideA, sideB] pairs that model the story (either order of sides is fine).
function grade(p, text) {
  const eq = parseEquation(text);
  if (eq.error) return { ok: false, kind: "parse", msg: eq.error };
  const L = norm(eq.left);
  const R = norm(eq.right);
  const lv = evaluate(eq.left);
  const rv = evaluate(eq.right);
  for (const [a, b] of p.accept) {
    const A = norm(a);
    const B = norm(b);
    if ((L === A && R === B) || (L === B && R === A)) return { ok: true };
  }
  // Right setup, wrong arithmetic: one side matches a story expression, the other is just a number.
  for (const [a, b] of p.accept) {
    for (const [side, other, otherVal] of [[L, eq.right, rv], [R, eq.left, lv]]) {
      for (const story of [a, b]) {
        if (story.t !== "n" && side === norm(story) && other.t === "n" && !near(evaluate(story), otherVal)) {
          return { ok: false, kind: "math", msg: `Your sentence tells the story — nice! But check the math: ${fmt(story)} isn't ${fmt(other)}.` };
        }
      }
    }
  }
  // Same numbers and operations as a story expression that needs parentheses → they just left the parentheses out.
  const pieces = (ast) => fmt(ast).replace(/[()]/g, "").split(" ").sort().join(" ");
  for (const [a, b] of p.accept) {
    for (const story of [a, b]) {
      if (story.t !== "n" && fmt(story).includes("(") && (pieces(eq.left) === pieces(story) || pieces(eq.right) === pieces(story))) {
        return { ok: false, kind: "parens", msg: "So close! You have the right numbers and operations, but you need parentheses ( ) to show which part to do first." };
      }
    }
  }
  if (near(lv, rv)) {
    return { ok: false, kind: "story", msg: "That's a true number sentence, but it doesn't tell this story. Which numbers matter, and what's happening to them?" };
  }
  return { ok: false, kind: "wrong", msg: "Not quite. Read the story again — what's happening to the numbers?" };
}

// ================================================================
// Story pieces
// ================================================================

const NAMES = ["Mia", "Leo", "Ava", "Noah", "Zoe", "Eli", "Maya", "Sam", "Nora", "Max", "Ivy", "Owen", "Ruby", "Jack", "Lily", "Ben"];
const THINGS = [
  ["stickers", "⭐"], ["marbles", "🔵"], ["cookies", "🍪"], ["baseball cards", "⚾"], ["apples", "🍎"],
  ["crayons", "🖍️"], ["seashells", "🐚"], ["books", "📚"], ["toy cars", "🚗"], ["balloons", "🎈"],
  ["pencils", "✏️"], ["rocks", "🪨"], ["acorns", "🌰"], ["beads", "📿"],
];
const EXTRA_FACTS = [
  (n) => `${n} is ${num(randInt(7, 11))} years old.`,
  (n) => `It was ${num(randInt(2, 6))} o'clock in the afternoon.`,
  (n) => `${n} lives at house number ${num(randInt(12, 98))}.`,
  (n) => `${n}'s little brother is ${num(randInt(3, 6))}.`,
  (n) => `There were ${num(randInt(2, 9))} dogs barking outside.`,
];

const num = (v) => `<span class="story-num">${v}</span>`;
const twoNames = () => shuffle(NAMES).slice(0, 2);

function story(emoji, sentences, question, extraFor) {
  const parts = [...sentences];
  let extra = false;
  if (extraFor) {
    parts.splice(randInt(1, parts.length), 0, choice(EXTRA_FACTS)(extraFor));
    extra = true;
  }
  return {
    html: `<div class="story-card"><div class="story-emoji">${emoji}</div>${parts.join(" ")}<span class="story-question">${question}</span></div>`,
    extra,
  };
}

function problem(category, st, accept, hint) {
  const [a, b] = accept[0];
  return {
    category,
    visualHTML: st.html,
    extra: st.extra,
    accept,
    answerText: `${fmt(a)} = ${fmt(b)}`,
    altText: accept.length > 1 ? accept.slice(1).map(([x, y]) => `${fmt(x)} = ${fmt(y)}`) : [],
    hint,
  };
}

// ---------- Easy: + and − ----------

function genJoin() {
  const [n] = twoNames();
  const [it, e] = choice(THINGS);
  const a = randInt(3, 20), b = randInt(2, 15), c = a + b;
  const st = choice([
    () => story(e, [`${n} has ${num(a)} ${it}.`, `Then ${n} gets ${num(b)} more.`], `How many ${it} does ${n} have now?`),
    () => story(e, [`There are ${num(a)} ${it} on the table and ${num(b)} ${it} in a bag.`], `How many ${it} are there altogether?`),
  ])();
  return problem("addsub", st, [[add(a, b), N(c)]], "When things are put together or more are added, the total gets bigger — that's adding.");
}

function genSeparate() {
  const [n] = twoNames();
  const [it, e] = choice(THINGS);
  const a = randInt(8, 30), b = randInt(2, a - 2), r = a - b;
  const st = choice([
    () => story(e, [`${n} had ${num(a)} ${it}.`, `${n} gave ${num(b)} of them to a friend.`], `How many ${it} does ${n} have left?`),
    () => story(e, [`There were ${num(a)} ${it} in a box.`, `${n} took out ${num(b)}.`], `How many ${it} are still in the box?`),
  ])();
  return problem("addsub", st, [[sub(a, b), N(r)]], "“Gave away,” “took out,” and “left” mean the amount gets smaller — that's subtracting. Start with the bigger number.");
}

function genThreeAddends() {
  const [n] = twoNames();
  const [it, e] = choice(THINGS);
  const a = randInt(2, 12), b = randInt(2, 12), c = randInt(2, 12);
  const st = story(e, [`${n} found ${num(a)} ${it} in the morning, ${num(b)} at lunch, and ${num(c)} after school.`], `How many ${it} did ${n} find in all?`);
  return problem("addsub", st, [[add(add(a, b), c), N(a + b + c)]], "“In all” means add everything together. You can add more than two numbers in one sentence!");
}

function genChangeUnknown() {
  const [n] = twoNames();
  const [it, e] = choice(THINGS);
  const a = randInt(3, 18), b = randInt(2, 15), c = a + b;
  const st = story(e, [`${n} had ${num(a)} ${it}.`, `Then ${n} found some more.`, `Now ${n} has ${num(c)} ${it}.`], `How many ${it} did ${n} find?`);
  return problem("addsub", st, [[sub(c, a), N(b)], [add(a, b), N(c)]], `${n} started with ${a} and ended with ${c}. What do you add to ${a} to get ${c}? Or: what's ${c} take away ${a}?`);
}

function genStartUnknown() {
  const [n] = twoNames();
  const [it, e] = choice(THINGS);
  const r = randInt(3, 18), b = randInt(2, 12), s = r + b;
  const st = story(e, [`${n} had some ${it}.`, `${n} gave ${num(b)} away and has ${num(r)} left.`], `How many ${it} did ${n} have at the start?`);
  return problem("addsub", st, [[add(r, b), N(s)], [sub(s, b), N(r)]], "Work backwards: put back the ones that were given away. What you have left PLUS what you gave away is what you started with.");
}

function genCompare() {
  const [n1, n2] = twoNames();
  const [it, e] = choice(THINGS);
  const b = randInt(3, 20), d = randInt(2, 15), a = b + d;
  const kind = choice(["diff", "more", "fewer"]);
  if (kind === "diff") {
    const st = story(e, [`${n1} has ${num(a)} ${it}.`, `${n2} has ${num(b)} ${it}.`], `How many more ${it} does ${n1} have than ${n2}?`);
    return problem("addsub", st, [[sub(a, b), N(d)], [add(b, d), N(a)]], "“How many more” means find the difference between the two amounts — subtract the smaller from the bigger.");
  }
  if (kind === "more") {
    const st = story(e, [`${n2} has ${num(b)} ${it}.`, `${n1} has ${num(d)} more ${it} than ${n2}.`], `How many ${it} does ${n1} have?`);
    return problem("addsub", st, [[add(b, d), N(a)]], `${n1} has everything ${n2} has, plus ${d} more.`);
  }
  const st = story(e, [`${n1} has ${num(a)} ${it}.`, `${n2} has ${num(d)} fewer ${it} than ${n1}.`], `How many ${it} does ${n2} have?`);
  return problem("addsub", st, [[sub(a, d), N(b)]], "“Fewer” means less — start with the amount you know and take away the difference.");
}

// ---------- Medium: × and ÷ ----------

const CONTAINERS = [["bags", "🛍️"], ["boxes", "📦"], ["jars", "🫙"], ["baskets", "🧺"], ["bowls", "🥣"]];

function genGroups(tier) {
  const [n] = twoNames();
  const [it] = choice(THINGS);
  const [box, e] = choice(CONTAINERS);
  const g = randInt(2, 10), k = randInt(2, 10);
  const extra = tier !== "easy" && Math.random() < 0.35 ? n : null;
  const st = story(e, [`${n} has ${num(g)} ${box}.`, `Each one has ${num(k)} ${it} in it.`], `How many ${it} does ${n} have in all?`, extra);
  return problem("muldiv", st, [[mul(g, k), N(g * k)]], "Equal groups! Number of groups × how many in each group = total.");
}

function genArray(tier) {
  const [n] = twoNames();
  const thing = choice([["chairs", "🪑"], ["desks", "🏫"], ["trees", "🌳"], ["tomato plants", "🍅"], ["cupcakes", "🧁"]]);
  const r = randInt(2, 10), c = randInt(2, 10);
  const extra = Math.random() < 0.35 ? n : null;
  const st = story(thing[1], [`${n} set up ${thing[0]} in ${num(r)} rows.`, `There are ${num(c)} ${thing[0]} in each row.`], `How many ${thing[0]} are there?`, extra);
  return problem("muldiv", st, [[mul(r, c), N(r * c)]], "Rows and columns make an array. Rows × number in each row = total.");
}

function genShare(tier) {
  const [n] = twoNames();
  const [it, e] = choice(THINGS);
  const g = randInt(2, 9), k = randInt(2, 10), p = g * k;
  const extra = Math.random() < 0.35 ? n : null;
  const st = story(e, [`${n} has ${num(p)} ${it}.`, `${n} shares them equally with ${num(g)} friends, so each friend gets the same number.`], `How many ${it} does each friend get?`, extra);
  return problem("muldiv", st, [[div(p, g), N(k)], [mul(g, k), N(p)]], "“Shares equally” means split into equal groups — that's dividing. Total ÷ number of groups = how many in each.");
}

function genMeasure(tier) {
  const [n] = twoNames();
  const [it] = choice(THINGS);
  const [box, e] = choice(CONTAINERS);
  const k = randInt(2, 10), g = randInt(2, 10), p = g * k;
  const extra = Math.random() < 0.35 ? n : null;
  const st = story(e, [`${n} has ${num(p)} ${it}.`, `${n} puts ${num(k)} ${it} in each of the ${box}.`], `How many ${box} does ${n} fill?`, extra);
  return problem("muldiv", st, [[div(p, k), N(g)], [mul(k, g), N(p)]], `This time you know how many go in each, and need the number of ${box}. Total ÷ how many in each = number of groups.`);
}

function genTimesAs(tier) {
  const [n1, n2] = twoNames();
  const [it, e] = choice(THINGS);
  const b = randInt(2, 12), t = randInt(2, 5);
  const extra = Math.random() < 0.35 ? n1 : null;
  const st = story(e, [`${n2} has ${num(b)} ${it}.`, `${n1} has ${num(t)} times as many ${it} as ${n2}.`], `How many ${it} does ${n1} have?`, extra);
  return problem("muldiv", st, [[mul(b, t), N(b * t)]], "“Times as many” means multiply.");
}

function genCost(tier) {
  const [n] = twoNames();
  const item = choice([["comic books", "📕"], ["juice boxes", "🧃"], ["stickers", "⭐"], ["tickets", "🎟️"], ["notebooks", "📓"]]);
  const price = randInt(2, 9), q = randInt(2, 9);
  const extra = Math.random() < 0.35 ? n : null;
  const st = story(item[1], [`${item[0][0].toUpperCase() + item[0].slice(1)} cost $${num(price)} each.`, `${n} buys ${num(q)} of them.`], `How many dollars does ${n} spend?`, extra);
  return problem("muldiv", st, [[mul(q, price), N(q * price)]], "Same price for each one? Number of items × price of one = total cost.");
}

// ---------- Hard: multi-step, parentheses ----------

function extraChance(n) {
  return Math.random() < 0.3 ? n : null;
}

function genAddGroups() {
  const [n] = twoNames();
  const [it, e] = choice(THINGS);
  const a = randInt(3, 20), g = randInt(2, 6), k = randInt(3, 10);
  const st = story(e, [`${n} had ${num(a)} ${it}.`, `Then ${n} bought ${num(g)} packs with ${num(k)} ${it} in each pack.`], `How many ${it} does ${n} have now?`, extraChance(n));
  return problem("multistep", st, [[add(a, mul(g, k)), N(a + g * k)]], "Two steps: first find how many came in the packs, then add what was already there. Remember: × happens before + even without parentheses.");
}

function genGroupsMinus() {
  const [n] = twoNames();
  const [it, e] = choice(THINGS);
  const g = randInt(3, 8), k = randInt(3, 10), b = randInt(2, g * k - 3);
  const st = story(e, [`${num(g)} friends each brought ${num(k)} ${it} to the party.`, `They used ${num(b)} of them in a game.`], `How many ${it} are left?`, extraChance(n));
  return problem("multistep", st, [[sub(mul(g, k), b), N(g * k - b)]], "Find how many they brought in all, then take away what got used.");
}

function genCombineShare() {
  const [n1, n2] = twoNames();
  const [it, e] = choice(THINGS);
  const g = randInt(2, 6), r = randInt(3, 9), total = g * r;
  const a = randInt(2, total - 2), b = total - a;
  const st = story(e, [`${n1} has ${num(a)} ${it} and ${n2} has ${num(b)} ${it}.`, `They put them all together and split them equally into ${num(g)} boxes.`], `How many ${it} go in each box?`, extraChance(n1));
  return problem("multistep", st, [[div(add(a, b), g), N(r)], [mul(g, r), add(a, b)]], "Put them together FIRST, then divide. Parentheses show what to do first: (__ + __) ÷ __.");
}

function genTwoKinds() {
  const [n] = twoNames();
  const kids = randInt(3, 8), k1 = randInt(2, 6), k2 = randInt(2, 6);
  const [it1, e1] = choice(THINGS.slice(0, 7));
  const [it2, e2] = choice(THINGS.slice(7));
  const st = story(`${e1}${e2}`, [`${n} is making party bags for ${num(kids)} kids.`, `Each bag gets ${num(k1)} ${it1} and ${num(k2)} ${it2}.`], `How many things go into the bags in all?`, extraChance(n));
  return problem(
    "multistep",
    st,
    [[mul(kids, add(k1, k2)), N(kids * (k1 + k2))], [add(mul(kids, k1), mul(kids, k2)), N(kids * (k1 + k2))]],
    "Find how many things are in ONE bag, then multiply by the number of bags: __ × (__ + __)."
  );
}

function genPagesLeft() {
  const [n] = twoNames();
  const a = randInt(4, 12), d = randInt(3, 7), r = randInt(10, 60), p = a * d + r;
  const st = story("📖", [`A book has ${num(p)} pages.`, `${n} reads ${num(a)} pages every day for ${num(d)} days.`], `How many pages are left to read?`, extraChance(n));
  return problem("multistep", st, [[sub(p, mul(a, d)), N(r)]], "First: how many pages did they read in all? Then take that away from the whole book.");
}

function genChange() {
  const [n] = twoNames();
  const c = randInt(3, 9), g = randInt(2, 5);
  const bill = [10, 20, 50].find((b) => b > c * g);
  const st = story("🎟️", [`Movie tickets cost $${num(c)} each.`, `${n} buys ${num(g)} tickets and pays with a $${num(bill)} bill.`], `How many dollars of change does ${n} get back?`, extraChance(n));
  return problem("multistep", st, [[sub(bill, mul(g, c)), N(bill - g * c)]], "Find the total cost first, then subtract it from the money paid.");
}

function genBakeShare() {
  const [n] = twoNames();
  const g = randInt(2, 6), r = randInt(2, 8), e = randInt(1, 6), p = g * r + e;
  const st = story("🍪", [`${n} baked ${num(p)} cookies.`, `${n} ate ${num(e)} of them and put the rest into ${num(g)} bags, with the same number in each bag.`], `How many cookies are in each bag?`, extraChance(n));
  return problem("multistep", st, [[div(sub(p, e), g), N(r)], [mul(g, r), sub(p, e)]], "First find how many were left after eating some. Then share THAT equally: (__ − __) ÷ __.");
}

function genTeams() {
  const k = randInt(3, 6), t = randInt(3, 8), total = k * t;
  const a = randInt(2, total - 2), b = total - a;
  const st = story("⚽", [`There are ${num(a)} third graders and ${num(b)} fourth graders at field day.`, `Everyone is split into teams of ${num(k)}.`], `How many teams are there?`, extraChance("The coach"));
  return problem("multistep", st, [[div(add(a, b), k), N(t)], [mul(k, t), add(a, b)]], "How many kids are there in all? Then figure out how many teams that makes.");
}

function genSaveSplit() {
  const [n] = twoNames();
  const g = randInt(2, 4), r = randInt(3, 10), w = randInt(4, 10), wk = randInt(2, 5);
  let s = w * wk - g * r;
  if (s <= 0) return genSaveSplit();
  const st = story("🐷", [`${n} earns $${num(w)} a week for ${num(wk)} weeks.`, `${n} spends $${num(s)} on a game, then splits the rest equally into ${num(g)} jars.`], `How many dollars go into each jar?`, extraChance(n));
  return problem(
    "multistep",
    st,
    [[div(sub(mul(w, wk), s), g), N(r)], [mul(g, r), sub(mul(w, wk), s)]],
    "Three steps! Money earned (×), minus what was spent (−), then split into jars (÷). Use parentheses so the ÷ happens last."
  );
}

function genCompareGroups() {
  const [n1, n2] = twoNames();
  const [it, e] = choice(THINGS);
  const k = randInt(3, 10), g2 = randInt(2, 6), g1 = g2 + randInt(1, 4);
  const st = story(e, [`${n1} has ${num(g1)} packs of ${it}.`, `${n2} has ${num(g2)} packs.`, `Every pack has ${num(k)} ${it}.`], `How many more ${it} does ${n1} have than ${n2}?`, extraChance(n1));
  return problem(
    "multistep",
    st,
    [[sub(mul(g1, k), mul(g2, k)), N((g1 - g2) * k)], [mul(sub(g1, g2), k), N((g1 - g2) * k)]],
    `Two ways work: find each person's total and subtract, or figure out how many more PACKS ${n1} has and multiply.`
  );
}

// ---------- Pools ----------

const POOLS = {
  easy: [genJoin, genJoin, genSeparate, genSeparate, genThreeAddends, genChangeUnknown, genStartUnknown, genCompare],
  medium: [genGroups, genArray, genShare, genShare, genMeasure, genTimesAs, genCost],
  hard: [genAddGroups, genGroupsMinus, genCombineShare, genTwoKinds, genPagesLeft, genChange, genBakeShare, genTeams, genSaveSplit, genCompareGroups],
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
  state.problem = choice(POOLS[state.difficulty])(state.difficulty);
  state.tries = 0;
  state.done = false;
  document.getElementById("feedback").textContent = "";
  document.getElementById("feedback").className = "feedback";
  document.getElementById("newProblemBtn").textContent = "🔄 New Problem";
  document.getElementById("visualArea").innerHTML = state.problem.visualHTML;
  renderHint();
  renderInputs();
}

function renderHint() {
  const guided = state.mode === "guided";
  document.getElementById("visualArea").classList.toggle("guided", guided);
  setHint(guided ? state.problem.hint : "");
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

const KEYS = ["7", "8", "9", "+", "−", "(", "4", "5", "6", "×", "÷", ")", "1", "2", "3", "0", "=", "⌫"];

function renderInputs() {
  const controlRow = document.getElementById("controlRow");
  controlRow.innerHTML = `
    <div class="prompt-text">Write a number sentence for the story — with the answer!</div>
    <div class="example-line">Like this: 4 + 3 = 7</div>
    <input type="text" id="sentenceInput" class="sentence-input" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="__ + __ = __" />
    <div class="keypad">${KEYS.map((k) => `<button type="button" class="${/\d/.test(k) ? "" : "op"}" data-key="${k}">${k}</button>`).join("")}</div>
    <button class="btn primary" id="submitBtn">Check Answer</button>`;

  const input = document.getElementById("sentenceInput");
  controlRow.querySelectorAll(".keypad button").forEach((btn) =>
    btn.addEventListener("click", () => {
      const key = btn.dataset.key;
      const start = input.selectionStart ?? input.value.length;
      const end = input.selectionEnd ?? input.value.length;
      if (key === "⌫") {
        const from = start === end ? Math.max(0, start - 1) : start;
        input.value = input.value.slice(0, from) + input.value.slice(end);
        input.setSelectionRange(from, from);
      } else {
        const ins = /\d/.test(key) || key === "(" || key === ")" ? key : ` ${key} `;
        input.value = input.value.slice(0, start) + ins + input.value.slice(end);
        const pos = start + ins.length;
        input.setSelectionRange(pos, pos);
      }
      input.focus();
    })
  );
  input.focus();
  document.getElementById("submitBtn").addEventListener("click", handleSubmit);
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") handleSubmit();
  });
}

function handleSubmit() {
  if (state.done) return;
  const p = state.problem;
  const text = document.getElementById("sentenceInput").value.trim();
  if (!text) {
    showFeedback("Type your number sentence first.", false);
    shakeCard();
    return;
  }
  const result = grade(p, text);
  if (result.kind === "parse") {
    showFeedback(result.msg, false);
    shakeCard();
    return;
  }
  const alts = p.altText.length ? ` (${p.altText.join(" or ")} works too.)` : "";
  if (result.ok) {
    state.done = true;
    const firstTry = state.tries === 0;
    showFeedback(`Correct! ${p.answerText}${alts}`, true);
    popCard();
    const base = DIFFICULTY[state.difficulty].points * (state.mode === "free" ? 1.15 : 1);
    addPoints(Math.round(firstTry ? base : base / 2));
    registerSolve(p);
    if (stats.streak > 0 && stats.streak % 5 === 0) launchConfetti();
    pendingAdvanceTimeout = setTimeout(newProblem, 2200);
    return;
  }
  state.tries += 1;
  shakeCard();
  if (state.tries < 2) {
    showFeedback(`${result.msg} Try again!`, false);
    return;
  }
  state.done = true;
  showFeedback(`${result.msg}<br>One sentence that works: <b>${p.answerText}</b>${alts}`, false);
  registerMiss();
  document.getElementById("newProblemBtn").textContent = "Next Problem ›";
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
