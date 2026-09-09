// ---------- Config ----------

const DIFFICULTY = {
  easy: { label: "Easy", points: 15 },
  medium: { label: "Medium", points: 25 },
  hard: { label: "Hard", points: 40 },
};

const BADGE_DEFS = [
  { id: "first_solve", label: "First Steps", check: (s) => s.totalSolved >= 1 },
  { id: "solve_10", label: "10 Solved", check: (s) => s.totalSolved >= 10 },
  { id: "solve_25", label: "25 Solved", check: (s) => s.totalSolved >= 25 },
  { id: "solve_50", label: "50 Solved", check: (s) => s.totalSolved >= 50 },
  { id: "solve_100", label: "Century!", check: (s) => s.totalSolved >= 100 },
  { id: "streak_5", label: "Streak x5", check: (s) => s.bestStreak >= 5 },
  { id: "streak_10", label: "Streak x10", check: (s) => s.bestStreak >= 10 },
  { id: "streak_20", label: "Unstoppable", check: (s) => s.bestStreak >= 20 },
  { id: "hard_solve", label: "Hard Mode Hero", check: (s) => s.hardSolved >= 1 },
  { id: "clock_solve", label: "Clock Star", check: (s) => s.clockSolved >= 1 },
  { id: "calendar_solve", label: "Calendar Wiz", check: (s) => s.calendarSolved >= 1 },
  { id: "arith_solve", label: "Time Traveler", check: (s) => s.arithSolved >= 1 },
  { id: "meeting_solve", label: "Scheduling Pro", check: (s) => s.meetingSolved >= 1 },
];

const STORAGE_KEY = "dateTime2QuestState";

const WEEKDAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const WEEKDAY_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const AMPM = ["AM", "PM"];
const PEOPLE_NAMES = ["Alex", "Priya", "Sam", "Jordan", "Maya", "Chris", "Nina", "Diego"];

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
    clockSolved: 0,
    calendarSolved: 0,
    arithSolved: 0,
    meetingSolved: 0,
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

function to12(hour24) {
  const ampm = hour24 < 12 ? "AM" : "PM";
  let hour12 = hour24 % 12;
  if (hour12 === 0) hour12 = 12;
  return { hour12, ampm };
}

function from24to12Str(hour24, minute) {
  const { hour12, ampm } = to12(hour24);
  return `${hour12}:${pad2(minute)} ${ampm}`;
}

function to24Str(hour24, minute) {
  return `${pad2(hour24)}:${pad2(minute)}`;
}

function xpForLevel(level) {
  return 100 * level;
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
  if (category === "meeting") stats.meetingSolved += 1;
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

function clockSVG(hour12, minute) {
  const cx = 100, cy = 100, r = 90;
  const hourAngle = ((hour12 % 12) + minute / 60) * 30;
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
    <line x1="${cx}" y1="${cy}" x2="${mx.toFixed(1)}" y2="${my.toFixed(1)}" stroke="#be123c" stroke-width="4" stroke-linecap="round"/>
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

const AMPM_CONTEXTS = {
  AM: ["early in the morning", "before breakfast", "just after waking up", "on the morning commute"],
  PM: ["in the afternoon", "in the evening", "at night", "after dinner"],
};

function genAnalogContext(tier) {
  const hour12 = randInt(1, 12);
  const minute = tier === "easy" ? choice([0, 15, 30, 45]) : tier === "medium" ? choice([0, 10, 20, 30, 40, 50]) : randInt(0, 59);
  const ampm = choice(["AM", "PM"]);
  const hour24 = ampm === "AM" ? (hour12 === 12 ? 0 : hour12) : hour12 === 12 ? 12 : hour12 + 12;
  const context = choice(AMPM_CONTEXTS[ampm]);

  return {
    category: "clock",
    visualHTML: `<div class="clock-wrap">${clockSVG(hour12, minute)}</div><div class="context-note">This was ${context}.</div>`,
    promptText: "What time is this, in 24-hour time?",
    inputs: [
      { id: "h", label: "Hour (0-23)", type: "number", min: 0, max: 23 },
      { id: "m", label: "Minute", type: "number", min: 0, max: 59 },
    ],
    check: (v) => Number(v.h) === hour24 && Number(v.m) === minute,
    correctSummary: () => `${to24Str(hour24, minute)} (${from24to12Str(hour24, minute)})`,
    hint: "Read the clock as a normal 12-hour time first, then use AM/PM to pick the 24-hour hour: AM keeps the hour (12 becomes 0); PM adds 12 (except 12 stays 12).",
  };
}

function genConversion24(tier) {
  const hour24 = randInt(0, 23);
  const minute = tier === "easy" ? choice([0, 15, 30, 45]) : tier === "medium" ? choice([0, 5, 10, 15, 20, 30, 40, 45, 50]) : randInt(0, 59);
  const direction = choice(["to12", "to24"]);
  const { hour12, ampm } = to12(hour24);

  if (direction === "to12") {
    return {
      category: "arith",
      visualHTML: `<div class="digital-display">${to24Str(hour24, minute)}</div>`,
      promptText: "Write this 24-hour time in 12-hour form.",
      inputs: [
        { id: "h", label: "Hour", type: "number", min: 1, max: 12 },
        { id: "m", label: "Minute", type: "number", min: 0, max: 59 },
        { id: "ap", label: "AM/PM", type: "select", options: AMPM },
      ],
      check: (v) => Number(v.h) === hour12 && Number(v.m) === minute && AMPM[Number(v.ap)] === ampm,
      correctSummary: () => from24to12Str(hour24, minute),
      hint: "Hours 00-11 are AM (00 becomes 12). Hours 12-23 are PM (subtract 12, except 12 stays 12).",
    };
  }
  return {
    category: "arith",
    visualHTML: `<div class="digital-display">${hour12}:${pad2(minute)} ${ampm}</div>`,
    promptText: "Write this in 24-hour time.",
    inputs: [
      { id: "h", label: "Hour (0-23)", type: "number", min: 0, max: 23 },
      { id: "m", label: "Minute", type: "number", min: 0, max: 59 },
    ],
    check: (v) => Number(v.h) === hour24 && Number(v.m) === minute,
    correctSummary: () => to24Str(hour24, minute),
    hint: "AM: keep the hour, except 12 AM becomes 00. PM: add 12, except 12 PM stays 12.",
  };
}

function genWordsContext(tier) {
  const hour12 = randInt(1, 12);
  const ampm = choice(["AM", "PM"]);
  const hour24 = ampm === "AM" ? (hour12 === 12 ? 0 : hour12) : hour12 === 12 ? 12 : hour12 + 12;
  let minute, phraseCore;
  if (tier === "easy") {
    minute = choice([0, 15, 30, 45]);
  } else if (tier === "medium") {
    minute = choice([0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55]);
  } else {
    minute = randInt(0, 59);
  }
  if (minute === 0) phraseCore = `${hour12} o'clock`;
  else if (minute === 15) phraseCore = `quarter past ${hour12}`;
  else if (minute === 30) phraseCore = `half past ${hour12}`;
  else if (minute === 45) phraseCore = `quarter to ${hour12 === 12 ? 1 : hour12 + 1}`;
  else if (minute < 30) phraseCore = `${minute} past ${hour12}`;
  else phraseCore = `${60 - minute} to ${hour12 === 12 ? 1 : hour12 + 1}`;
  const ampmWord = ampm === "AM" ? "in the morning" : choice(["in the afternoon", "in the evening"]);
  const phrase = `${phraseCore} ${ampmWord}`;

  return {
    category: "clock",
    visualHTML: `<div class="phrase-display">"${phrase}"</div>`,
    promptText: "What time is that, in 24-hour time?",
    inputs: [
      { id: "h", label: "Hour (0-23)", type: "number", min: 0, max: 23 },
      { id: "m", label: "Minute", type: "number", min: 0, max: 59 },
    ],
    check: (v) => Number(v.h) === hour24 && Number(v.m) === minute,
    correctSummary: () => `${to24Str(hour24, minute)} (${from24to12Str(hour24, minute)})`,
    hint: `Figure out the 12-hour time first, then convert using AM/PM: morning stays the same (12 becomes 0), afternoon/evening add 12.`,
  };
}

function genTimeArithAMPM(tier) {
  const hour24 = randInt(0, 23);
  let minute, offsetMin;
  if (tier === "easy") {
    minute = choice([0, 15, 30, 45]);
    offsetMin = choice([-180, -120, -60, -30, 30, 60, 120, 180]);
  } else if (tier === "medium") {
    minute = choice([0, 10, 20, 30, 40, 50]);
    offsetMin = choice([-240, -150, -90, -45, 45, 90, 150, 240]);
  } else {
    minute = randInt(0, 59);
    offsetMin = choice([-400, -300, -200, -100, -50, 50, 100, 200, 300, 400]);
  }

  const base = hour24 * 60 + minute;
  const total = (((base + offsetMin) % 1440) + 1440) % 1440;
  const newHour24 = Math.floor(total / 60);
  const newMinute = total % 60;
  const { hour12: newHour12, ampm: newAmpm } = to12(newHour24);

  const direction = offsetMin < 0 ? "before" : "after";
  const amt = Math.abs(offsetMin);
  const h = Math.floor(amt / 60), m = amt % 60;
  const amtParts = [];
  if (h > 0) amtParts.push(`${h} hour${h > 1 ? "s" : ""}`);
  if (m > 0) amtParts.push(`${m} minute${m > 1 ? "s" : ""}`);
  const amtText = amtParts.join(" ");

  return {
    category: "arith",
    visualHTML: `<div class="digital-display">${from24to12Str(hour24, minute)}</div>`,
    promptText: `What time is it ${amtText} ${direction} this?`,
    inputs: [
      { id: "h", label: "Hour", type: "number", min: 1, max: 12 },
      { id: "m", label: "Minute", type: "number", min: 0, max: 59 },
      { id: "ap", label: "AM/PM", type: "select", options: AMPM },
    ],
    check: (v) => Number(v.h) === newHour12 && Number(v.m) === newMinute && AMPM[Number(v.ap)] === newAmpm,
    correctSummary: () => from24to12Str(newHour24, newMinute),
    hint: "Work in 24-hour time to avoid AM/PM mix-ups, then convert your answer back at the end. Watch for crossing midnight or noon.",
  };
}

function genElapsedTime(tier) {
  const startHour24 = randInt(0, 23);
  const startMinute = tier === "easy" ? choice([0, 15, 30, 45]) : tier === "medium" ? choice([0, 10, 20, 30, 40, 50]) : randInt(0, 59);
  const durH = tier === "easy" ? randInt(0, 2) : tier === "medium" ? randInt(0, 4) : randInt(0, 6);
  let durM = tier === "easy" ? choice([0, 15, 30, 45]) : tier === "medium" ? choice([0, 15, 30, 45]) : randInt(0, 59);
  if (durH === 0 && durM === 0) durM = 15;

  const totalStart = startHour24 * 60 + startMinute;
  const durTotal = durH * 60 + durM;
  const totalEnd = (totalStart + durTotal) % 1440;
  const endHour24 = Math.floor(totalEnd / 60);
  const endMinute = totalEnd % 60;
  const { hour12: endHour12, ampm: endAmpm } = to12(endHour24);

  const durText = [durH > 0 ? `${durH} hour${durH > 1 ? "s" : ""}` : "", durM > 0 ? `${durM} minute${durM > 1 ? "s" : ""}` : ""].filter(Boolean).join(" and ");

  return {
    category: "arith",
    visualHTML: `<div class="reference-note">Starts at ${from24to12Str(startHour24, startMinute)}<br/>Lasts ${durText}</div>`,
    promptText: "What time does it end?",
    inputs: [
      { id: "h", label: "Hour", type: "number", min: 1, max: 12 },
      { id: "m", label: "Minute", type: "number", min: 0, max: 59 },
      { id: "ap", label: "AM/PM", type: "select", options: AMPM },
    ],
    check: (v) => Number(v.h) === endHour12 && Number(v.m) === endMinute && AMPM[Number(v.ap)] === endAmpm,
    correctSummary: () => from24to12Str(endHour24, endMinute),
    hint: "Add the hours, then add the minutes. If the minutes pass 60, carry an extra hour — and watch for crossing from AM to PM (or past midnight).",
  };
}

function genDurationBetween(tier) {
  const startHour24 = randInt(0, 21);
  const startMinute = tier === "easy" ? choice([0, 15, 30, 45]) : tier === "medium" ? choice([0, 10, 20, 30, 40, 50]) : randInt(0, 59);
  const maxSpan = tier === "easy" ? 180 : tier === "medium" ? 360 : 600;
  let span = randInt(15, maxSpan);
  if (tier !== "hard") span = Math.round(span / 15) * 15;

  const totalStart = startHour24 * 60 + startMinute;
  const totalEnd = totalStart + span;
  const endHour24 = Math.floor(totalEnd / 60) % 24;
  const endMinute = totalEnd % 60;

  const durH = Math.floor(span / 60);
  const durM = span % 60;

  return {
    category: "arith",
    visualHTML: `<div class="reference-note">Starts: ${from24to12Str(startHour24, startMinute)}<br/>Ends: ${from24to12Str(endHour24, endMinute)}</div>`,
    promptText: "How long is that?",
    inputs: [
      { id: "h", label: "Hours", type: "number", min: 0, max: 23 },
      { id: "m", label: "Minutes", type: "number", min: 0, max: 59 },
    ],
    check: (v) => Number(v.h) === durH && Number(v.m) === durM,
    correctSummary: () => `${durH} hour${durH !== 1 ? "s" : ""} ${durM} minute${durM !== 1 ? "s" : ""}`,
    hint: "Convert both times to 24-hour time and subtract — if the end time is 'earlier' in the clock, it happened after crossing midnight, so add 24 hours first.",
  };
}

function genCalendar(tier) {
  const year = choice([2025, 2026, 2027]);
  const month = randInt(0, 11);
  const dim = daysInMonth(year, month);
  const subtype = choice(["nth_weekday_date", "weekday_after", "count_weekday", "weekday_of_date"]);

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
      hint: `Count every highlighted ${WEEKDAY_NAMES[wdIndex]}.`,
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
  const day = randInt(1, dim);
  const n = tier === "hard" ? randInt(10, 45) : randInt(3, 20);
  const target = new Date(year, month, day);
  target.setDate(target.getDate() + n);
  const wd = target.getDay();
  return {
    category: "calendar",
    visualHTML: calendarTableHTML(year, month, [day]),
    promptText: `${n} days after ${MONTH_NAMES[month]} ${day}, what day of the week will it be?`,
    inputs: [{ id: "wd", label: "Day of week", type: "select", options: WEEKDAY_NAMES }],
    check: (v) => Number(v.wd) === wd,
    correctSummary: () => WEEKDAY_NAMES[wd],
    hint: "Count forward day by day, wrapping to the next row when you reach the end of a week (and into the next month if needed).",
  };
}

function genWeekOf(tier) {
  const year = choice([2025, 2026, 2027]);
  const month = randInt(0, 11);
  const dim = daysInMonth(year, month);
  const refDay = randInt(1, Math.max(1, dim - (tier === "hard" ? 21 : 10)));
  const refDate = new Date(year, month, refDay);
  const refWd = refDate.getDay();

  const subtype = tier === "easy" ? "week_of" : choice(["week_of", "next_weekday", "weeks_from"]);

  if (subtype === "week_of") {
    const targetDay = randInt(refDay, dim);
    const targetDate = new Date(year, month, targetDay);
    const targetWd = targetDate.getDay();
    const monday = new Date(targetDate);
    monday.setDate(monday.getDate() - ((targetWd + 6) % 7));
    return {
      category: "calendar",
      visualHTML: `<div class="reference-note">Today is ${WEEKDAY_NAMES[refWd]}, ${MONTH_NAMES[month]} ${refDay}, ${year}.</div>`,
      promptText: `What date is the Monday that starts "the week of the ${ordinal(targetDay)}"?`,
      inputs: [
        { id: "mo", label: "Month", type: "select", options: MONTH_NAMES },
        { id: "d", label: "Day", type: "number", min: 1, max: 31 },
      ],
      check: (v) => Number(v.mo) === monday.getMonth() && Number(v.d) === monday.getDate(),
      correctSummary: () => `${MONTH_NAMES[monday.getMonth()]} ${monday.getDate()}`,
      hint: "Weeks are treated as starting on Monday. Find the given date, then step backward to the Monday of that same week.",
    };
  }

  if (subtype === "next_weekday") {
    const wdIndex = randInt(0, 6);
    const target = new Date(refDate);
    let daysAhead = ((wdIndex - refWd + 7) % 7) || 7;
    target.setDate(target.getDate() + daysAhead);
    return {
      category: "calendar",
      visualHTML: `<div class="reference-note">Today is ${WEEKDAY_NAMES[refWd]}, ${MONTH_NAMES[month]} ${refDay}, ${year}.</div>`,
      promptText: `What date is "next ${WEEKDAY_NAMES[wdIndex]}"?`,
      inputs: [
        { id: "mo", label: "Month", type: "select", options: MONTH_NAMES },
        { id: "d", label: "Day", type: "number", min: 1, max: 31 },
      ],
      check: (v) => Number(v.mo) === target.getMonth() && Number(v.d) === target.getDate(),
      correctSummary: () => `${MONTH_NAMES[target.getMonth()]} ${target.getDate()}`,
      hint: `"Next ${WEEKDAY_NAMES[wdIndex]}" means the very next time that weekday comes around — it's always at least 1 day away, never today.`,
    };
  }

  // weeks_from
  const n = randInt(1, tier === "hard" ? 6 : 3);
  const target = new Date(refDate);
  target.setDate(target.getDate() + n * 7);
  return {
    category: "calendar",
    visualHTML: `<div class="reference-note">Today is ${WEEKDAY_NAMES[refWd]}, ${MONTH_NAMES[month]} ${refDay}, ${year}.</div>`,
    promptText: `What date is ${n} week${n > 1 ? "s" : ""} from today?`,
    inputs: [
      { id: "mo", label: "Month", type: "select", options: MONTH_NAMES },
      { id: "d", label: "Day", type: "number", min: 1, max: 31 },
    ],
    check: (v) => Number(v.mo) === target.getMonth() && Number(v.d) === target.getDate(),
    correctSummary: () => `${MONTH_NAMES[target.getMonth()]} ${target.getDate()}`,
    hint: `One week from today is the same weekday, 7 days later. ${n} weeks is ${n * 7} days later.`,
  };
}

function genDateArith(tier) {
  const year = choice([2025, 2026, 2027]);
  const month = randInt(0, 11);
  const dim = daysInMonth(year, month);
  const day = randInt(1, dim);
  const n = tier === "easy" ? randInt(5, 20) : tier === "medium" ? randInt(10, 45) : randInt(20, 90);
  const direction = choice(["before", "after"]);
  const base = new Date(year, month, day);
  const target = new Date(base);
  target.setDate(target.getDate() + (direction === "after" ? n : -n));

  return {
    category: "arith",
    visualHTML: `<div class="date-display">${MONTH_NAMES[month]} ${day}, ${year}</div>`,
    promptText: `What date is ${n} days ${direction} this?`,
    inputs: [
      { id: "mo", label: "Month", type: "select", options: MONTH_NAMES },
      { id: "d", label: "Day", type: "number", min: 1, max: 31 },
      { id: "y", label: "Year", type: "number", min: 2020, max: 2035 },
    ],
    check: (v) => Number(v.mo) === target.getMonth() && Number(v.d) === target.getDate() && Number(v.y) === target.getFullYear(),
    correctSummary: () => `${MONTH_NAMES[target.getMonth()]} ${target.getDate()}, ${target.getFullYear()}`,
    hint: direction === "after"
      ? "Count forward, carrying into the next month (and year, if needed) once you pass the end of a month."
      : "Count backward, borrowing from the previous month (and year, if needed) once you pass day 1.",
  };
}

function genMeetingScheduling(tier) {
  const numPeople = tier === "hard" ? 3 : 2;
  const SLOTS = 20; // 8:00 to 18:00 in 30-min slots

  function slotToHour24Min(slot) {
    const totalMin = 8 * 60 + slot * 30;
    return { h: Math.floor(totalMin / 60), m: totalMin % 60 };
  }

  function genAvailability() {
    const avail = new Array(SLOTS).fill(false);
    const numBlocks = tier === "hard" && Math.random() < 0.5 ? 2 : 1;
    for (let b = 0; b < numBlocks; b++) {
      const len = randInt(3, 8);
      const start = randInt(0, SLOTS - len);
      for (let i = start; i < start + len; i++) avail[i] = true;
    }
    return avail;
  }

  function runsOf(avail) {
    const runs = [];
    let start = null;
    for (let i = 0; i <= SLOTS; i++) {
      if (i < SLOTS && avail[i]) {
        if (start === null) start = i;
      } else if (start !== null) {
        runs.push([start, i]);
        start = null;
      }
    }
    return runs;
  }

  let people, combined, earliestSlot;
  for (let attempt = 0; attempt < 40; attempt++) {
    people = [];
    const names = [...PEOPLE_NAMES].sort(() => Math.random() - 0.5).slice(0, numPeople);
    for (const name of names) people.push({ name, avail: genAvailability() });
    combined = new Array(SLOTS).fill(true);
    for (const p of people) for (let i = 0; i < SLOTS; i++) combined[i] = combined[i] && p.avail[i];
    earliestSlot = combined.findIndex(Boolean);
    if (earliestSlot !== -1) break;
  }
  if (earliestSlot === -1) {
    // guaranteed fallback: force overlap at slot 4
    people.forEach((p) => (p.avail[4] = true));
    earliestSlot = 4;
  }

  const { h: ansH24, m: ansM } = slotToHour24Min(earliestSlot);
  const { hour12: ansH12, ampm: ansAmpm } = to12(ansH24);

  const peopleHTML = people
    .map((p) => {
      const ranges = runsOf(p.avail)
        .map(([s, e]) => {
          const a = slotToHour24Min(s), b = slotToHour24Min(e);
          return `${from24to12Str(a.h, a.m)}–${from24to12Str(b.h, b.m)}`;
        })
        .join(", ");
      return `<div class="person-row"><span class="person-name">${p.name}</span>: ${ranges}</div>`;
    })
    .join("");

  return {
    category: "meeting",
    visualHTML: `<div class="people-list">${peopleHTML}</div>`,
    promptText: `What is the earliest time all ${numPeople === 2 ? "two" : "three"} people could meet for 30 minutes?`,
    inputs: [
      { id: "h", label: "Hour", type: "number", min: 1, max: 12 },
      { id: "m", label: "Minute", type: "select", options: ["00", "30"] },
      { id: "ap", label: "AM/PM", type: "select", options: AMPM },
    ],
    check: (v) => Number(v.h) === ansH12 && (Number(v.m) === 0 ? 0 : 30) === ansM && AMPM[Number(v.ap)] === ansAmpm,
    correctSummary: () => from24to12Str(ansH24, ansM),
    hint: "Find a time that appears in everyone's available list, then pick the earliest one.",
  };
}

const POOLS = {
  easy: [genAnalogContext, genAnalogContext, genConversion24, genConversion24, genWordsContext, genTimeArithAMPM, genTimeArithAMPM, genCalendar, genCalendar, genWeekOf, genDateArith],
  medium: [genAnalogContext, genConversion24, genWordsContext, genTimeArithAMPM, genTimeArithAMPM, genElapsedTime, genElapsedTime, genDurationBetween, genCalendar, genWeekOf, genWeekOf, genDateArith, genMeetingScheduling],
  hard: [genConversion24, genTimeArithAMPM, genTimeArithAMPM, genElapsedTime, genDurationBetween, genDurationBetween, genWeekOf, genWeekOf, genDateArith, genMeetingScheduling, genMeetingScheduling, genMeetingScheduling],
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
  const colors = ["#f97316", "#facc15", "#22c55e", "#0891b2", "#be123c", "#ec4899"];
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
