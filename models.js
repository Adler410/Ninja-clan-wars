// models.js — Datenmodelle: Clans, Ninja-Klassen, Spezialfähigkeiten

// Definition der Ninja-Klassen mit Werten
export const NINJA_CLASSES = {
  normal:    { id: "normal",    name: "Ninja",            attack: 4,  defense: 3, move: 2, cost: 10, special: null },
  elite:     { id: "elite",     name: "Elite-Ninja",      attack: 7,  defense: 5, move: 2, cost: 25, special: "blitz" },
  archer:    { id: "archer",    name: "Bogenschütze",     attack: 6,  defense: 2, move: 2, cost: 18, special: "feuer" },
  assassin:  { id: "assassin",  name: "Schatten-Assassin",attack: 8,  defense: 2, move: 3, cost: 30, special: "rauch" },
  monk:      { id: "monk",      name: "Mönch",            attack: 3,  defense: 6, move: 1, cost: 22, special: "heil" }
};

// Definition der Spezialfähigkeiten
export const SPECIALS = {
  rauch:      { id: "rauch",      name: "Rauchbombe",   cost: 30, desc: "Reduziert die Verteidigung einer feindlichen Region um 30% für diese Runde." },
  feuer:      { id: "feuer",      name: "Feuertechnik", cost: 40, desc: "Vernichtet 20% der Truppen in einer feindlichen Region." },
  heil:       { id: "heil",       name: "Heiltechnik",  cost: 25, desc: "Stellt 25% der Truppen in einer eigenen Region wieder her." },
  blitz:      { id: "blitz",      name: "Blitzschritt", cost: 35, desc: "Bewege Truppen ohne Limit in eine eigene Region (auch nicht-benachbart)." },
  beschwoer:  { id: "beschwoer",  name: "Beschwörung",  cost: 60, desc: "Beschwöre 10 Elite-Ninjas in einer eigenen Region." }
};

// Vier verfügbare Clans (Spieler kann den ersten anpassen)
export const CLANS = [
  { id: "drache",  name: "Drachen-Clan",  color: "#c4302b", isPlayer: true  },
  { id: "tiger",   name: "Tiger-Clan",    color: "#d4af37", isPlayer: false },
  { id: "wolf",    name: "Wolf-Clan",     color: "#3b82f6", isPlayer: false },
  { id: "phoenix", name: "Phoenix-Clan",  color: "#a855f7", isPlayer: false }
];

// Fabrikfunktion: Erstellt einen neuen Clan-Zustand
export function createClanState(clanDef) {
  return {
    ...clanDef,
    gold: 150,
    eliminated: false,
    relations: {} // wird später befüllt
  };
}
