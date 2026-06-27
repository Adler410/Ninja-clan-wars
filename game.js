// game.js — Kernlogik des Spiels (mit Einzelspieler- und Hotseat-Modus)
import { CLANS, createClanState, NINJA_CLASSES, SPECIALS } from "./models.js";
import { REGIONS_DEF, EDGES, buildAdjacency, createInitialRegions } from "./map.js";
import { resolveBattle, totalTroops, attackPower, defensePower } from "./battle.js";
import { runAITurn, takeTroops, mergeTroops, checkElimination, healRegion } from "./ai.js";
import { saveGame, loadGame } from "./save.js";

export class Game {
  constructor(ui) {
    this.ui = ui;
    this.adjacency = buildAdjacency();
    this.edges = EDGES;
    this.logMessages = [];
  }

  // settings: { mode: 'single'|'hotseat', clanName, p1Name, p2Name, handoff, difficulty, sound }
  newGame(settings) {
    this.settings = Object.assign({
      mode: "single",
      difficulty: "normal",
      clanName: "Drachen-Clan",
      p1Name: "Spieler 1",
      p2Name: "Spieler 2",
      handoff: true,
      sound: true
    }, settings || {});

    this.mode = this.settings.mode;
    this.turn = 1;
    this.gameOver = false;
    this.logMessages = [];

    // Clans aufbauen
    this.clans = CLANS.map((c, i) => {
      const state = createClanState(c);
      state.isPlayer = false;
      return state;
    });

    if (this.mode === "hotseat") {
      // Erste beiden Clans = menschliche Spieler
      this.clans[0].isPlayer = true;
      this.clans[0].name = (this.settings.p1Name || "Spieler 1") + " (Drachen)";
      this.clans[1].isPlayer = true;
      this.clans[1].name = (this.settings.p2Name || "Spieler 2") + " (Tiger)";
      this.humanIndices = [0, 1];
    } else {
      this.clans[0].isPlayer = true;
      this.clans[0].name = this.settings.clanName || "Drachen-Clan";
      this.humanIndices = [0];
    }
    this.currentHumanPos = 0;

    // Beziehungen initialisieren
    for (const c of this.clans) {
      for (const o of this.clans) {
        if (c.id !== o.id) c.relations[o.id] = "neutral";
      }
    }
    this.regions = createInitialRegions(this.clans);
    this.selectedRegionId = null;
    this.log(`Das Spiel beginnt (${this.mode === "hotseat" ? "2-Spieler" : "Einzelspieler"}).`);

    // Einkommen für ersten aktiven Spieler
    this.collectIncome(this.player);
    this.save();
  }

  loadFrom(saved) {
    Object.assign(this, saved);
    this.adjacency = buildAdjacency();
    if (!this.mode) this.mode = "single";
    if (!this.humanIndices) this.humanIndices = this.clans.map((c, i) => c.isPlayer ? i : -1).filter(i => i >= 0);
    if (typeof this.currentHumanPos !== "number") this.currentHumanPos = 0;
    return true;
  }

  // Aktuell aktiver menschlicher Spieler
  get player() {
    const idx = this.humanIndices[this.currentHumanPos] ?? 0;
    return this.clans[idx];
  }

  isAIClan(clan) {
    return !this.humanIndices.includes(this.clans.indexOf(clan));
  }

  selectedRegion() {
    return this.regions.find(r => r.id === this.selectedRegionId) || null;
  }

  selectRegion(id) {
    this.selectedRegionId = id;
    this.ui.renderAll();
  }

  log(msg, type = "") {
    this.logMessages.push({ msg, type, turn: this.turn });
    if (this.logMessages.length > 60) this.logMessages.shift();
    if (this.ui && this.ui.renderLog) this.ui.renderLog();
  }

  // ----- Einkommen -----
  collectIncome(clan) {
    clan.gold += this.incomeFor(clan);
  }
  incomeFor(clan) {
    return this.regions.filter(r => r.owner === clan.id).reduce((s, r) => s + r.income, 0);
  }

  // ----- Spieler-Aktionen -----
  recruit(regionId, classId) {
    const region = this.regions.find(r => r.id === regionId);
    const cls = NINJA_CLASSES[classId];
    const player = this.player;
    if (!region || region.owner !== player.id) return { ok: false, msg: "Nur in eigenen Regionen rekrutierbar." };
    if (player.gold < cls.cost) return { ok: false, msg: "Nicht genug Gold." };
    player.gold -= cls.cost;
    region.troops[classId] = (region.troops[classId] || 0) + 1;
    this.log(`${player.name}: rekrutiert 1× ${cls.name} in ${region.name}.`);
    this.save();
    return { ok: true };
  }

  move(fromId, toId, amount) {
    const from = this.regions.find(r => r.id === fromId);
    const to = this.regions.find(r => r.id === toId);
    if (!from || !to) return { ok: false, msg: "Region nicht gefunden." };
    if (from.owner !== this.player.id || to.owner !== this.player.id) return { ok: false, msg: "Beide Regionen müssen dir gehören." };
    if (!this.adjacency[fromId].includes(toId)) return { ok: false, msg: "Regionen sind nicht benachbart." };
    if (totalTroops(from.troops) <= amount) return { ok: false, msg: "Mindestens 1 Truppe muss bleiben." };
    const moved = takeTroops(from, Math.min(0.99, amount / Math.max(1, totalTroops(from.troops))));
    mergeTroops(to.troops, moved);
    this.log(`${this.player.name}: ${from.name} → ${to.name}.`);
    this.save();
    return { ok: true };
  }

  attack(fromId, toId) {
    const from = this.regions.find(r => r.id === fromId);
    const to = this.regions.find(r => r.id === toId);
    if (!from || !to) return { ok: false, msg: "Region nicht gefunden." };
    if (from.owner !== this.player.id) return { ok: false, msg: "Nur eigene Region kann angreifen." };
    if (to.owner === this.player.id) return { ok: false, msg: "Eigene Region kann nicht angegriffen werden." };
    if (!this.adjacency[fromId].includes(toId)) return { ok: false, msg: "Ziel nicht benachbart." };
    if (totalTroops(from.troops) < 2) return { ok: false, msg: "Zu wenige Truppen für Angriff." };
    if (to.owner) {
      const enemyClan = this.clans.find(c => c.id === to.owner);
      if (this.player.relations[enemyClan.id] === "allied") return { ok: false, msg: "Du bist mit diesem Clan verbündet." };
    }

    const attacking = takeTroops(from, 0.85);
    const result = resolveBattle(attacking, to.troops, to.defense, to.defenseModifier);
    this.animateClash(from, to);

    let msg;
    if (result.attackerWins) {
      const prevOwner = to.owner;
      to.owner = this.player.id;
      to.troops = attacking;
      msg = `Sieg! ${this.player.name} erobert ${to.name}. Verluste: ${result.attackerLosses}, Feind: ${result.defenderLosses}.`;
      this.log(msg, "good");
      this.animateCapture(to);
      if (prevOwner) checkElimination(this, prevOwner);
    } else {
      mergeTroops(from.troops, attacking);
      msg = `Niederlage bei ${to.name}. Verluste: ${result.attackerLosses}, Feind: ${result.defenderLosses}.`;
      this.log(msg, "bad");
    }
    this.save();
    return { ok: true, msg, result };
  }

  useSpecial(specialId, targetId) {
    const spec = SPECIALS[specialId];
    const player = this.player;
    if (!spec) return { ok: false, msg: "Unbekannte Fähigkeit." };
    if (player.gold < spec.cost) return { ok: false, msg: "Nicht genug Gold." };
    const target = this.regions.find(r => r.id === targetId);
    if (!target) return { ok: false, msg: "Kein Ziel." };

    switch (specialId) {
      case "rauch":
        if (target.owner === player.id) return { ok: false, msg: "Ziel muss feindlich sein." };
        target.defenseModifier = 0.7;
        break;
      case "feuer":
        if (target.owner === player.id) return { ok: false, msg: "Ziel muss feindlich sein." };
        for (const id in target.troops) target.troops[id] = Math.floor(target.troops[id] * 0.8);
        break;
      case "heil":
        if (target.owner !== player.id) return { ok: false, msg: "Nur eigene Region." };
        healRegion(target);
        break;
      case "blitz": {
        if (target.owner !== player.id) return { ok: false, msg: "Nur eigene Region als Ziel." };
        const from = this.selectedRegion();
        if (!from || from.owner !== player.id || from.id === target.id) return { ok: false, msg: "Wähle zuerst eine eigene Quelle." };
        const moved = takeTroops(from, 0.7);
        mergeTroops(target.troops, moved);
        break;
      }
      case "beschwoer":
        if (target.owner !== player.id) return { ok: false, msg: "Nur eigene Region." };
        target.troops.elite = (target.troops.elite || 0) + 10;
        break;
    }
    player.gold -= spec.cost;
    this.log(`${player.name}: ${spec.name} → ${target.name}.`);
    this.save();
    return { ok: true };
  }

  // ----- Rundenwechsel -----
  endTurn() {
    if (this.gameOver) return;
    this.selectedRegionId = null;

    // Nächsten menschlichen Spieler bestimmen
    this.currentHumanPos++;
    if (this.currentHumanPos < this.humanIndices.length) {
      // Übergabe an nächsten menschlichen Spieler
      this.collectIncome(this.player);
      this.save();
      this.ui.handoffTo(this.player);
      return;
    }

    // Alle Menschen sind durch → KI-Züge ausführen
    for (const clan of this.clans) {
      if (clan.eliminated) continue;
      if (this.humanIndices.includes(this.clans.indexOf(clan))) continue;
      this.collectIncome(clan);
      try { runAITurn(this, clan); } catch (e) { console.warn("KI-Fehler:", e); }
    }

    // Neue Runde
    this.turn++;
    this.log(`Runde ${this.turn} beginnt.`);
    this.regions.forEach(r => r.defenseModifier = 1);
    this.currentHumanPos = 0;
    this.collectIncome(this.player);

    this.checkVictory();
    this.save();

    if (this.gameOver) {
      this.ui.renderAll();
      return;
    }

    if (this.mode === "hotseat") {
      this.ui.handoffTo(this.player);
    } else {
      this.ui.renderAll();
    }
  }

  checkVictory() {
    const owners = new Set(this.regions.map(r => r.owner).filter(Boolean));
    if (owners.size === 1) {
      const winnerId = [...owners][0];
      const winner = this.clans.find(c => c.id === winnerId);
      const winnerIdx = this.clans.indexOf(winner);
      const wonByHuman = this.humanIndices.includes(winnerIdx);
      this.gameOver = true;
      this.log(`SIEG! ${winner.name} beherrscht die gesamte Karte.`, "good");
      this.ui.showVictory(wonByHuman, winner);
      return;
    }
    // Im Einzelspieler: Niederlage, wenn Spieler keine Region mehr hat
    if (this.mode === "single") {
      const playerClan = this.clans[this.humanIndices[0]];
      if (!owners.has(playerClan.id)) {
        this.gameOver = true;
        this.log("NIEDERLAGE! Dein Clan wurde vernichtet.", "bad");
        this.ui.showVictory(false, null);
      }
    } else {
      // Im Hotseat: prüfe, ob nur noch ein menschlicher Spieler übrig ist und keine KI-Konkurrenz da ist
      const remainingHumans = this.humanIndices.filter(i => owners.has(this.clans[i].id));
      if (remainingHumans.length === 1 && this.clans.filter(c => !c.eliminated && !this.humanIndices.includes(this.clans.indexOf(c))).every(c => !owners.has(c.id))) {
        // ein menschlicher Spieler hat alle Regionen via owners.size check, sonst nur Teil — nichts machen, oben prüft owners.size===1
      }
    }
  }

  // ----- UI-Hooks -----
  animateClash(a, b) { if (this.ui && this.ui.animateClash) this.ui.animateClash(a, b); }
  animateCapture(r) { if (this.ui && this.ui.animateCapture) this.ui.animateCapture(r); }

  save() {
    const data = {
      turn: this.turn,
      mode: this.mode,
      humanIndices: this.humanIndices,
      currentHumanPos: this.currentHumanPos,
      clans: this.clans,
      regions: this.regions,
      selectedRegionId: this.selectedRegionId,
      logMessages: this.logMessages.slice(-30),
      settings: this.settings,
      gameOver: this.gameOver
    };
    saveGame(data);
  }
}
