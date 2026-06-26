// map.js — Definition der Karte mit Regionen und Nachbarschaften

// 14 Regionen, positioniert auf einem 1000x700 SVG-Koordinatensystem
export const REGIONS_DEF = [
  { id: "bambus",    name: "Bambuswald",       x: 160, y: 160, defense: 2, income: 8  },
  { id: "feuer",     name: "Feuergebirge",     x: 380, y: 110, defense: 4, income: 12 },
  { id: "nebel",     name: "Nebelinsel",       x: 600, y: 130, defense: 3, income: 10 },
  { id: "schatten",  name: "Schattenfestung",  x: 820, y: 180, defense: 5, income: 14 },
  { id: "mond",      name: "Mondtal",          x: 250, y: 330, defense: 2, income: 9  },
  { id: "wind",      name: "Tempel des Windes",x: 500, y: 310, defense: 4, income: 11 },
  { id: "donner",    name: "Donnerklippen",    x: 740, y: 340, defense: 3, income: 10 },
  { id: "kristall",  name: "Kristallhöhle",    x: 130, y: 500, defense: 3, income: 9  },
  { id: "kirschblue",name: "Kirschblütenhain", x: 370, y: 520, defense: 2, income: 8  },
  { id: "drachenb",  name: "Drachenbucht",     x: 610, y: 510, defense: 4, income: 12 },
  { id: "obsidian",  name: "Obsidianöde",      x: 840, y: 500, defense: 3, income: 10 },
  { id: "sumpf",     name: "Schlangensumpf",   x: 260, y: 630, defense: 2, income: 7  },
  { id: "vulkan",    name: "Vulkanrand",       x: 540, y: 640, defense: 5, income: 13 },
  { id: "eis",       name: "Eisgipfel",        x: 800, y: 640, defense: 4, income: 11 }
];

// Nachbarschaften (Kanten)
export const EDGES = [
  ["bambus","feuer"], ["feuer","nebel"], ["nebel","schatten"],
  ["bambus","mond"], ["feuer","mond"], ["feuer","wind"], ["nebel","wind"], ["schatten","donner"],
  ["mond","wind"], ["wind","donner"], ["nebel","donner"],
  ["mond","kristall"], ["mond","kirschblue"], ["wind","kirschblue"], ["wind","drachenb"], ["donner","drachenb"], ["donner","obsidian"],
  ["kristall","kirschblue"], ["kirschblue","drachenb"], ["drachenb","obsidian"],
  ["kristall","sumpf"], ["kirschblue","sumpf"], ["kirschblue","vulkan"], ["drachenb","vulkan"], ["obsidian","eis"], ["drachenb","eis"],
  ["sumpf","vulkan"], ["vulkan","eis"]
];

// Erstellt eine Adjazenzliste aus den Kanten
export function buildAdjacency() {
  const adj = {};
  REGIONS_DEF.forEach(r => adj[r.id] = []);
  EDGES.forEach(([a, b]) => {
    if (!adj[a].includes(b)) adj[a].push(b);
    if (!adj[b].includes(a)) adj[b].push(a);
  });
  return adj;
}

// Erstellt den initialen Regionen-Zustand mit Startbesetzung
export function createInitialRegions(clans) {
  // Liste mit jeweils Kopie der Definition
  const regions = REGIONS_DEF.map(def => ({
    ...def,
    owner: null,
    troops: { normal: 0, elite: 0, archer: 0, assassin: 0, monk: 0 },
    defenseModifier: 1 // wird von Rauchbombe etc. verändert
  }));

  // Verteile Startregionen: jede Ecke an einen Clan
  const corners = ["bambus", "schatten", "sumpf", "eis"];
  clans.forEach((clan, i) => {
    if (i >= corners.length) return;
    const r = regions.find(r => r.id === corners[i]);
    r.owner = clan.id;
    r.troops.normal = 10;
    r.troops.elite = 2;
  });

  // Restliche Regionen bekommen neutrale "Banditen" (kein Owner)
  regions.forEach(r => {
    if (!r.owner) {
      r.troops.normal = 3 + Math.floor(Math.random() * 4);
    }
  });

  return regions;
}
