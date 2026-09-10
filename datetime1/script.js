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
  { id: "clock_solve", label: "Clock Star", check: (s) => s.clockSolved >= 1 },
  { id: "calendar_solve", label: "Calendar Wiz", check: (s) => s.calendarSolved >= 1 },
  { id: "arith_solve", label: "Time Traveler", check: (s) => s.arithSolved >= 1 },
];

const STORAGE_KEY = "timeCalendarQuestState";

const LEGACY_KEYS = [
  { key: "dateTime1QuestState", xpBase: 130 },
  { key: "dateTime2QuestState", xpBase: 175 },
];

const WEEKDAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const WEEKDAY_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const NUMBER_WORDS = ["", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve"];

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
    clockSolved: 0,
    calendarSolved: 0,
    arithSolved: 0,
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

function pad2(n) {
  return String(n).padStart(2, "0");
}

function ordinal(n) {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

function daysInMonth(year, month) {
  return new Date(year, month + 1, 0).getDate();
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
  if (category === "clock") stats.clockSolved += 1;
  if (category === "calendar") stats.calendarSolved += 1;
  if (category === "arith") stats.arithSolved += 1;
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

function clockSVG(hour, minute) {
  const cx = 100, cy = 100, r = 90;
  const hourAngle = ((hour % 12) + minute / 60) * 30;
  const minuteAngle = minute * 6;
  let ticks = "";
  for (let i = 0; i < 12; i++) {
    const angle = i * 30;
    const rad = ((angle - 90) * Math.PI) / 180;
    const x1 = cx + (r - 8) * Math.cos(rad), y1 = cy + (r - 8) * Math.sin(rad);
    const x2 = cx + r * Math.cos(rad), y2 = cy + r * Math.sin(rad);
    ticks += `<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" stroke="#1f2937" stroke-width="3"/>`;
  }
  let numbers = "";
  for (let n = 1; n <= 12; n++) {
    const angle = n * 30;
    const rad = ((angle - 90) * Math.PI) / 180;
    const x = cx + (r - 24) * Math.cos(rad), y = cy + (r - 24) * Math.sin(rad);
    numbers += `<text x="${x.toFixed(1)}" y="${(y + 6).toFixed(1)}" text-anchor="middle" font-size="16" font-weight="700" fill="#1f2937">${n}</text>`;
  }
  const hourRad = ((hourAngle - 90) * Math.PI) / 180;
  const hx = cx + 50 * Math.cos(hourRad), hy = cy + 50 * Math.sin(hourRad);
  const minRad = ((minuteAngle - 90) * Math.PI) / 180;
  const mx = cx + 75 * Math.cos(minRad), my = cy + 75 * Math.sin(minRad);
  return `<svg viewBox="0 0 200 200" width="220" height="220">
    <circle cx="${cx}" cy="${cy}" r="${r}" fill="#fff" stroke="#1f2937" stroke-width="4"/>
    ${ticks}${numbers}
    <line x1="${cx}" y1="${cy}" x2="${hx.toFixed(1)}" y2="${hy.toFixed(1)}" stroke="#1f2937" stroke-width="6" stroke-linecap="round"/>
    <line x1="${cx}" y1="${cy}" x2="${mx.toFixed(1)}" y2="${my.toFixed(1)}" stroke="#4f46e5" stroke-width="4" stroke-linecap="round"/>
    <circle cx="${cx}" cy="${cy}" r="5" fill="#1f2937"/>
  </svg>`;
}

function calendarTableHTML(year, month, highlightDays = [], highlightWeekday = null) {
  const dim = daysInMonth(year, month);
  const first = new Date(year, month, 1).getDay();
  let html = `<div class="cal-title">${MONTH_NAMES[month]} ${year}</div><table class="cal-table"><thead><tr>`;
  WEEKDAY_SHORT.forEach((w, i) => {
    html += `<th class="${highlightWeekday === i ? "cal-col-hl" : ""}">${w}</th>`;
  });
  html += "</tr></thead><tbody><tr>";
  for (let i = 0; i < first; i++) html += "<td></td>";
  let col = first;
  for (let d = 1; d <= dim; d++) {
    const isHL = highlightDays.includes(d);
    const isColHL = highlightWeekday !== null && new Date(year, month, d).getDay() === highlightWeekday;
    html += `<td class="${isHL ? "cal-day-hl" : ""} ${isColHL ? "cal-col-hl" : ""}">${d}</td>`;
    col++;
    if (col === 7) {
      html += "</tr><tr>";
      col = 0;
    }
  }
  html += "</tr></tbody></table>";
  return html;
}

// ---------- Question generators ----------

function genAnalogClock(tier) {
  const hour = randInt(1, 12);
  let minute;
  if (tier === "easy") minute = choice([0, 30]);
  else if (tier === "medium") minute = choice([0, 15, 30, 45]);
  else minute = randInt(0, 11) * 5;

  return {
    category: "clock",
    visualHTML: `<div class="clock-wrap">${clockSVG(hour, minute)}</div>`,
    promptText: "What time does the clock show?",
    inputs: [
      { id: "h", label: "Hour", type: "number", min: 1, max: 12 },
      { id: "m", label: "Minute", type: "number", min: 0, max: 59 },
    ],
    check: (v) => Number(v.h) === hour && Number(v.m) === minute,
    correctSummary: () => `${hour}:${pad2(minute)}`,
    hint: "Look at the short hand for the hour, and the long hand for the minutes.",
  };
}

function genDigitalClock(tier) {
  const hour = randInt(1, 12);
  let minute;
  if (tier === "easy") minute = choice([0, 30]);
  else if (tier === "medium") minute = choice([0, 15, 30, 45]);
  else minute = randInt(0, 59);

  return {
    category: "clock",
    visualHTML: `<div class="digital-display">${hour}:${pad2(minute)}</div>`,
    promptText: "Write the hour and minutes shown on the clock.",
    inputs: [
      { id: "h", label: "Hour", type: "number", min: 1, max: 12 },
      { id: "m", label: "Minute", type: "number", min: 0, max: 59 },
    ],
    check: (v) => Number(v.h) === hour && Number(v.m) === minute,
    correctSummary: () => `${hour}:${pad2(minute)}`,
    hint: "The number before the colon is the hour. The number after is the minutes.",
  };
}

function genWordsToTime(tier) {
  const hour = randInt(1, 12);
  let minute, phrase;
  if (tier === "easy") {
    minute = choice([0, 30]);
    phrase = minute === 0 ? `${NUMBER_WORDS[hour]} o'clock` : `half past ${NUMBER_WORDS[hour]}`;
  } else if (tier === "medium") {
    minute = choice([0, 15, 30, 45]);
    if (minute === 0) phrase = `${NUMBER_WORDS[hour]} o'clock`;
    else if (minute === 15) phrase = `quarter past ${NUMBER_WORDS[hour]}`;
    else if (minute === 30) phrase = `half past ${NUMBER_WORDS[hour]}`;
    else phrase = `quarter to ${NUMBER_WORDS[hour === 12 ? 1 : hour + 1]}`;
  } else {
    minute = randInt(0, 11) * 5;
    if (minute === 0) phrase = `${NUMBER_WORDS[hour]} o'clock`;
    else if (minute <= 30) phrase = `${minute} past ${NUMBER_WORDS[hour]}`;
    else phrase = `${60 - minute} to ${NUMBER_WORDS[hour === 12 ? 1 : hour + 1]}`;
  }

  return {
    category: "clock",
    visualHTML: `<div class="phrase-display">"${phrase}"</div>`,
    promptText: "What time is that?",
    inputs: [
      { id: "h", label: "Hour", type: "number", min: 1, max: 12 },
      { id: "m", label: "Minute", type: "number", min: 0, max: 59 },
    ],
    check: (v) => Number(v.h) === hour && Number(v.m) === minute,
    correctSummary: () => `${hour}:${pad2(minute)}`,
    hint: `"Half past" means 30 minutes. "Quarter past" means 15. "Quarter to" means 15 minutes before the next hour.`,
  };
}

function genTimeArith(tier) {
  const hour = randInt(1, 12);
  let minute, offsetMin;
  if (tier === "easy") {
    minute = 0;
    offsetMin = choice([-3, -2, -1, 1, 2, 3]) * 60;
  } else if (tier === "medium") {
    minute = choice([0, 15, 30, 45]);
    offsetMin = choice([-45, -30, -15, 15, 30, 45]);
  } else {
    minute = randInt(0, 59);
    offsetMin = choice([-90, -60, -45, -35, -20, 20, 35, 45, 60, 90]);
  }

  const base = (hour % 12) * 60 + minute;
  const total = (((base + offsetMin) % 720) + 720) % 720;
  const newMinute = total % 60;
  const newHourRaw = Math.floor(total / 60);
  const newHour = newHourRaw === 0 ? 12 : newHourRaw;

  const direction = offsetMin < 0 ? "before" : "after";
  const amt = Math.abs(offsetMin);
  const amtText = amt % 60 === 0 ? `${amt / 60} hour${amt / 60 > 1 ? "s" : ""}` : `${amt} minutes`;

  return {
    category: "arith",
    visualHTML: `<div class="date-display">${hour}:${pad2(minute)}</div>`,
    promptText: `What time is it ${amtText} ${direction} this?`,
    inputs: [
      { id: "h", label: "Hour", type: "number", min: 1, max: 12 },
      { id: "m", label: "Minute", type: "number", min: 0, max: 59 },
    ],
    check: (v) => Number(v.h) === newHour && Number(v.m) === newMinute,
    correctSummary: () => `${newHour}:${pad2(newMinute)}`,
    hint: direction === "after"
      ? "Add the minutes first — if you pass 60, carry an extra hour."
      : "Subtract the minutes first — if you go below 0, borrow an hour (add 60).",
  };
}

function genCalendar(tier) {
  const year = choice([2025, 2026, 2027]);
  const month = randInt(0, 11);
  const dim = daysInMonth(year, month);
  const subtype = tier === "easy" ? "weekday_of_date" : tier === "medium" ? choice(["weekday_of_date", "count_weekday"]) : choice(["nth_weekday_date", "weekday_after", "count_weekday"]);

  if (subtype === "weekday_of_date") {
    const day = randInt(1, dim);
    const wd = new Date(year, month, day).getDay();
    return {
      category: "calendar",
      visualHTML: calendarTableHTML(year, month, [day]),
      promptText: `What day of the week is ${MONTH_NAMES[month]} ${day}?`,
      inputs: [{ id: "wd", label: "Day of week", type: "select", options: WEEKDAY_NAMES }],
      check: (v) => Number(v.wd) === wd,
      correctSummary: () => WEEKDAY_NAMES[wd],
      hint: "Find the highlighted date, then look at the top of its column.",
    };
  }

  if (subtype === "count_weekday") {
    const wdIndex = randInt(0, 6);
    let count = 0;
    for (let d = 1; d <= dim; d++) if (new Date(year, month, d).getDay() === wdIndex) count++;
    return {
      category: "calendar",
      visualHTML: calendarTableHTML(year, month, [], wdIndex),
      promptText: `How many ${WEEKDAY_NAMES[wdIndex]}s are in ${MONTH_NAMES[month]}?`,
      inputs: [{ id: "n", label: "Count", type: "number", min: 0, max: 6 }],
      check: (v) => Number(v.n) === count,
      correctSummary: () => String(count),
      hint: `Count every highlighted ${WEEKDAY_NAMES[wdIndex]} in the calendar.`,
    };
  }

  if (subtype === "nth_weekday_date") {
    const wdIndex = randInt(0, 6);
    const matches = [];
    for (let d = 1; d <= dim; d++) if (new Date(year, month, d).getDay() === wdIndex) matches.push(d);
    const n = randInt(1, matches.length);
    const answerDay = matches[n - 1];
    return {
      category: "calendar",
      visualHTML: calendarTableHTML(year, month, [], wdIndex),
      promptText: `What is the date of the ${ordinal(n)} ${WEEKDAY_NAMES[wdIndex]} of ${MONTH_NAMES[month]}?`,
      inputs: [{ id: "d", label: "Day", type: "number", min: 1, max: dim }],
      check: (v) => Number(v.d) === answerDay,
      correctSummary: () => `${MONTH_NAMES[month]} ${answerDay}`,
      hint: `Count the highlighted ${WEEKDAY_NAMES[wdIndex]}s from the start of the month.`,
    };
  }

  // weekday_after
  const day = randInt(1, dim);
  const n = randInt(3, 20);
  const base = new Date(year, month, day);
  const target = new Date(base);
  target.setDate(target.getDate() + n);
  const wd = target.getDay();
  return {
    category: "calendar",
    visualHTML: calendarTableHTML(year, month, [day]),
    promptText: `${n} days after ${MONTH_NAMES[month]} ${day}, what day of the week will it be?`,
    inputs: [{ id: "wd", label: "Day of week", type: "select", options: WEEKDAY_NAMES }],
    check: (v) => Number(v.wd) === wd,
    correctSummary: () => WEEKDAY_NAMES[wd],
    hint: "Count forward day by day, wrapping to the next row when you reach the end of a week.",
  };
}

function genDateArith(tier) {
  const year = choice([2025, 2026, 2027]);
  const month = randInt(0, 11);
  const dim = daysInMonth(year, month);
  const day = randInt(1, dim);
  const n = tier === "easy" ? randInt(1, 3) : tier === "medium" ? randInt(1, 10) : randInt(1, 30);
  const direction = choice(["before", "after"]);
  const base = new Date(year, month, day);
  const target = new Date(base);
  target.setDate(target.getDate() + (direction === "after" ? n : -n));

  return {
    category: "arith",
    visualHTML: `<div class="date-display">${MONTH_NAMES[month]} ${day}, ${year}</div>`,
    promptText: `What date is ${n} day${n > 1 ? "s" : ""} ${direction} this?`,
    inputs: [
      { id: "mo", label: "Month", type: "select", options: MONTH_NAMES },
      { id: "d", label: "Day", type: "number", min: 1, max: 31 },
    ],
    check: (v) => Number(v.mo) === target.getMonth() && Number(v.d) === target.getDate(),
    correctSummary: () => `${MONTH_NAMES[target.getMonth()]} ${target.getDate()}`,
    hint: direction === "after"
      ? "Count forward day by day. If you pass the end of the month, continue into the next month."
      : "Count backward day by day. If you go before day 1, continue into the previous month.",
  };
}

const POOLS = {
  easy: [genAnalogClock, genAnalogClock, genAnalogClock, genDigitalClock, genWordsToTime, genWordsToTime, genTimeArith, genTimeArith, genCalendar, genDateArith],
  medium: [genAnalogClock, genAnalogClock, genWordsToTime, genWordsToTime, genTimeArith, genTimeArith, genCalendar, genCalendar, genDateArith, genDateArith],
  hard: [genAnalogClock, genAnalogClock, genWordsToTime, genWordsToTime, genTimeArith, genTimeArith, genTimeArith, genCalendar, genCalendar, genCalendar, genDateArith, genDateArith, genDateArith],
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
      return `<label>${inp.label}<input type="number" id="inp_${inp.id}" class="num-input" min="${inp.min}" max="${inp.max}" /></label>`;
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
