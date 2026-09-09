// ---------- Config ----------

const CHAR_STORAGE_KEY = "mathQuestCharacterState";

const SKILLS = [
  {
    key: "division",
    storageKey: "longDivisionQuestState",
    name: "Long Division",
    icon: "🧮",
    color: "#7c3aed",
    xpBase: 130,
    url: "../index.html",
    badges: [
      { id: "streak_5", label: "Streak x5" },
      { id: "streak_10", label: "Streak x10" },
      { id: "streak_20", label: "Unstoppable" },
      { id: "hard_solve", label: "Hard Mode Hero" },
      { id: "ludicrous_solve", label: "Ludicrous!" },
      { id: "free_solve", label: "Free Thinker" },
    ],
  },
  {
    key: "addsub",
    storageKey: "additionSubtractionQuestState",
    name: "Add & Subtract",
    icon: "➕➖",
    color: "#0d9488",
    xpBase: 180,
    url: "../addition-subtraction/index.html",
    badges: [
      { id: "streak_5", label: "Streak x5" },
      { id: "streak_10", label: "Streak x10" },
      { id: "streak_20", label: "Unstoppable" },
      { id: "three_digit_solve", label: "Three-Digit Champ" },
      { id: "carry_solve", label: "Carry Captain" },
      { id: "borrow_solve", label: "Borrow Boss" },
    ],
  },
  {
    key: "datetime1",
    storageKey: "dateTime1QuestState",
    name: "Time & Calendar 1",
    icon: "🕐",
    color: "#4f46e5",
    xpBase: 130,
    url: "../datetime1/index.html",
    badges: [
      { id: "streak_5", label: "Streak x5" },
      { id: "streak_10", label: "Streak x10" },
      { id: "streak_20", label: "Unstoppable" },
      { id: "hard_solve", label: "Hard Mode Hero" },
      { id: "clock_solve", label: "Clock Star" },
      { id: "calendar_solve", label: "Calendar Wiz" },
      { id: "arith_solve", label: "Time Traveler" },
    ],
  },
  {
    key: "datetime2",
    storageKey: "dateTime2QuestState",
    name: "Time & Calendar 2",
    icon: "🗓️",
    color: "#be123c",
    xpBase: 175,
    url: "../datetime2/index.html",
    badges: [
      { id: "streak_5", label: "Streak x5" },
      { id: "streak_10", label: "Streak x10" },
      { id: "streak_20", label: "Unstoppable" },
      { id: "hard_solve", label: "Hard Mode Hero" },
      { id: "clock_solve", label: "Clock Star" },
      { id: "calendar_solve", label: "Calendar Wiz" },
      { id: "arith_solve", label: "Time Traveler" },
      { id: "meeting_solve", label: "Scheduling Pro" },
    ],
  },
  {
    key: "multiplication1",
    storageKey: "multiplication1QuestState",
    name: "Multiplication 1",
    icon: "✖️",
    color: "#4d7c0f",
    xpBase: 130,
    url: "../multiplication1/index.html",
    badges: [
      { id: "streak_5", label: "Streak x5" },
      { id: "streak_10", label: "Streak x10" },
      { id: "streak_20", label: "Unstoppable" },
      { id: "hard_solve", label: "Hard Mode Hero" },
      { id: "missing_factor_solve", label: "Fact Finder" },
      { id: "word_solve", label: "Story Solver" },
    ],
  },
  {
    key: "multiplication2",
    storageKey: "multiplication2QuestState",
    name: "Multiplication 2",
    icon: "🧩",
    color: "#6d28d9",
    xpBase: 175,
    url: "../multiplication2/index.html",
    badges: [
      { id: "streak_5", label: "Streak x5" },
      { id: "streak_10", label: "Streak x10" },
      { id: "streak_20", label: "Unstoppable" },
      { id: "hard_solve", label: "Hard Mode Hero" },
      { id: "decimal_solve", label: "Decimal Dynamo" },
      { id: "mixed_solve", label: "Fraction Master" },
    ],
  },
  {
    key: "money1",
    storageKey: "money1QuestState",
    name: "Money 1",
    icon: "🪙",
    color: "#b45309",
    xpBase: 130,
    url: "../money1/index.html",
    badges: [
      { id: "streak_5", label: "Streak x5" },
      { id: "streak_10", label: "Streak x10" },
      { id: "streak_20", label: "Unstoppable" },
      { id: "hard_solve", label: "Hard Mode Hero" },
      { id: "mix_solve", label: "Coin Collector" },
      { id: "change_solve", label: "Change Champ" },
    ],
  },
  {
    key: "money2",
    storageKey: "money2QuestState",
    name: "Money 2",
    icon: "💵",
    color: "#0e7490",
    xpBase: 175,
    url: "../money2/index.html",
    badges: [
      { id: "streak_5", label: "Streak x5" },
      { id: "streak_10", label: "Streak x10" },
      { id: "streak_20", label: "Unstoppable" },
      { id: "hard_solve", label: "Hard Mode Hero" },
      { id: "tax_solve", label: "Tax Whiz" },
      { id: "deal_solve", label: "Deal Detective" },
    ],
  },
  {
    key: "rulers1",
    storageKey: "rulers1QuestState",
    name: "Rulers 1",
    icon: "📏",
    color: "#0369a1",
    xpBase: 130,
    url: "../rulers1/index.html",
    badges: [
      { id: "streak_5", label: "Streak x5" },
      { id: "streak_10", label: "Streak x10" },
      { id: "streak_20", label: "Unstoppable" },
      { id: "hard_solve", label: "Hard Mode Hero" },
      { id: "read_solve", label: "Ruler Reader" },
      { id: "compare_solve", label: "Length Detective" },
    ],
  },
  {
    key: "rulers2",
    storageKey: "rulers2QuestState",
    name: "Rulers 2",
    icon: "📐",
    color: "#334155",
    xpBase: 175,
    url: "../rulers2/index.html",
    badges: [
      { id: "streak_5", label: "Streak x5" },
      { id: "streak_10", label: "Streak x10" },
      { id: "streak_20", label: "Unstoppable" },
      { id: "hard_solve", label: "Hard Mode Hero" },
      { id: "convert_solve", label: "Unit Converter" },
      { id: "mixed_solve", label: "Tape Measure Pro" },
    ],
  },
];

const RANKS = [
  { min: 0, title: "Math Cadet" },
  { min: 8, title: "Math Squire" },
  { min: 12, title: "Math Knight" },
  { min: 16, title: "Math Champion" },
  { min: 22, title: "Math Grandmaster" },
];

// ---------- Helpers ----------

function loadSkillStats(storageKey) {
  const defaults = { score: 0, xp: 0, level: 1, streak: 0, bestStreak: 0, earnedBadges: [] };
  try {
    const raw = localStorage.getItem(storageKey);
    if (!raw) return defaults;
    return Object.assign(defaults, JSON.parse(raw));
  } catch (e) {
    return defaults;
  }
}

function loadCharState() {
  const defaults = { name: "", avatarDataUrl: null };
  try {
    const raw = localStorage.getItem(CHAR_STORAGE_KEY);
    if (!raw) return defaults;
    return Object.assign(defaults, JSON.parse(raw));
  } catch (e) {
    return defaults;
  }
}

function saveCharState() {
  localStorage.setItem(CHAR_STORAGE_KEY, JSON.stringify(charState));
}

let charState = loadCharState();

function rankForLevelSum(sum) {
  let title = RANKS[0].title;
  for (const r of RANKS) {
    if (sum >= r.min) title = r.title;
  }
  return title;
}

// ---------- Rendering ----------

function renderHeader() {
  document.getElementById("nameInput").value = charState.name || "";
  const img = document.getElementById("avatarImg");
  const placeholder = document.getElementById("avatarPlaceholder");
  if (charState.avatarDataUrl) {
    img.src = charState.avatarDataUrl;
    img.hidden = false;
    placeholder.hidden = true;
  } else {
    img.hidden = true;
    placeholder.hidden = false;
  }

  const levelSum = SKILLS.reduce((sum, s) => sum + loadSkillStats(s.storageKey).level, 0);
  document.getElementById("rankTitle").textContent = rankForLevelSum(levelSum);
  document.getElementById("rankSub").textContent = `Combined level ${levelSum} across all skills`;
}

function renderSkills() {
  const grid = document.getElementById("skillsGrid");
  grid.innerHTML = "";
  SKILLS.forEach((skill) => {
    const stats = loadSkillStats(skill.storageKey);
    const threshold = skill.xpBase * stats.level;
    const pct = Math.min(100, Math.round((stats.xp / threshold) * 100));
    const earnedCount = skill.badges.filter((b) => stats.earnedBadges.includes(b.id)).length;

    const card = document.createElement("div");
    card.className = "skill-card";
    card.style.setProperty("--skill-color", skill.color);
    card.innerHTML = `
      <div class="skill-card-header">
        <span class="skill-icon">${skill.icon}</span>
        <span class="skill-name">${skill.name}</span>
        <span class="skill-level-badge">Lv ${stats.level}</span>
      </div>
      <div class="skill-xp-bar"><div class="skill-xp-fill" style="width:${pct}%"></div></div>
      <div class="skill-xp-label">${stats.xp} / ${threshold} XP</div>
      <div class="skill-stats-row">
        <span>Score: <b>${stats.score}</b></span>
        <span>Best streak: <b>${stats.bestStreak}</b></span>
        <span>Badges: <b>${earnedCount}/${skill.badges.length}</b></span>
      </div>
      <div class="skill-badges">
        ${skill.badges
          .map((b) => {
            const earned = stats.earnedBadges.includes(b.id);
            return `<span class="skill-badge ${earned ? "earned" : ""}">${earned ? "🏆" : "🔒"} ${b.label}</span>`;
          })
          .join("")}
      </div>
      <a class="skill-play-link" href="${skill.url}">▶ Play</a>
    `;
    grid.appendChild(card);
  });
}

// ---------- Avatar upload ----------

function handleAvatarFile(file) {
  if (!file || !file.type.startsWith("image/")) return;
  const reader = new FileReader();
  reader.onload = () => {
    const img = new Image();
    img.onload = () => {
      const size = 160;
      const canvas = document.createElement("canvas");
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext("2d");
      const scale = Math.max(size / img.width, size / img.height);
      const w = img.width * scale, h = img.height * scale;
      ctx.drawImage(img, (size - w) / 2, (size - h) / 2, w, h);
      charState.avatarDataUrl = canvas.toDataURL("image/jpeg", 0.85);
      saveCharState();
      renderHeader();
    };
    img.src = reader.result;
  };
  reader.readAsDataURL(file);
}

// ---------- Init ----------

function init() {
  renderHeader();
  renderSkills();

  document.getElementById("avatarCircle").addEventListener("click", () => {
    document.getElementById("avatarInput").click();
  });
  document.getElementById("avatarBtn").addEventListener("click", () => {
    document.getElementById("avatarInput").click();
  });
  document.getElementById("avatarInput").addEventListener("change", (e) => {
    const file = e.target.files[0];
    handleAvatarFile(file);
  });

  const nameInput = document.getElementById("nameInput");
  nameInput.addEventListener("blur", () => {
    charState.name = nameInput.value.trim();
    saveCharState();
  });
  nameInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") nameInput.blur();
  });
}

init();
