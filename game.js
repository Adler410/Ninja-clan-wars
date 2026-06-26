// game.js — Kernlogik des Spiels
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

  // Initialisiert ein neues Spiel
  newGame(settings) {
    this.settings = settings || { difficulty: "normal", clanName: "Drachen-Clan", sound: true };
    this.turn = 1;
    this.clans = CLANS.map(c => {
      const state = createClanState(c);
      if (c.isPlayer) state.name = this.settings.clanName || c.name;
      return state;
    });
    // Beziehungen initialisieren: alle neutral
    for (const c of this.clans) {
      for (const o of this.clans) {
        if (c.id !== o.id) c.relations[o.id] = "neutral";
      }
    }
    this.regions = createInitialRegions(this.clans);
    this.selectedRegionId = null;
    this.logMessages = [];
    this.gameOver = false;
    this.log("Das Spiel beginnt. Erobere alle Regionen!");
    this.collectIncome(this.player);
    this.save();
  }

  // Lädt einen gespeicherten Spielstand
  loadFrom(saved) {
    Object.assign(this, saved);
    this.adjacency = buildAdjacency();
    return true;
  }

  get player() {
    return this.clans.find(c => c.isPlayer);
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
    this.ui.renderLog();
  }

  // ----- Einkommen -----
  collectIncome(clan) {
    let inc = this.incomeFor(clan);
    clan.gold += inc;
  }

  incomeFor(clan) {
    return this.regions
      .filter(r => r.owner === clan.id)
      .reduce((s, r) => s + r.income, 0);
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
    this.log(`Rekrutiert: 1× ${cls.name} in ${region.name}.`);
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
    this.log(`Truppen verschoben: ${from.name} → ${to.name}.`);
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
      msg = `Sieg! Du hast ${to.name} erobert. Verluste: ${result.attackerLosses}, Feind: ${result.defenderLosses}.`;
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
    this.log(`Spezialfähigkeit eingesetzt: ${spec.name} → ${target.name}.`);
    this.save();
    return { ok: true };
  }

  // ----- Rundenwechsel -----
  endTurn() {
    if (this.gameOver) return;

    // KI-Züge ausführen
    for (const clan of this.clans) {
      if (clan.isPlayer || clan.eliminated) continue;
      this.collectIncome(clan);
      try { runAITurn(this, clan); } catch (e) { console.warn("KI-Fehler:", e); }
    }

    // Nächste Runde
    this.turn++;
    this.log(`Runde ${this.turn} beginnt.`);

    // Defense-Modifier zurücksetzen
    this.regions.forEach(r => r.defenseModifier = 1);

    // Spieler-Einkommen
    this.collectIncome(this.player);

    this.checkVictory();
    this.save();
    this.ui.renderAll();
  }

  checkVictory() {
    const owners = new Set(this.regions.map(r => r.owner).filter(Boolean));
    if (owners.size === 1 && owners.has(this.player.id)) {
      this.gameOver = true;
      this.log("SIEG! Du beherrschst die gesamte Karte.", "good");
      this.ui.showVictory(true);
    } else if (!owners.has(this.player.id)) {
      this.gameOver = true;
      this.log("NIEDERLAGE! Dein Clan wurde vernichtet.", "bad");
      this.ui.showVictory(false);
    }
  }

  // ----- UI-Animationshooks -----
  animateClash(a, b) { this.ui.animateClash(a, b); }
  animateCapture(r) { this.ui.animateCapture(r); }

  save() {
    const data = {
      turn: this.turn,
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
