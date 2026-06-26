// ai.js — KI-Verhalten für gegnerische Clans
import { totalTroops, attackPower, defensePower, resolveBattle } from "./battle.js";
import { NINJA_CLASSES, SPECIALS } from "./models.js";

// Hauptfunktion: führt einen kompletten KI-Zug für den angegebenen Clan aus
export function runAITurn(game, clan) {
  if (clan.eliminated) return;

  // 1. Einkommen wurde global zu Rundenbeginn bereits ausgezahlt
  // 2. Rekrutieren: kaufe Truppen in der eigenen stärksten Hauptregion
  aiRecruit(game, clan);

  // 3. Diplomatie überlegen
  aiDiplomacy(game, clan);

  // 4. Bewegen + Angreifen
  aiMoveAndAttack(game, clan);

  // 5. Spezialfähigkeit
  aiUseSpecial(game, clan);
}

function ownedRegions(game, clan) {
  return game.regions.filter(r => r.owner === clan.id);
}

function aiRecruit(game, clan) {
  const owned = ownedRegions(game, clan);
  if (owned.length === 0) return;

  // Wähle Region mit höchstem Einkommen als Rekrutierungszentrum
  const center = owned.reduce((a, b) => (b.income > a.income ? b : a));

  // Kaufe gemischte Truppen, solange Gold reicht
  const buyOrder = ["normal", "normal", "archer", "elite", "monk", "assassin"];
  for (const cls of buyOrder) {
    const c = NINJA_CLASSES[cls];
    while (clan.gold >= c.cost) {
      clan.gold -= c.cost;
      center.troops[cls] = (center.troops[cls] || 0) + 1;
      if (clan.gold < c.cost * 1.5) break; // Diversifizierung
    }
  }
}

function aiDiplomacy(game, clan) {
  // Mit ~20% Wahrscheinlichkeit Beziehungen ändern
  for (const other of game.clans) {
    if (other.id === clan.id || other.eliminated) continue;
    const rel = clan.relations[other.id] || "neutral";
    const myPower = clanPower(game, clan);
    const theirPower = clanPower(game, other);

    if (Math.random() < 0.15) {
      if (rel === "neutral") {
        // Schwächere Gegner werden eher attackiert, stärkere als Verbündete
        if (theirPower < myPower * 0.7) {
          setRelation(game, clan, other, "hostile", "erklärt Krieg");
        } else if (theirPower > myPower * 1.3) {
          setRelation(game, clan, other, "allied", "schlägt ein Bündnis vor");
        }
      } else if (rel === "hostile" && theirPower > myPower * 1.5) {
        setRelation(game, clan, other, "neutral", "bietet Frieden an");
      } else if (rel === "allied" && Math.random() < 0.2) {
        setRelation(game, clan, other, "neutral", "beendet das Bündnis");
      }
    }
  }
}

function setRelation(game, a, b, rel, verb) {
  a.relations[b.id] = rel;
  b.relations[a.id] = rel;
  game.log(`${a.name} ${verb} mit ${b.name}.`, rel === "hostile" ? "bad" : "good");
}

function clanPower(game, clan) {
  let p = 0;
  for (const r of game.regions) {
    if (r.owner === clan.id) p += attackPower(r.troops) + defensePower(r.troops) + r.income * 2;
  }
  return p + clan.gold * 0.1;
}

function aiMoveAndAttack(game, clan) {
  const owned = ownedRegions(game, clan);

  for (const region of owned) {
    if (totalTroops(region.troops) < 6) continue;

    const neighbors = game.adjacency[region.id]
      .map(id => game.regions.find(r => r.id === id))
      .filter(Boolean);

    // Suche schwächstes feindliches/neutrales Ziel
    let bestTarget = null;
    let bestScore = -Infinity;
    for (const nb of neighbors) {
      if (nb.owner === clan.id) continue;
      const otherClan = nb.owner ? game.clans.find(c => c.id === nb.owner) : null;
      // Verbündete nicht angreifen
      if (otherClan && clan.relations[otherClan.id] === "allied") continue;

      const myPower = attackPower(region.troops);
      const theirPower = defensePower(nb.troops) + nb.defense * 5;
      const score = myPower - theirPower * 1.1 + (nb.income * 3);
      if (myPower > theirPower * 0.9 && score > bestScore) {
        bestScore = score;
        bestTarget = nb;
      }
    }

    if (bestTarget) {
      // Angriff durchführen: alle bis auf 2 Normale Ninjas schicken
      const attacking = takeTroops(region, 0.8);
      const result = resolveBattle(attacking, bestTarget.troops, bestTarget.defense, bestTarget.defenseModifier);
      game.animateClash(region, bestTarget);

      if (result.attackerWins) {
        const prevOwner = bestTarget.owner;
        bestTarget.owner = clan.id;
        bestTarget.troops = attacking;
        game.log(`${clan.name} erobert ${bestTarget.name}!`, "good");
        game.animateCapture(bestTarget);
        if (prevOwner) checkElimination(game, prevOwner);
      } else {
        // Verbleibende Truppen kehren zurück
        mergeTroops(region.troops, attacking);
        game.log(`${clan.name} scheitert beim Angriff auf ${bestTarget.name}.`, "bad");
      }
    } else {
      // Verstärke: bewege Hälfte zu einer benachbarten eigenen Front-Region
      const friendly = neighbors.filter(n => n.owner === clan.id);
      const front = friendly.find(f => game.adjacency[f.id].some(id => {
        const o = game.regions.find(r => r.id === id);
        return o && o.owner !== clan.id;
      }));
      if (front) {
        const half = takeTroops(region, 0.5);
        mergeTroops(front.troops, half);
      }
    }
  }
}

function aiUseSpecial(game, clan) {
  if (clan.gold < 30 || Math.random() < 0.5) return;

  const owned = ownedRegions(game, clan);
  const enemies = game.regions.filter(r => r.owner && r.owner !== clan.id && clan.relations[r.owner] !== "allied");

  // Heile schwächste eigene Front-Region
  if (clan.gold >= SPECIALS.heil.cost && owned.length > 0) {
    const weakest = owned.reduce((a, b) => totalTroops(a.troops) < totalTroops(b.troops) ? a : b);
    if (totalTroops(weakest.troops) > 0 && Math.random() < 0.5) {
      clan.gold -= SPECIALS.heil.cost;
      healRegion(weakest);
      game.log(`${clan.name} nutzt Heiltechnik in ${weakest.name}.`);
      return;
    }
  }

  // Beschwörung in Hauptregion
  if (clan.gold >= SPECIALS.beschwoer.cost && owned.length > 0 && Math.random() < 0.4) {
    const center = owned.reduce((a, b) => (b.income > a.income ? b : a));
    clan.gold -= SPECIALS.beschwoer.cost;
    center.troops.elite = (center.troops.elite || 0) + 10;
    game.log(`${clan.name} beschwört Elite-Ninjas in ${center.name}.`);
    return;
  }

  // Feuertechnik auf stärkste feindliche Region
  if (clan.gold >= SPECIALS.feuer.cost && enemies.length > 0) {
    const target = enemies.reduce((a, b) => totalTroops(a.troops) > totalTroops(b.troops) ? a : b);
    clan.gold -= SPECIALS.feuer.cost;
    for (const id in target.troops) target.troops[id] = Math.floor(target.troops[id] * 0.8);
    game.log(`${clan.name} entfesselt Feuertechnik auf ${target.name}!`, "bad");
  }
}

export function healRegion(region) {
  for (const id in region.troops) {
    region.troops[id] = Math.ceil(region.troops[id] * 1.25);
  }
}

export function takeTroops(region, fraction) {
  const out = { normal: 0, elite: 0, archer: 0, assassin: 0, monk: 0 };
  for (const id in region.troops) {
    const move = Math.floor(region.troops[id] * fraction);
    out[id] = move;
    region.troops[id] -= move;
  }
  return out;
}

export function mergeTroops(dst, src) {
  for (const id in src) dst[id] = (dst[id] || 0) + src[id];
}

export function checkElimination(game, clanId) {
  const stillHas = game.regions.some(r => r.owner === clanId);
  if (!stillHas) {
    const c = game.clans.find(c => c.id === clanId);
    if (c && !c.eliminated) {
      c.eliminated = true;
      game.log(`${c.name} wurde vernichtet!`, "bad");
    }
  }
}
