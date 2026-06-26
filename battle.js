// battle.js — Kampfsystem
import { NINJA_CLASSES } from "./models.js";

// Summiert die gesamte Truppenanzahl
export function totalTroops(troops) {
  return Object.values(troops).reduce((a, b) => a + b, 0);
}

// Berechnet den effektiven Angriffswert aller Truppen
export function attackPower(troops) {
  let p = 0;
  for (const id in troops) {
    p += troops[id] * NINJA_CLASSES[id].attack;
  }
  return p;
}

// Berechnet den effektiven Verteidigungswert aller Truppen
export function defensePower(troops) {
  let p = 0;
  for (const id in troops) {
    p += troops[id] * NINJA_CLASSES[id].defense;
  }
  return p;
}

// Führt einen Kampf zwischen Angreifer und Verteidiger durch.
// Gibt ein Ergebnis-Objekt zurück: { attackerWins, attackerLosses, defenderLosses }
export function resolveBattle(attackerTroops, defenderTroops, regionDefense, defenseModifier = 1) {
  const atk = attackPower(attackerTroops) * (0.85 + Math.random() * 0.3);
  const def = (defensePower(defenderTroops) + regionDefense * 5) * defenseModifier * (0.85 + Math.random() * 0.3);

  const attackerWins = atk > def;
  // Anteilige Verluste basierend auf Verhältnis
  const ratio = def / (atk + def + 1);
  const attackerLossRate = attackerWins ? Math.min(0.6, ratio * 0.9) : Math.min(0.95, ratio * 1.2);
  const defenderLossRate = attackerWins ? Math.min(0.95, (1 - ratio) * 1.2) : Math.min(0.6, (1 - ratio) * 0.9);

  const attackerLosses = applyLosses(attackerTroops, attackerLossRate);
  const defenderLosses = applyLosses(defenderTroops, defenderLossRate);

  return { attackerWins, attackerLosses, defenderLosses, atk: Math.round(atk), def: Math.round(def) };
}

// Wendet anteilige Verluste auf die Truppen an und liefert die Anzahl der Verluste zurück
function applyLosses(troops, rate) {
  let lost = 0;
  for (const id in troops) {
    const n = troops[id];
    if (n <= 0) continue;
    const loss = Math.min(n, Math.round(n * rate + (Math.random() < (n * rate) % 1 ? 1 : 0)));
    troops[id] = n - loss;
    lost += loss;
  }
  return lost;
}
