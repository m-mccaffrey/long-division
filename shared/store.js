// Desktop app persistence. When served by desktop/server.py (localhost), progress lives in a
// save file on disk: load it into localStorage before any quest script runs, and write every
// change back. On the public website this does nothing.
(() => {
  if (!/^(127\.0\.0\.1|localhost)$/.test(location.hostname)) return;

  try {
    // Synchronous on purpose: the quest scripts read localStorage as soon as they load.
    const xhr = new XMLHttpRequest();
    xhr.open("GET", "/api/save", false);
    xhr.send();
    if (xhr.status === 200) {
      const saved = JSON.parse(xhr.responseText);
      if (Object.keys(saved).length) {
        localStorage.clear();
        Object.entries(saved).forEach(([k, v]) => localStorage.setItem(k, v));
      }
    }
  } catch (e) {
    console.warn("Could not load the save file; using browser storage for now.", e);
  }

  let timer = null;
  function push() {
    timer = null;
    const snapshot = {};
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      snapshot[k] = localStorage.getItem(k);
    }
    fetch("/api/save", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(snapshot), keepalive: true }).catch(() => {});
  }
  const schedule = () => {
    if (!timer) timer = setTimeout(push, 250);
  };
  for (const name of ["setItem", "removeItem", "clear"]) {
    const orig = Storage.prototype[name];
    Storage.prototype[name] = function (...args) {
      const result = orig.apply(this, args);
      if (this === localStorage) schedule();
      return result;
    };
  }
  window.addEventListener("pagehide", () => {
    if (timer) {
      clearTimeout(timer);
      push();
    }
  });
})();
