// app.js — UI-Steuerung, Bildschirmwechsel, Karten-Rendering
import { Game } from "./game.js";
import { REGIONS_DEF, EDGES } from "./map.js";
import { NINJA_CLASSES, SPECIALS, CLANS } from "./models.js";
import { totalTroops } from "./battle.js";
import { loadGame, hasSave, saveSettings, loadSettings } from "./save.js";

const $ = sel => document.querySelector(sel);
const $$ = sel => document.querySelectorAll(sel);
const SVG_NS = "http://www.w3.org/2000/svg";

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
    this.bindGlobal();
    this.bindActionBar();
    this.bindModal();
    // Settings vorladen
    const s = loadSettings();
    if (s) {
      if ($("#opt-sound")) $("#opt-sound").checked = s.sound !== false;
      if ($("#opt-difficulty")) $("#opt-difficulty").value = s.difficulty || "normal";
      if ($("#opt-clanname")) $("#opt-clanname").value = s.clanName || "Drachen-Clan";
      if ($("#opt-p1")) $("#opt-p1").value = s.p1Name || "Spieler 1";
      if ($("#opt-p2")) $("#opt-p2").value = s.p2Name || "Spieler 2";
      if ($("#opt-handoff")) $("#opt-handoff").checked = s.handoff !== false;
    }
  }

  showScreen(id) {
    $$(".screen").forEach(s => s.classList.remove("active"));
    $(id).classList.add("active");
  }

  bindGlobal() {
    document.body.addEventListener("click", (e) => {
      const btn = e.target.closest("[data-action]");
      if (!btn) return;
      const action = btn.dataset.action;
      switch (action) {
        case "goto-mode": this.showScreen("#screen-mode"); break;
        case "start-single": this.startNewGame("single"); break;
        case "start-hotseat": this.startNewGame("hotseat"); break;
        case "load-game": this.loadSaved(); break;
        case "instructions": this.showScreen("#screen-instructions"); break;
        case "settings": this.showScreen("#screen-settings"); break;
        case "back-menu": this.showScreen("#screen-menu"); break;
        case "to-menu":
          this.showScreen("#screen-menu");
          break;
        case "save-settings":
          this.collectAndSaveSettings();
          this.showScreen("#screen-menu");
          break;
        case "handoff-continue":
          this.showScreen("#screen-game");
          this.renderAll();
          break;
      }
    });
  }

  collectAndSaveSettings() {
    const settings = Object.assign(loadSettings() || {}, {
      sound: $("#opt-sound") ? $("#opt-sound").checked : true,
      difficulty: $("#opt-difficulty") ? $("#opt-difficulty").value : "normal",
      clanName: $("#opt-clanname") ? ($("#opt-clanname").value.trim() || "Drachen-Clan") : "Drachen-Clan",
      p1Name: $("#opt-p1") ? ($("#opt-p1").value.trim() || "Spieler 1") : "Spieler 1",
      p2Name: $("#opt-p2") ? ($("#opt-p2").value.trim() || "Spieler 2") : "Spieler 2",
      handoff: $("#opt-handoff") ? $("#opt-handoff").checked : true,
    });
    saveSettings(settings);
    if (this.game) this.game.settings = settings;
    return settings;
  }

  startNewGame(mode) {
    const settings = this.collectAndSaveSettings();
    settings.mode = mode;
    saveSettings(settings);
    this.game = new Game(this);
    this.game.newGame(settings);
    if (mode === "hotseat" && settings.handoff !== false) {
      this.handoffTo(this.game.player);
    } else {
      this.showScreen("#screen-game");
      this.renderAll();
    }
  }

  loadSaved() {
    const saved = loadGame();
    if (!saved) {
      this.alertMsg("Kein Spielstand", "Es ist kein gespeichertes Spiel vorhanden.");
      return;
    }
    this.game = new Game(this);
    this.game.loadFrom(saved);
    if (this.game.mode === "hotseat" && (this.game.settings && this.game.settings.handoff !== false)) {
      this.handoffTo(this.game.player);
    } else {
      this.showScreen("#screen-game");
      this.renderAll();
    }
  }

  // ===== Übergabe-Bildschirm =====
  handoffTo(clan) {
    if (!this.game) return;
    if (this.game.mode !== "hotseat" || (this.game.settings && this.game.settings.handoff === false)) {
      this.showScreen("#screen-game");
      this.renderAll();
      return;
    }
    $("#handoff-title").textContent = `Bitte an ${clan.name} übergeben`;
    $("#handoff-sub").textContent = `Runde ${this.game.turn} · ${clan.name} ist als Nächstes am Zug.`;
    this.showScreen("#screen-handoff");
  }

  // ===== Karten-Rendering =====
  renderMap() {
    const svg = $("#map");
    svg.innerHTML = "";
    const game = this.game;

    EDGES.forEach(([a, b]) => {
      const ra = REGIONS_DEF.find(r => r.id === a);
      const rb = REGIONS_DEF.find(r => r.id === b);
      const line = document.createElementNS(SVG_NS, "line");
      line.setAttribute("x1", ra.x); line.setAttribute("y1", ra.y);
      line.setAttribute("x2", rb.x); line.setAttribute("y2", rb.y);
      line.setAttribute("class", "region-edge");
      svg.appendChild(line);
    });

    game.regions.forEach(region => {
      const g = document.createElementNS(SVG_NS, "g");
      g.setAttribute("class", "region-node" + (region.id === game.selectedRegionId ? " selected" : ""));
      g.setAttribute("transform", `translate(${region.x},${region.y})`);
      g.dataset.id = region.id;

      const ring = document.createElementNS(SVG_NS, "circle");
      ring.setAttribute("r", 42);
      ring.setAttribute("class", "ring");
      g.appendChild(ring);

      const circle = document.createElementNS(SVG_NS, "circle");
      circle.setAttribute("r", 36);
      circle.setAttribute("class", "body");
      const owner = region.owner ? game.clans.find(c => c.id === region.owner) : null;
      circle.setAttribute("fill", owner ? owner.color : "#3a3f55");
      g.appendChild(circle);

      const count = document.createElementNS(SVG_NS, "text");
      count.setAttribute("class", "count");
      count.setAttribute("y", 8);
      count.textContent = totalTroops(region.troops);
      g.appendChild(count);

      const name = document.createElementNS(SVG_NS, "text");
      name.setAttribute("class", "name-label");
      name.setAttribute("y", 60);
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
    $("#hud-clan-dot").style.background = p.color;
    $("#hud-clan-dot").style.color = p.color;
    $("#hud-gold").textContent = p.gold;
    $("#hud-income").textContent = g.incomeFor(p);
    $("#hud-regions").textContent = g.regions.filter(r => r.owner === p.id).length;
    $("#hud-mode-label").textContent = g.mode === "hotseat" ? `2-Spieler · am Zug` : "Einzelspieler";
  }

  renderRegionList() {
    const ul = $("#region-list-ul");
    ul.innerHTML = "";
    this.game.regions.forEach(r => {
      const li = document.createElement("li");
      if (r.id === this.game.selectedRegionId) li.classList.add("selected");
      const owner = r.owner ? this.game.clans.find(c => c.id === r.owner) : null;
      const dotColor = owner ? owner.color : "#666";
      li.innerHTML = `<span><span class="dot" style="background:${dotColor};color:${dotColor}"></span>${r.name}</span><span>${totalTroops(r.troops)}</span>`;
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
      body.innerHTML = '<div class="muted">Tippe eine Region an.</div>';
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
    if (!ul) return;
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
    const msgs = this.game.logMessages.slice(-4);
    msgs.forEach(m => {
      const d = document.createElement("div");
      d.className = "log-msg " + (m.type || "");
      d.textContent = `[R${m.turn}] ${m.msg}`;
      overlay.appendChild(d);
    });
  }

  renderAll() {
    if (!this.game) return;
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
    c.setAttribute("r", 22);
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
      const btn = e.target.closest("button[data-action]");
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

  showVictory(won, winner) {
    const title = won ? "Sieg!" : "Niederlage";
    const body = winner
      ? `<p><b style="color:${winner.color}">${winner.name}</b> beherrscht alle Regionen!</p>`
      : "<p>Dein Clan wurde ausgelöscht. Versuche es erneut.</p>";
    this.openModal(title, body,
      [{ label: "Zum Menü", primary: true, onClick: () => this.showScreen("#screen-menu") }]
    );
  }
}

window.addEventListener("DOMContentLoaded", () => {
  window.__ui = new UI();
});
