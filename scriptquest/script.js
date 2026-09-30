// ---------- Scene data ----------
// Each scene is a sequence of screenplay elements. "action" elements are
// shown as read-only context. "dialogue" elements are the lines the user
// translates into their own words; `cont: true` marks a line that continues
// the same character's speech after an intervening action beat.

const SCENES = [
  {
    id: "true-grit-campfire",
    title: "Campfire",
    source: "True Grit (2010 screenplay, Joel & Ethan Coen)",
    pageNote: "pp. 46–48",
    elements: [
      { type: "slug", text: "CAMPFIRE" },
      { type: "action", text: "Mattie sits looking into the fire, hands clasped around her knees." },
      {
        type: "action",
        text: "LeBoeuf sits feet to the fire, smoking a pipe that, with his boyish face, makes him look as if he is playing at professor. He gazes into the fire, musing as he pulls at the pipe.",
      },
      {
        type: "dialogue",
        character: "LeBoeuf",
        text: "I am not accustomed to so large a fire. In Texas, we will make do with a fire of little more than twigs or buffalo chips to heat the night's ration of beans.",
      },
      { type: "action", text: "Rooster enters the circle of light with an armload of wood." },
      {
        type: "dialogue",
        character: "LeBoeuf",
        cont: true,
        text: ". . . And, it is Ranger policy never to make your camp in the same place as your cookfire. Very imprudent to make your presence known in unsettled country.",
      },
      {
        type: "action",
        text: "Rooster gazes at LeBoeuf for a beat, then dumps the wood onto the fire. He leaves the circle of light. LeBoeuf addresses the darkness that Rooster has disappeared into:",
      },
      { type: "dialogue", character: "LeBoeuf", cont: true, text: ". . . How do you know that Bagby will have intelligence?" },
      { type: "dialogue", character: "Rooster", text: "He has a store." },
      { type: "action", text: "He reenters with a length of rope, and a robe which he unrolls onto the ground." },
      { type: "dialogue", character: "LeBoeuf", text: "A store. That makes him an authority on movements in the Territory?" },
      { type: "action", text: "Rooster plays out one end of the rope to just touch the ground, then starts playing out the rest as he paces." },
      {
        type: "dialogue",
        character: "Rooster",
        text: "We have entered a wild place. Anyone coming in, wanting any kind of supply, cannot pick and choose his portal.",
      },
      { type: "action", text: "He has finished making a loop around his sleeping robe. Seeing this, LeBoeuf laughs." },
      { type: "dialogue", character: "LeBoeuf", text: "That is a piece of foolishness. All the snakes are asleep this time of year." },
    ],
  },
];

// ---------- Config ----------

const POINTS_PER_LINE = 8;

const BADGE_DEFS = [
  { id: "first_line", label: "First Steps", check: (s) => s.linesTranslated >= 1 },
  { id: "getting_fluent", label: "Getting Fluent", check: (s) => s.linesTranslated >= 25 },
  { id: "wordsmith", label: "Wordsmith", check: (s) => s.linesTranslated >= 100 },
  { id: "scene_stealer", label: "Scene Stealer", check: (s) => s.scenesCompleted >= 1 },
  { id: "bookworm", label: "Bookworm", check: (s) => s.scenesCompleted >= 3 },
];

const STORAGE_KEY = "scriptQuestState";

// ---------- Persisted stats ----------

function loadStats() {
  const defaults = {
    xp: 0,
    level: 1,
    linesTranslated: 0,
    scenesCompleted: 0,
    earnedBadges: [],
    progress: {}, // sceneId -> { answers: [...], index: number, completed: bool }
  };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaults;
    const parsed = JSON.parse(raw);
    if (!parsed.progress) parsed.progress = {};
    return Object.assign(defaults, parsed);
  } catch (e) {
    return defaults;
  }
}

function saveStats() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(stats));
}

let stats = loadStats();

function xpForLevel(level) {
  return 100 * level;
}

function addXP(amount) {
  stats.xp += amount;
  while (stats.xp >= xpForLevel(stats.level)) {
    stats.xp -= xpForLevel(stats.level);
    stats.level += 1;
  }
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
  saveStats();
  renderBadges();
}

// ---------- App state ----------

let activeSceneId = null;

function dialogueIndexes(scene) {
  const result = [];
  scene.elements.forEach((el, i) => {
    if (el.type === "dialogue") result.push(i);
  });
  return result;
}

function getProgress(sceneId) {
  if (!stats.progress[sceneId]) {
    stats.progress[sceneId] = { answers: [], index: 0, completed: false };
  }
  return stats.progress[sceneId];
}

// ---------- Rendering: stats & badges ----------

function renderStats() {
  document.getElementById("statLevel").textContent = stats.level;
  document.getElementById("statLines").textContent = stats.linesTranslated;
  document.getElementById("statScenes").textContent = stats.scenesCompleted;
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
    piece.style.background = colors[Math.floor(Math.random() * colors.length)];
    const duration = 1.8 + Math.random() * 1.4;
    piece.style.animationDuration = duration + "s";
    piece.style.animationDelay = Math.random() * 0.3 + "s";
    layer.appendChild(piece);
    setTimeout(() => piece.remove(), (duration + 0.5) * 1000);
  }
}

// ---------- View switching ----------

function showView(name) {
  document.getElementById("sceneSelectView").hidden = name !== "select";
  document.getElementById("practiceView").hidden = name !== "practice";
  document.getElementById("reviewView").hidden = name !== "review";
}

// ---------- Scene select ----------

function renderSceneList() {
  const list = document.getElementById("sceneList");
  list.innerHTML = "";
  SCENES.forEach((scene) => {
    const dIdx = dialogueIndexes(scene);
    const prog = getProgress(scene.id);
    const answeredCount = prog.answers.filter((a) => a !== undefined && a !== null).length;

    const card = document.createElement("div");
    card.className = "scene-card";
    let statusHTML;
    if (prog.completed) {
      statusHTML = `<span class="scene-card-status done">Completed</span>`;
    } else if (answeredCount > 0) {
      statusHTML = `<span class="scene-card-status">In progress</span>`;
    } else {
      statusHTML = `<span class="scene-card-status">Not started</span>`;
    }
    card.innerHTML = `
      <div class="scene-card-title">${scene.title}</div>
      <div class="scene-card-source">${scene.source}${scene.pageNote ? " — " + scene.pageNote : ""}</div>
      ${statusHTML}
      <div class="scene-card-progress">${answeredCount} / ${dIdx.length} lines translated</div>
      <button class="btn primary sceneOpenBtn" data-scene="${scene.id}">${prog.completed ? "📖 Review" : answeredCount > 0 ? "▶ Continue" : "▶ Start"}</button>
    `;
    list.appendChild(card);
  });

  list.querySelectorAll(".sceneOpenBtn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const sceneId = btn.dataset.scene;
      const prog = getProgress(sceneId);
      if (prog.completed) {
        openReview(sceneId);
      } else {
        openPractice(sceneId);
      }
    });
  });
}

// ---------- Practice view ----------

function elementHTML(el, opts) {
  opts = opts || {};
  if (el.type === "slug") {
    return `<div class="slug-line">${el.text}</div>`;
  }
  if (el.type === "action") {
    return `<div class="action-text">${el.text}</div>`;
  }
  const contLabel = el.cont ? `<span class="cont">(CONT'D)</span>` : "";
  const dialogueClass = "dialogue-block" + (opts.current ? " current" : "");
  return `<div class="character-cue">${el.character}${contLabel}</div><div class="${dialogueClass}">${el.text}</div>`;
}

function openPractice(sceneId) {
  activeSceneId = sceneId;
  showView("practice");
  renderPracticeLine();
}

function renderPracticeLine() {
  const scene = SCENES.find((s) => s.id === activeSceneId);
  const dIdx = dialogueIndexes(scene);
  const prog = getProgress(activeSceneId);

  if (prog.index >= dIdx.length) {
    finishScene();
    return;
  }

  document.getElementById("practiceTitle").textContent = `${scene.title} — ${scene.source}`;
  const pct = Math.round((prog.index / dIdx.length) * 100);
  document.getElementById("progressFill").style.width = pct + "%";
  document.getElementById("progressLabel").textContent = `Line ${prog.index + 1} of ${dIdx.length}`;

  const currentElIndex = dIdx[prog.index];
  const context = document.getElementById("scriptContext");
  context.innerHTML = scene.elements
    .slice(0, currentElIndex + 1)
    .map((el, i) => elementHTML(el, { current: i === currentElIndex }))
    .join("");
  context.scrollTop = context.scrollHeight;

  const input = document.getElementById("translationInput");
  input.value = "";
  input.focus();
}

function submitLine() {
  const scene = SCENES.find((s) => s.id === activeSceneId);
  const dIdx = dialogueIndexes(scene);
  const prog = getProgress(activeSceneId);
  const input = document.getElementById("translationInput");
  const value = input.value.trim();

  if (!value) {
    input.focus();
    return;
  }

  prog.answers[prog.index] = value;
  prog.index += 1;
  stats.linesTranslated += 1;
  addXP(POINTS_PER_LINE);
  checkBadges();
  saveStats();

  if (prog.index >= dIdx.length) {
    finishScene();
  } else {
    renderPracticeLine();
  }
}

function finishScene() {
  const prog = getProgress(activeSceneId);
  if (!prog.completed) {
    prog.completed = true;
    stats.scenesCompleted += 1;
    checkBadges();
    saveStats();
    renderStats();
    launchConfetti();
  }
  openReview(activeSceneId);
}

// ---------- Review view ----------

function openReview(sceneId) {
  activeSceneId = sceneId;
  showView("review");
  renderReview();
}

function renderReview() {
  const scene = SCENES.find((s) => s.id === activeSceneId);
  const prog = getProgress(activeSceneId);
  document.getElementById("reviewTitle").textContent = `${scene.title} — ${scene.source}`;

  const grid = document.getElementById("reviewGrid");
  let dialogueCounter = -1;
  const rows = [`<div class="review-row"><div class="review-col-heading">Script</div><div class="review-col-heading">Your translation</div></div>`];

  scene.elements.forEach((el) => {
    if (el.type === "slug") {
      rows.push(`<div class="review-row action-row"><div class="slug-line">${el.text}</div></div>`);
      return;
    }
    if (el.type === "action") {
      rows.push(`<div class="review-row action-row"><div class="action-text">${el.text}</div></div>`);
      return;
    }
    dialogueCounter += 1;
    const contLabel = el.cont ? `<span class="cont">(CONT'D)</span>` : "";
    const answer = prog.answers[dialogueCounter];
    const answerHTML = answer ? answer.replace(/</g, "&lt;") : "";
    rows.push(`
      <div class="review-row">
        <div class="review-col original"><div class="character-cue">${el.character}${contLabel}</div><div class="dialogue-block">${el.text}</div></div>
        <div class="review-col mine ${answer ? "" : "empty"}">${answer ? answerHTML : "(not answered)"}</div>
      </div>
    `);
  });

  grid.innerHTML = rows.join("");
}

function redoScene() {
  stats.progress[activeSceneId] = { answers: [], index: 0, completed: false };
  saveStats();
  openPractice(activeSceneId);
}

// ---------- Init ----------

function init() {
  renderStats();
  renderBadges();
  renderSceneList();
  showView("select");

  document.getElementById("submitLineBtn").addEventListener("click", submitLine);
  document.getElementById("translationInput").addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      submitLine();
    }
  });
  document.getElementById("backToScenesBtn").addEventListener("click", () => {
    renderSceneList();
    showView("select");
  });
  document.getElementById("backToScenesBtn2").addEventListener("click", () => {
    renderSceneList();
    showView("select");
  });
  document.getElementById("redoSceneBtn").addEventListener("click", redoScene);
}

init();
