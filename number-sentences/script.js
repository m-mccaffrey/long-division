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
  const identity = additive ? "0" : "1";
  const kept = parts.filter((x) => x.slice(1) !== identity);
  if (!kept.length) return identity;
  if (kept.length === 1 && kept[0][0] === "+") return kept[0].slice(1);
  return `${tag}(${kept.sort().join(",")})`;
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
    // Only at the start or end, so it never splits sentences that refer to each other ("Each one has…").
    parts.splice(choice([0, parts.length]), 0, choice(EXTRA_FACTS)(extraFor));
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
  const [n1, n2] = twoNames();
  const [it, e] = choice(THINGS);
  const a = randInt(3, 20), b = randInt(2, 15), c = a + b;
  const st = choice([
    () => story(e, [`${n1} has ${num(a)} ${it}.`, `Then ${n1} gets ${num(b)} more.`], `How many ${it} does ${n1} have now?`),
    () => story(e, [`There are ${num(a)} ${it} on the table and ${num(b)} ${it} in a bag.`], `How many ${it} are there altogether?`),
    () => story(e, [`${n1} has ${num(a)} ${it}.`, `${n2} has ${num(b)} ${it}.`], `How many ${it} do they have together?`),
    () => story(e, [`${n1} found ${num(a)} ${it} at the park.`, `${n2} gave ${n1} ${num(b)} more.`], `How many ${it} does ${n1} have now?`),
  ])();
  return problem("addsub", st, [[add(a, b), N(c)]], "When things are put together or more are added, the total gets bigger — that's adding.");
}

function genSeparate() {
  const [n1, n2] = twoNames();
  const [it, e] = choice(THINGS);
  const a = randInt(8, 30), b = randInt(2, a - 2), r = a - b;
  const st = choice([
    () => story(e, [`${n1} had ${num(a)} ${it}.`, `${n1} gave ${num(b)} of them to ${n2}.`], `How many ${it} does ${n1} have left?`),
    () => story(e, [`There were ${num(a)} ${it} in a box.`, `${n1} took out ${num(b)}.`], `How many ${it} are still in the box?`),
    () => story(e, [`${n1} had ${num(a)} ${it}.`, `${n1} lost ${num(b)} of them on the way home.`], `How many ${it} does ${n1} have now?`),
    () => story(e, [`${n1} had ${num(a)} ${it}.`, `${n1} used ${num(b)} for an art project.`], `How many ${it} are left?`),
  ])();
  return problem("addsub", st, [[sub(a, b), N(r)]], "“Gave away,” “lost,” “took out,” and “left” mean the amount gets smaller — that's subtracting. Start with the bigger number.");
}

function genThreeAddends() {
  const [n] = twoNames();
  const [it, e] = choice(THINGS);
  const a = randInt(2, 12), b = randInt(2, 12), c = randInt(2, 12);
  const st = story(e, [`${n} found ${num(a)} ${it} in the morning, ${num(b)} at lunch, and ${num(c)} after school.`], `How many ${it} did ${n} find in all?`);
  return problem("addsub", st, [[add(add(a, b), c), N(a + b + c)]], "“In all” means add everything together. You can add more than two numbers in one sentence!");
}




// ---------- Medium: × and ÷ (one step) ----------

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

// ---------- Medium: more than two terms (+ and −) ----------

function genBus(tier) {
  let riders = randInt(8, 20);
  const steps = [];
  const sentences = [`A bus leaves the station with ${num(riders)} people on it.`];
  let expr = N(riders);
  const stops = randInt(2, 3);
  for (let i = 0; i < stops; i++) {
    const off = randInt(1, Math.min(6, riders - 1));
    const on = randInt(1, 7);
    const order = Math.random() < 0.5;
    const where = ["At the first stop", "At the next stop", "At the last stop"][i === stops - 1 ? 2 : Math.min(i, 1)];
    if (order) {
      sentences.push(`${where}, ${num(off)} people get off and ${num(on)} get on.`);
      expr = add(sub(expr, off), on);
    } else {
      sentences.push(`${where}, ${num(on)} people get on and ${num(off)} get off.`);
      expr = sub(add(expr, on), off);
    }
    riders = riders - off + on;
    steps.push(off, on);
  }
  const st = story("🚌", sentences, "How many people are on the bus now?", Math.random() < 0.3 ? "The driver" : null);
  return problem("addsub", st, [[expr, N(evaluate(expr))]], "Start with the people on the bus. Getting on is +, getting off is −. You can put them all in one long sentence!");
}

function genUpsAndDowns(tier) {
  const [n1, n2, n3] = shuffle(NAMES).slice(0, 3);
  const [it, e] = choice(THINGS);
  const a = randInt(8, 25), b = randInt(3, 12), c = randInt(2, a - 2), d = randInt(2, 10);
  const st = choice([
    () => ({ s: story(e, [`${n1} had ${num(a)} ${it}.`, `${n2} gave ${n1} ${num(b)} more.`, `Then ${n1} lost ${num(c)}.`, `Later, ${n3} gave ${n1} ${num(d)} more.`], `How many ${it} does ${n1} have now?`, Math.random() < 0.3 ? n1 : null), x: add(sub(add(a, b), c), d) }),
    () => ({ s: story(e, [`${n1} had ${num(a)} ${it}.`, `${n1} gave ${num(c)} to ${n2} and got ${num(b)} from ${n3}.`], `How many ${it} does ${n1} have now?`, Math.random() < 0.3 ? n1 : null), x: add(sub(a, c), b) }),
  ])();
  return problem("addsub", st.s, [[st.x, N(evaluate(st.x))]], "Go in order. Every time the amount grows, add. Every time it shrinks, subtract.");
}

function genFourAddends(tier) {
  const [n] = twoNames();
  const [it, e] = choice(THINGS);
  const v = [randInt(2, 15), randInt(2, 15), randInt(2, 15), randInt(2, 15)];
  const days = ["Monday", "Tuesday", "Wednesday", "Thursday"];
  const st = story(e, [`${n} collected ${it} all week: ${v.map((x, i) => `${num(x)} on ${days[i]}`).join(", ").replace(/, ([^,]*)$/, ", and $1")}.`], `How many ${it} did ${n} collect in all?`);
  return problem("addsub", st, [[add(add(add(v[0], v[1]), v[2]), v[3]), N(v[0] + v[1] + v[2] + v[3])]], "“In all” means add everything together — all four numbers go in one sentence.");
}

// ---------- Hard: long stories, several steps, parentheses ----------

const extraMaybe = (n) => (Math.random() < 0.3 ? n : null);

function genLostAndShared() {
  const [a, b, c] = shuffle(NAMES).slice(0, 3);
  const [it, e] = choice(THINGS);
  for (;;) {
    const x = randInt(4, 15), lost = randInt(1, 3), y = randInt(3, 15), z = choice([0, 0, randInt(2, 8)]);
    const people = 3;
    const total = x - lost + y + z;
    if (total % people) continue;
    const st = story(e, [
      `${a} had ${num(x)} ${it} but lost ${num(lost)} on the way to ${b}'s house.`,
      `${b} had ${num(y)} ${it}.`,
      z === 0 ? `Then ${c}, who had no ${it}, came over too.` : `Then ${c} came over with ${num(z)} ${it}.`,
      `The ${num(people)} friends put all their ${it} together and split them evenly.`,
    ], `How many ${it} does each friend get?`, extraMaybe(a));
    const x0 = add(add(sub(x, lost), y), z);
    return problem("multistep", st, [[div(x0, people), N(total / people)], [mul(people, total / people), x0]],
      "First find how many they have all together (watch out for the ones that got lost!). Then split that evenly — use parentheses so the adding happens first.");
  }
}

function genPoolAndBuy() {
  const [a, b] = twoNames();
  for (;;) {
    const x = randInt(8, 30), y = randInt(8, 30), price = randInt(5, x + y - 4);
    if ((x + y - price) % 2) continue;
    const thing = choice(["a board game", "a soccer ball", "a big pizza", "a puzzle", "a kite"]);
    const st = story("💵", [`${a} has $${num(x)} and ${b} has $${num(y)}.`, `They put their money together and buy ${thing} for $${num(price)}.`, `Then they split the money that's left evenly between the ${num(2)} of them.`], `How many dollars does each of them get?`, extraMaybe(a));
    const pool = sub(add(x, y), price);
    return problem("multistep", st, [[div(pool, 2), N((x + y - price) / 2)], [mul(2, (x + y - price) / 2), pool]],
      "Put the money together, take away what they spent, THEN split it. The splitting goes last, so everything before it needs parentheses.");
  }
}

function genTicketsChange() {
  const [a, b] = twoNames();
  for (;;) {
    const c = randInt(3, 8), g1 = randInt(1, 4), g2 = randInt(1, 4), bill = choice([20, 50]);
    const cost = (g1 + g2) * c, change = bill - cost;
    if (change <= 0 || change % 2) continue;
    const st = story("🎟️", [`Movie tickets cost $${num(c)} each.`, `${a} needs ${num(g1)} tickets and ${b} needs ${num(g2)}.`, `They pay together with a $${num(bill)} bill and split the change evenly between the ${num(2)} of them.`], `How many dollars of change does each one get?`, extraMaybe(a));
    const ans = change / 2;
    const left1 = sub(bill, mul(add(g1, g2), c));
    const left2 = sub(sub(bill, mul(g1, c)), mul(g2, c));
    return problem("multistep", st, [[div(left1, 2), N(ans)], [div(left2, 2), N(ans)]],
      "Steps: how many tickets in all → what they cost → the change from the bill → split it. Parentheses keep each step in the right order.");
  }
}

function genBakeSale() {
  const [a, b] = twoNames();
  for (;;) {
    const trays = randInt(2, 4), per = randInt(6, 12), extra = randInt(3, 15), dropped = randInt(1, 5), bag = randInt(3, 6);
    const total = trays * per + extra - dropped;
    if (total % bag || total <= 0) continue;
    const st = story("🍪", [`${a} baked ${num(trays)} trays of cookies with ${num(per)} cookies on each tray.`, `${b} brought ${num(extra)} more cookies.`, `On the way to the bake sale, ${num(dropped)} cookies fell on the floor.`, `They packed the rest into bags of ${num(bag)}.`], `How many bags did they fill?`, extraMaybe(a));
    const rest = sub(add(mul(trays, per), extra), dropped);
    return problem("multistep", st, [[div(rest, bag), N(total / bag)], [mul(bag, total / bag), rest]],
      "Find all the cookies (trays × cookies per tray, plus the extras), take away the dropped ones, then divide into bags.");
  }
}

function genSaveSplit() {
  const [n, g] = twoNames();
  for (;;) {
    const w = randInt(3, 10), wk = randInt(2, 6), gift = randInt(5, 20), spend = randInt(5, 25), jars = randInt(2, 4);
    const left = w * wk + gift - spend;
    if (left <= 0 || left % jars) continue;
    const st = story("🐷", [`${n} earns $${num(w)} a week walking dogs for ${num(wk)} weeks.`, `${g} gives ${n} $${num(gift)} for a birthday.`, `${n} spends $${num(spend)} on a video game and splits the rest evenly into ${num(jars)} savings jars.`], `How many dollars go in each jar?`, extraMaybe(n));
    const rest = sub(add(mul(w, wk), gift), spend);
    return problem("multistep", st, [[div(rest, jars), N(left / jars)], [mul(jars, left / jars), rest]],
      "Four things happen: earn (×), gift (+), spend (−), split (÷). Write them in order and wrap everything before the ÷ in parentheses.");
  }
}

function genPartyBags() {
  const [n] = twoNames();
  const kids = randInt(4, 9), k1 = randInt(2, 5), k2 = randInt(2, 5);
  const [it1, e1] = choice(THINGS.slice(0, 7));
  const [it2, e2] = choice(THINGS.slice(7));
  const have = randInt(3, kids * (k1 + k2) - 3);
  const st = story(`${e1}${e2}`, [`${n} is making party bags for ${num(kids)} kids.`, `Each bag gets ${num(k1)} ${it1} and ${num(k2)} ${it2}.`, `${n} already has ${num(have)} things to put in the bags.`], `How many more things does ${n} need to buy?`, extraMaybe(n));
  const ans = kids * (k1 + k2) - have;
  return problem("multistep", st, [[sub(mul(kids, add(k1, k2)), have), N(ans)], [sub(add(mul(kids, k1), mul(kids, k2)), have), N(ans)]],
    "How many things go in ONE bag? How many for ALL the bags? Then take away what's already there.");
}

function genFieldTrip() {
  for (;;) {
    const a = randInt(10, 30), b = randInt(10, 30), t = randInt(2, 6), v = choice([6, 7, 8, 10, 12]);
    const total = a + b + t;
    if (total % v) continue;
    const st = story("🚐", [`${num(a)} third graders and ${num(b)} fourth graders are going on a field trip.`, `${num(t)} teachers are going too.`, `Each van holds ${num(v)} people, and every van is full.`], `How many vans do they need?`, extraMaybe("The bus driver"));
    const people = add(add(a, b), t);
    return problem("multistep", st, [[div(people, v), N(total / v)], [mul(v, total / v), people]],
      "Count EVERYONE who's going (don't forget the teachers), then divide into vans.");
  }
}

function genBookPages() {
  const [n] = twoNames();
  const a = randInt(5, 15), d = randInt(3, 6), sat = randInt(10, 30), left = randInt(10, 60);
  const p = a * d + sat + left;
  const st = story("📖", [`${n}'s book has ${num(p)} pages.`, `${n} reads ${num(a)} pages a day for ${num(d)} days, then ${num(sat)} more pages on Saturday.`], `How many pages does ${n} still have to read?`, extraMaybe(n));
  return problem("multistep", st, [[sub(p, add(mul(a, d), sat)), N(left)]],
    "How many pages did they read in all? (Days × pages, plus Saturday.) Take that away from the whole book.");
}

function genPizzaParty() {
  const [a, b] = twoNames();
  for (;;) {
    const pizzas = randInt(2, 5), slices = choice([6, 8]), e1 = randInt(1, 4), e2 = randInt(1, 4), friends = randInt(2, 6);
    const rest = pizzas * slices - e1 - e2;
    if (rest <= 0 || rest % friends) continue;
    const st = story("🍕", [`There are ${num(pizzas)} pizzas, and each one is cut into ${num(slices)} slices.`, `${a} eats ${num(e1)} slices and ${b} eats ${num(e2)}.`, `The rest are shared evenly by ${num(friends)} other friends.`], `How many slices does each of those friends get?`, extraMaybe(a));
    const r = sub(sub(mul(pizzas, slices), e1), e2);
    return problem("multistep", st, [[div(r, friends), N(rest / friends)], [mul(friends, rest / friends), r]],
      "All the slices (pizzas × slices), minus what got eaten, then shared. Parentheses go around everything before the ÷.");
  }
}

// ---------- Pools ----------

const POOLS = {
  easy: [genJoin, genJoin, genSeparate, genSeparate],
  medium: [genBus, genUpsAndDowns, genThreeAddends, genFourAddends, genGroups, genArray, genShare, genMeasure, genTimesAs, genCost],
  hard: [genLostAndShared, genPoolAndBuy, genTicketsChange, genBakeSale, genSaveSplit, genPartyBags, genFieldTrip, genBookPages, genPizzaParty],
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
