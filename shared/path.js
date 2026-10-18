// Shared "path" progression for the math quests: no level picker. Each quest starts on its
// easiest tier, slowly mixes in the next tier until that's all you get, then does the same with
// the next one. Every quest page gets 15 badges spread along the way.

const PATH_CONFIG = {
  division: {
    tiers: ["normal", "hard", "ludicrous"],
    labels: ["Normal", "Hard", "Ludicrous"],
    modes: true,
    cats: { remainder: ["Remainder Ranger", ["remainder"]] },
  },
  addsub: {
    tiers: ["twoDigit", "threeDigit"],
    labels: ["Two-Digit", "Three-Digit"],
    modes: false,
    cats: { carry: ["Carry Captain", ["carry"]], borrow: ["Borrow Boss", ["borrow"]] },
  },
  datetime1: {
    tiers: ["easy", "medium", "hard"],
    labels: ["Easy", "Medium", "Hard"],
    modes: true,
    cats: { clock: ["Clock Star", ["clock"]], calendar: ["Calendar Wiz", ["calendar"]], arith: ["Time Traveler", ["arith"]] },
  },
  datetime2: {
    tiers: ["easy", "medium", "hard"],
    labels: ["Easy", "Medium", "Hard"],
    modes: true,
    cats: {
      clock: ["Clock Star", ["clock"]],
      calendar: ["Calendar Wiz", ["calendar"]],
      arith: ["Time Traveler", ["arith"]],
      meeting: ["Scheduling Pro", ["meeting"]],
    },
  },
  multiplication1: {
    tiers: ["easy", "medium", "hard"],
    labels: ["Easy", "Medium", "Hard"],
    modes: true,
    cats: { multiply: ["Times Table Ace", ["multiply"]], missing: ["Fact Finder", ["missingFactor"]], word: ["Story Solver", ["word"]] },
  },
  multiplication2: {
    tiers: ["easy", "medium", "hard"],
    labels: ["Easy", "Medium", "Hard"],
    modes: true,
    cats: {
      decimal: ["Decimal Dynamo", ["decimalWhole", "decimalDecimal", "mixedDecimal"]],
      mixed: ["Fraction Master", ["mixedWhole", "mixedMixed", "mixedDecimal"]],
    },
  },
  money1: {
    tiers: ["easy", "medium", "hard"],
    labels: ["Easy", "Medium", "Hard"],
    modes: true,
    cats: { count: ["Coin Counter", ["coinCount"]], mix: ["Coin Collector", ["coinMix"]], change: ["Change Champ", ["change"]] },
  },
  money2: {
    tiers: ["easy", "medium", "hard"],
    labels: ["Easy", "Medium", "Hard"],
    modes: true,
    cats: {
      sale: ["Sale Spotter", ["discount", "discountTax"]],
      tip: ["Tip Pro", ["tip"]],
      tax: ["Tax Whiz", ["tax", "discountTax"]],
      deal: ["Deal Detective", ["betterDeal"]],
    },
  },
  rulers1: {
    tiers: ["easy", "hard"],
    labels: ["Easy", "Hard"],
    modes: true,
    cats: { read: ["Ruler Reader", ["read"]], arith: ["Length Adder", ["arith"]], compare: ["Length Detective", ["compare"]] },
  },
  rulers2: {
    tiers: ["easy", "hard"],
    labels: ["Easy", "Hard"],
    modes: true,
    cats: {
      read: ["Ruler Reader", ["read"]],
      convert: ["Unit Converter", ["convert"]],
      mixed: ["Tape Measure Pro", ["mixedArith"]],
      word: ["Project Planner", ["wordProblem"]],
    },
  },
  angles1: {
    tiers: ["easy", "medium", "hard"],
    labels: ["Easy", "Medium", "Hard"],
    modes: true,
    cats: {
      type: ["Angle Spotter", ["type"]],
      turn: ["Turn Master", ["turn"]],
      count: ["Angle Counter", ["count"]],
      compare: ["Angle Judge", ["compare"]],
    },
  },
  angles2: {
    tiers: ["easy", "medium", "hard"],
    labels: ["Easy", "Medium", "Hard"],
    modes: true,
    cats: {
      measure: ["Protractor Pro", ["measure"]],
      classify: ["Shape Sorter", ["classify"]],
      sum: ["Angle Adder", ["sum", "addition"]],
      clock: ["Clock Angles", ["clock"]],
    },
  },
  sentences: {
    tiers: ["easy", "medium", "hard"],
    labels: ["Easy", "Medium", "Hard"],
    modes: true,
    cats: {
      addsub: ["Plus & Minus Pro", ["addsub"]],
      muldiv: ["Groups Guru", ["muldiv"]],
      multistep: ["Parentheses Pro", ["multistep"]],
      extra: ["Distraction Detective", ["extra"]],
    },
  },
};

const PATH_BADGE_TOTAL = 15;
const CAT_GOAL = 5;

// Progress points: +1 per correct answer, −1 per miss (never below 0).
function pathSchedule(n) {
  if (n === 2) return { warm: 10, ramps: [{ start: 10, len: 25 }], master: 60 };
  return { warm: 8, ramps: [{ start: 8, len: 20 }, { start: 38, len: 20 }], master: 78 };
}

const Path = {
  create(id) {
    const cfg = PATH_CONFIG[id];
    const n = cfg.tiers.length;
    const sched = pathSchedule(n);
    const top = n - 1;
    const L = cfg.labels;
    const st = (s) => {
      if (!s.paths) s.paths = {};
      if (!s.paths[id]) s.paths[id] = { p: 0, total: 0, streak: 0, highStreak: 0, topStreak: 0, best: 0, bestHigh: 0, bestTop: 0, free: 0, tiers: Array(n).fill(0), cats: {} };
      const x = s.paths[id];
      if (!x.seeded) carryOver(s, x);
      return x;
    };

    // Kids who played before the path existed (badges are paid out, so nothing quick should be re-earnable):
    // skip the Easy warm-up, and pre-award — marked "carried over" — the quick badges their history already proves.
    function carryOver(s, x) {
      x.seeded = true;
      const hadHistory = (s.totalSolved || 0) - x.total > 0 || (s.earnedBadges || []).some((b) => !b.includes(":"));
      if (!hadHistory) return;
      x.p = Math.max(x.p, sched.warm + 2);
      s.carriedBadges = s.carriedBadges || [];
      const proven = [[`${id}:first`, true], [`${id}:streak5`, (s.bestStreak || 0) >= 5]];
      proven.forEach(([bid, ok]) => {
        if (ok && !s.earnedBadges.includes(bid)) {
          s.earnedBadges.push(bid);
          s.carriedBadges.push(bid);
        }
      });
    }
    const allAt1 = sched.ramps[0].start + sched.ramps[0].len;

    // Milestones along the path; categories fill in the middle, extras top it up to 15.
    const B = (key, label, req, check) => ({ id: `${id}:${key}`, label, req, check: (s) => check(st(s)) });
    const early = [
      B("first", "First Steps", "Solve 1 problem", (x) => x.total >= 1),
      B("streak5", "Warming Up", "5 in a row", (x) => x.best >= 5),
      B("t1first", `${L[1]} Rookie`, `Solve your first ${L[1]} problem`, (x) => x.tiers[1] >= 1),
      B("t1x10", `${L[1]} x10`, `Solve 10 ${L[1]} problems`, (x) => x.tiers[1] >= 10),
      B("high10", "On a Roll", `10 in a row on ${L[1]} or harder`, (x) => x.bestHigh >= 10),
      B("t1all", `All ${L[1]}`, `Reach the all-${L[1]} part of the path`, (x) => x.p >= allAt1),
    ];
    const cats = Object.entries(cfg.cats).map(([key, [label]]) =>
      B(`cat_${key}`, label, `${CAT_GOAL} on ${L[1]} or harder`, (x) => (x.cats[key] || 0) >= CAT_GOAL)
    );
    const late =
      n === 3
        ? [
            B("t2first", `${L[2]} Rookie`, `Solve your first ${L[2]} problem`, (x) => x.tiers[2] >= 1),
            B("t2x10", `${L[2]} x10`, `Solve 10 ${L[2]} problems`, (x) => x.tiers[2] >= 10),
            B("free15", "Free Thinker", `15 in Free Mode on ${L[1]} or harder`, (x) => x.free >= 15),
            B("top10", "Unstoppable", `10 in a row on ${L[2]}`, (x) => x.bestTop >= 10),
            B("t2x25", `${L[2]} x25`, `Solve 25 ${L[2]} problems`, (x) => x.tiers[2] >= 25),
          ]
        : [
            B("t1x20", `${L[1]} x20`, `Solve 20 ${L[1]} problems`, (x) => x.tiers[1] >= 20),
            B("free15", "Free Thinker", `15 in Free Mode on ${L[1]}`, (x) => x.free >= 15),
            B("top10", "Unstoppable", `15 in a row on ${L[1]}`, (x) => x.bestTop >= 15),
            B("t1x30", `${L[1]} x30`, `Solve 30 ${L[1]} problems`, (x) => x.tiers[1] >= 30),
          ];
    // Capstone: finishing the path isn't enough — mastery means every other badge too (Free Mode stays optional).
    const master = {
      id: `${id}:master`,
      label: "Master",
      req: `Finish the path and earn every other badge`,
      check: (s) => st(s).p >= sched.master && badges.every((b) => b === master || b.id.endsWith(":free15") || b.check(s)),
    };
    // Scaled to the path so they always land before mastery (total solves ≥ progress points).
    const fillers = [
      ["Keep Going", 0.5], ["Dedicated", 0.75], ["Marathon", 0.95],
    ].map(([label, k]) => {
      const goal = Math.round(sched.master * k);
      return B(`total${goal}`, label, `Solve ${goal} problems`, (x) => x.total >= goal);
    });
    let lateList = late.filter((b) => cfg.modes || !b.id.endsWith(":free15"));
    let count = early.length + cats.length + lateList.length + 1;
    while (count > PATH_BADGE_TOTAL) {
      const dropAt = lateList.findIndex((b) => b.id.endsWith(":free15") || b.id.endsWith(":top10"));
      lateList.splice(dropAt, 1);
      count--;
    }
    const extras = fillers.slice(0, PATH_BADGE_TOTAL - count);
    const badges = [...early, ...cats, ...lateList, ...extras, master];

    const catOf = {};
    Object.entries(cfg.cats).forEach(([key, [, raw]]) => raw.forEach((r) => (catOf[r] = catOf[r] || []).push(key)));

    function mix(p) {
      // Weight of each tier at progress p.
      const w = Array(n).fill(0);
      let cur = 0;
      let frac = 0;
      sched.ramps.forEach((r, i) => {
        if (p >= r.start + r.len) cur = i + 1;
        else if (p >= r.start && cur === i) frac = (p - r.start) / r.len;
      });
      if (cur >= top) {
        w[top] = 1;
      } else {
        w[cur] = 1 - frac;
        w[cur + 1] = frac;
      }
      return w;
    }

    return {
      id,
      badges,
      tiers: cfg.tiers,
      pickTier(stats) {
        const w = mix(st(stats).p);
        let r = Math.random();
        for (let i = 0; i < n; i++) {
          r -= w[i];
          if (r < 0) return cfg.tiers[i];
        }
        return cfg.tiers[top];
      },
      onSolve(stats, tier, tags, mode) {
        const x = st(stats);
        const i = Math.max(0, cfg.tiers.indexOf(tier));
        x.p += 1;
        x.total += 1;
        x.tiers[i] += 1;
        x.streak += 1;
        x.best = Math.max(x.best, x.streak);
        if (i >= 1) {
          x.highStreak += 1;
          x.bestHigh = Math.max(x.bestHigh, x.highStreak);
          if (mode === "free") x.free += 1;
          (tags || []).forEach((t) => (catOf[t] || []).forEach((k) => (x.cats[k] = (x.cats[k] || 0) + 1)));
        }
        if (i === top) {
          x.topStreak += 1;
          x.bestTop = Math.max(x.bestTop, x.topStreak);
        }
      },
      onMiss(stats) {
        const x = st(stats);
        x.p = Math.max(0, x.p - 1);
        x.streak = 0;
        x.highStreak = 0;
        x.topStreak = 0;
      },
      renderMeter(stats, currentTier) {
        const el = document.getElementById("pathMeter");
        if (!el) return;
        const x = st(stats);
        const pct = Math.min(100, (x.p / sched.master) * 100);
        const w = mix(x.p);
        const i = w.findIndex((v) => v > 0);
        let now;
        if (x.p >= sched.master) now = `🏆 ${L[top]} mastered! Keep it sharp.`;
        else if (w[i] === 1 && i === 0) now = `${L[0]} problems — ${L[1]} ones start showing up soon!`;
        else if (w[i] === 1) now = `All ${L[i]} problems${i < top ? ` — ${L[i + 1]} ones are coming!` : " — keep going to master it!"}`;
        else now = `Mostly ${L[i]}, with ${Math.round(w[i + 1] * 100)}% ${L[i + 1]} mixed in`;
        const marks = [{ at: 0, label: L[0] }]
          .concat(sched.ramps.map((r, k) => ({ at: (r.start / sched.master) * 100, label: L[k + 1] })))
          .concat([{ at: 100, label: "🏆" }]);
        const ti = Math.max(0, cfg.tiers.indexOf(currentTier));
        el.innerHTML = `
          <div class="path-head"><span>Your path</span><span class="path-tier tier-${ti}">This one: ${L[ti]}</span></div>
          <div class="path-track"><div class="path-fill" style="width:${pct}%"></div>
            ${marks.map((m) => `<span class="path-mark" style="left:${m.at}%"></span>`).join("")}</div>
          <div class="path-labels">${marks.map((m) => `<span style="left:${m.at}%">${m.label}</span>`).join("")}</div>
          <div class="path-now">${now}</div>`;
      },
      renderBadges(stats) {
        const row = document.getElementById("badgesRow");
        row.innerHTML = "";
        const earnedCount = badges.filter((b) => stats.earnedBadges.includes(b.id)).length;
        const head = document.getElementById("badgesCount");
        if (head) head.textContent = `${earnedCount} / ${badges.length}`;
        badges.forEach((b) => {
          const el = document.createElement("div");
          const earned = stats.earnedBadges.includes(b.id);
          const carried = earned && (stats.carriedBadges || []).includes(b.id);
          el.className = "badge" + (earned ? " earned" : "") + (carried ? " carried" : "");
          el.title = carried ? "Carried over from before the update" : b.req;
          el.innerHTML = carried
            ? `✔️ ${b.label}<span class="badge-req">carried over</span>`
            : earned
            ? `🏆 ${b.label}`
            : `🔒 ${b.label}<span class="badge-req">${b.req}</span>`;
          row.appendChild(el);
        });
      },
    };
  },
};
