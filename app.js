// app.js — UI-Steuerung, Bildschirmwechsel und Karten-Rendering
import { Game } from "./game.js";
import { REGIONS_DEF, EDGES } from "./map.js";
import { NINJA_CLASSES, SPECIALS, CLANS } from "./models.js";
import { totalTroops } from "./battle.js";
import { loadGame, hasSave, saveSettings, loadSettings } from "./save.js";

// ===== Hilfsfunktionen =====
const $ = sel => document.querySelector(sel);
const $$ = sel => document.querySelectorAll(sel);
const SVG_NS = "http://www.w3.org/2000/svg";

// Audio-Stub: spielt Sound wenn Datei vorhanden, sonst still
function playSound(name) {
  try {
    const settings = loadSettings();
    if (settings && settings.sound === false) return;
    const a = new Audio(`assets/sounds/${name}.mp3`);
    a.volume = 0.5;
    a.play().catch(() => {});
  } catch (e) {}
}

class UI {
  constructor() {
    this.game = null;
    this.bindMenu();
    this.bindActionBar();
    this.bindModal();
    // Settings vorladen
    const s = loadSettings();
    if (s) {
      $("#opt-sound").checked = s.sound !== false;
      $("#opt-difficulty").value = s.difficulty || "normal";
      $("#opt-clanname").value = s.clanName || "Drachen-Clan";
    }
  }

  // ===== Bildschirmwechsel =====
  showScreen(id) {
    $$(".screen").forEach(s => s.classList.remove("active"));
    $(id).classList.add("active");
  }

  bindMenu() {
    document.body.addEventListener("click", (e) => {
      const btn = e.target.closest("[data-action]");
      if (!btn) return;
      const action = btn.dataset.action;
      switch (action) {
        case "new-game": this.startNewGame(); break;
        case "load-game": this.loadSaved(); break;
        case "instructions": this.showScreen("#screen-instructions"); break;
        case "settings": this.showScreen("#screen-settings"); break;
        case "back-menu": this.showScreen("#screen-menu"); break;
        case "to-menu":
          this.showScreen("#screen-menu");
          break;
        case "save-settings":
          this.saveSettings();
          this.showScreen("#screen-menu");
          break;
      }
    });
  }

  saveSettings() {
    const settings = {
      sound: $("#opt-sound").checked,
      difficulty: $("#opt-difficulty").value,
      clanName: $("#opt-clanname").value.trim() || "Drachen-Clan"
    };
    saveSettings(settings);
    if (this.game) this.game.settings = settings;
  }

  startNewGame() {
    this.saveSettings();
    this.game = new Game(this);
    this.game.newGame(loadSettings());
    this.showScreen("#screen-game");
    this.renderAll();
  }

  loadSaved() {
    const saved = loadGame();
    if (!saved) {
      this.alertMsg("Kein Spielstand", "Es ist kein gespeichertes Spiel vorhanden.");
      return;
    }
    this.game = new Game(this);
    this.game.loadFrom(saved);
    this.showScreen("#screen-game");
    this.renderAll();
  }

  // ===== Karten-Rendering (SVG) =====
  renderMap() {
    const svg = $("#map");
    svg.innerHTML = "";
    const game = this.game;

    // Kanten zeichnen
    EDGES.forEach(([a, b]) => {
      const ra = REGIONS_DEF.find(r => r.id === a);
      const rb = REGIONS_DEF.find(r => r.id === b);
      const line = document.createElementNS(SVG_NS, "line");
      line.setAttribute("x1", ra.x); line.setAttribute("y1", ra.y);
      line.setAttribute("x2", rb.x); line.setAttribute("y2", rb.y);
      line.setAttribute("class", "region-edge");
      svg.appendChild(line);
    });

    // Regionen zeichnen
    game.regions.forEach(region => {
      const g = document.createElementNS(SVG_NS, "g");
      g.setAttribute("class", "region-node" + (region.id === game.selectedRegionId ? " selected" : ""));
      g.setAttribute("transform", `translate(${region.x},${region.y})`);
      g.dataset.id = region.id;

      const circle = document.createElementNS(SVG_NS, "circle");
      circle.setAttribute("r", 30);
      circle.setAttribute("class", "body");
      const owner = region.owner ? game.clans.find(c => c.id === region.owner) : null;
      circle.setAttribute("fill", owner ? owner.color : "#3a3f55");
      g.appendChild(circle);

      const count = document.createElementNS(SVG_NS, "text");
      count.setAttribute("class", "count");
      count.setAttribute("y", 5);
      count.textContent = totalTroops(region.troops);
      g.appendChild(count);

      const name = document.createElementNS(SVG_NS, "text");
      name.setAttribute("y", 50);
      name.textContent = region.name;
      g.appendChild(name);

      g.addEventListener("click", () => {
        game.selectRegion(region.id);
        playSound("click");
      });
      svg.appendChild(g);
    });
  }

  renderHud() {
    const g = this.game;
    const p = g.player;
    $("#hud-turn").textContent = g.turn;
    $("#hud-clan").textContent = p.name;
    $("#hud-gold").textContent = p.gold;
    $("#hud-income").textContent = g.incomeFor(p);
    $("#hud-regions").textContent = g.regions.filter(r => r.owner === p.id).length;
  }

  renderRegionList() {
    const ul = $("#region-list-ul");
    ul.innerHTML = "";
    this.game.regions.forEach(r => {
      const li = document.createElement("li");
      if (r.id === this.game.selectedRegionId) li.classList.add("selected");
      const owner = r.owner ? this.game.clans.find(c => c.id === r.owner) : null;
      const dotColor = owner ? owner.color : "#666";
      li.innerHTML = `<span><span class="dot" style="background:${dotColor}"></span>${r.name}</span><span>${totalTroops(r.troops)}</span>`;
      li.addEventListener("click", () => this.game.selectRegion(r.id));
      ul.appendChild(li);
    });
  }

  renderRegionDetails() {
    const r = this.game.selectedRegion();
    const nameEl = $("#rd-name");
    const body = $("#rd-body");
    if (!r) {
      nameEl.textContent = "Region wählen";
      body.innerHTML = '<div class="muted">Klicke auf eine Region.</div>';
      return;
    }
    const owner = r.owner ? this.game.clans.find(c => c.id === r.owner) : null;
    nameEl.textContent = r.name;
    let html = "";
    html += `<div class="stat"><span>Besitzer</span><span style="color:${owner ? owner.color : '#888'}">${owner ? owner.name : "Neutral"}</span></div>`;
    html += `<div class="stat"><span>Verteidigung</span><span>${r.defense}${r.defenseModifier !== 1 ? ` (×${r.defenseModifier.toFixed(2)})` : ""}</span></div>`;
    html += `<div class="stat"><span>Einkommen</span><span>${r.income} Gold</span></div>`;
    html += `<div class="stat"><span>Truppen gesamt</span><span>${totalTroops(r.troops)}</span></div>`;
    html += `<div class="mt"></div>`;
    for (const id in r.troops) {
      if (r.troops[id] > 0) {
        html += `<div class="troop-line"><span>${NINJA_CLASSES[id].name}</span><span class="v">${r.troops[id]}</span></div>`;
      }
    }
    body.innerHTML = html;
  }

  renderDiplomacy() {
    const ul = $("#diplo-list");
    ul.innerHTML = "";
    const player = this.game.player;
    this.game.clans.forEach(c => {
      if (c.id === player.id) return;
      const rel = player.relations[c.id] || "neutral";
      const label = rel === "allied" ? "Verbündet" : rel === "hostile" ? "Feindlich" : "Neutral";
      const cls = "rel-" + rel;
      const li = document.createElement("li");
      li.innerHTML = `<span style="color:${c.color}">${c.name}${c.eliminated ? ' †' : ''}</span><span class="${cls}">${label}</span>`;
      ul.appendChild(li);
    });
  }

  renderLog() {
    const overlay = $("#log-overlay");
    if (!overlay) return;
    overlay.innerHTML = "";
    const msgs = this.game.logMessages.slice(-5);
    msgs.forEach(m => {
      const d = document.createElement("div");
      d.className = "log-msg " + (m.type || "");
      d.textContent = `[R${m.turn}] ${m.msg}`;
      overlay.appendChild(d);
    });
  }

  renderAll() {
    this.renderHud();
    this.renderMap();
    this.renderRegionList();
    this.renderRegionDetails();
    this.renderDiplomacy();
    this.renderLog();
  }

  // ===== Animationen =====
  animateClash(a, b) {
    const svg = $("#map");
    const x = (a.x + b.x) / 2, y = (a.y + b.y) / 2;
    const c = document.createElementNS(SVG_NS, "circle");
    c.setAttribute("cx", x); c.setAttribute("cy", y);
    c.setAttribute("r", 18);
    c.setAttribute("class", "clash");
    svg.appendChild(c);
    setTimeout(() => c.remove(), 600);
    playSound("clash");
  }

  animateCapture(region) {
    const svg = $("#map");
    const c = document.createElementNS(SVG_NS, "circle");
    c.setAttribute("cx", region.x); c.setAttribute("cy", region.y);
    c.setAttribute("class", "capture-pulse");
    svg.appendChild(c);
    setTimeout(() => c.remove(), 900);
    playSound("capture");
  }

  // ===== Aktionsleiste =====
  bindActionBar() {
    $("#action-bar").addEventListener("click", (e) => {
      const btn = e.target.closest("button.act, button[data-action='end-turn']");
      if (!btn) return;
      const action = btn.dataset.action;
      if (!this.game) return;
      if (this.game.gameOver) { this.alertMsg("Spielende", "Das Spiel ist beendet. Starte ein neues Spiel."); return; }
      switch (action) {
        case "move": this.openMoveDialog(); break;
        case "attack": this.openAttackDialog(); break;
        case "recruit": this.openRecruitDialog(); break;
        case "special": this.openSpecialDialog(); break;
        case "end-turn": this.endTurnConfirm(); break;
      }
    });
  }

  endTurnConfirm() {
    this.game.endTurn();
  }

  // ===== Modale Dialoge =====
  bindModal() {
    this.modal = $("#modal");
    this.modal.addEventListener("click", (e) => {
      if (e.target === this.modal) this.closeModal();
    });
  }

  closeModal() { this.modal.classList.add("modal-hidden"); }

  openModal(title, bodyHTML, actions = []) {
    $("#modal-title").textContent = title;
    $("#modal-body").innerHTML = bodyHTML;
    const ac = $("#modal-actions");
    ac.innerHTML = "";
    actions.forEach(a => {
      const b = document.createElement("button");
      b.className = "btn" + (a.primary ? " btn-primary" : "");
      b.textContent = a.label;
      b.onclick = () => { a.onClick && a.onClick(); if (a.close !== false) this.closeModal(); };
      ac.appendChild(b);
    });
    if (actions.length === 0) {
      const b = document.createElement("button");
      b.className = "btn";
      b.textContent = "Schließen";
      b.onclick = () => this.closeModal();
      ac.appendChild(b);
    }
    this.modal.classList.remove("modal-hidden");
  }

  alertMsg(title, msg) { this.openModal(title, `<p>${msg}</p>`); }

  // Hilfsfunktion: erfordert gewählte eigene Region
  requireOwnSelected() {
    const r = this.game.selectedRegion();
    if (!r) { this.alertMsg("Keine Auswahl", "Wähle zuerst eine Region."); return null; }
    if (r.owner !== this.game.player.id) { this.alertMsg("Nicht deine Region", "Wähle eine eigene Region."); return null; }
    return r;
  }

  openRecruitDialog() {
    const r = this.requireOwnSelected();
    if (!r) return;
    let html = `<p class="muted">Region: <b>${r.name}</b> · Gold: <b>${this.game.player.gold}</b></p><div class="target-list">`;
    for (const id in NINJA_CLASSES) {
      const c = NINJA_CLASSES[id];
      html += `<button class="btn" data-cls="${id}" ${this.game.player.gold < c.cost ? "disabled" : ""}>
        <span>${c.name} <small style="color:var(--muted)">(A${c.attack}/V${c.defense}/B${c.move})</small></span>
        <span style="color:var(--gold-2)">${c.cost} G</span>
      </button>`;
    }
    html += "</div>";
    this.openModal("Rekrutieren", html, []);
    $("#modal-body").querySelectorAll("button[data-cls]").forEach(btn => {
      btn.onclick = () => {
        const result = this.game.recruit(r.id, btn.dataset.cls);
        if (!result.ok) this.alertMsg("Fehler", result.msg);
        else { this.renderAll(); this.openRecruitDialog(); }
      };
    });
  }

  openMoveDialog() {
    const r = this.requireOwnSelected();
    if (!r) return;
    const neighbors = this.game.adjacency[r.id]
      .map(id => this.game.regions.find(x => x.id === id))
      .filter(x => x.owner === this.game.player.id);
    if (neighbors.length === 0) { this.alertMsg("Bewegen", "Keine benachbarte eigene Region."); return; }
    const total = totalTroops(r.troops);
    let html = `<p class="muted">Aus <b>${r.name}</b> (${total} Truppen).</p>
      <label class="row"><span>Anzahl</span><input type="number" id="mv-amt" value="${Math.floor(total/2)}" min="1" max="${total-1}" /></label>
      <div class="target-list">`;
    neighbors.forEach(n => {
      html += `<button class="btn" data-id="${n.id}"><span>→ ${n.name}</span><span class="muted">${totalTroops(n.troops)}</span></button>`;
    });
    html += "</div>";
    this.openModal("Bewegen", html, []);
    $("#modal-body").querySelectorAll("button[data-id]").forEach(btn => {
      btn.onclick = () => {
        const amt = parseInt($("#mv-amt").value, 10) || 1;
        const res = this.game.move(r.id, btn.dataset.id, amt);
        if (!res.ok) this.alertMsg("Fehler", res.msg);
        else { this.closeModal(); this.renderAll(); }
      };
    });
  }

  openAttackDialog() {
    const r = this.requireOwnSelected();
    if (!r) return;
    const targets = this.game.adjacency[r.id]
      .map(id => this.game.regions.find(x => x.id === id))
      .filter(x => x.owner !== this.game.player.id);
    if (targets.length === 0) { this.alertMsg("Angreifen", "Keine angreifbare benachbarte Region."); return; }
    let html = `<p class="muted">Angriff aus <b>${r.name}</b> (${totalTroops(r.troops)} Truppen).</p><div class="target-list">`;
    targets.forEach(t => {
      const owner = t.owner ? this.game.clans.find(c => c.id === t.owner) : null;
      const rel = owner ? this.game.player.relations[owner.id] : "neutral";
      const tag = rel === "allied" ? " (Verbündet)" : "";
      html += `<button class="btn" data-id="${t.id}" ${rel === "allied" ? "disabled" : ""}>
        <span>${t.name}${tag} <small style="color:var(--muted)">${owner ? owner.name : "Neutral"}</small></span>
        <span>${totalTroops(t.troops)} · Def ${t.defense}</span>
      </button>`;
    });
    html += "</div>";
    this.openModal("Angreifen", html, []);
    $("#modal-body").querySelectorAll("button[data-id]").forEach(btn => {
      btn.onclick = () => {
        const res = this.game.attack(r.id, btn.dataset.id);
        this.closeModal();
        this.renderAll();
        if (res.msg) this.alertMsg(res.result && res.result.attackerWins ? "Sieg" : "Niederlage", res.msg);
      };
    });
  }

  openSpecialDialog() {
    const sel = this.game.selectedRegion();
    if (!sel) { this.alertMsg("Keine Auswahl", "Wähle zuerst eine Region als Ziel/Quelle."); return; }
    let html = `<p class="muted">Ziel/Quelle: <b>${sel.name}</b> · Gold: <b>${this.game.player.gold}</b></p><div class="target-list">`;
    for (const id in SPECIALS) {
      const s = SPECIALS[id];
      html += `<button class="btn" data-id="${id}" ${this.game.player.gold < s.cost ? "disabled" : ""}>
        <span>${s.name} <small style="color:var(--muted)">${s.desc}</small></span>
        <span style="color:var(--gold-2)">${s.cost} G</span>
      </button>`;
    }
    html += "</div>";
    this.openModal("Spezialfähigkeit", html, []);
    $("#modal-body").querySelectorAll("button[data-id]").forEach(btn => {
      btn.onclick = () => {
        const res = this.game.useSpecial(btn.dataset.id, sel.id);
        if (!res.ok) this.alertMsg("Fehler", res.msg);
        else { this.closeModal(); this.renderAll(); }
      };
    });
  }

  showVictory(won) {
    this.openModal(won ? "Sieg!" : "Niederlage",
      won ? "<p>Du beherrschst alle Regionen. Glückwunsch, Schattenmeister!</p>"
          : "<p>Dein Clan wurde ausgelöscht. Versuche es erneut.</p>",
      [{ label: "Zum Menü", primary: true, onClick: () => this.showScreen("#screen-menu") }]
    );
  }
}

// ===== Bootstrap =====
window.addEventListener("DOMContentLoaded", () => {
  const ui = new UI();
  // Wenn ein Spielstand vorhanden ist: zeige Menü aber Auto-Load-Hinweis ist via Button "Spiel laden" verfügbar.
  // Auto-Load: direkt einsteigen, wenn Spielstand vorhanden
  if (hasSave()) {
    // Auto-Load nur, wenn der Spieler nicht aktiv "Neues Spiel" gewählt hat
    // Wir zeigen das Menü, aber Button "Spiel laden" funktioniert.
  }
  window.__ui = ui;
});
