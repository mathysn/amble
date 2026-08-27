import { PrismaClient } from '@prisma/client';
import type { Category } from '@amble/shared';

const prisma = new PrismaClient();

/**
 * A cluster of curiosities around central London (Covent Garden / Soho). These
 * seed the local cache so Amble is demoable offline — set your device/simulator
 * location to central London and you'll get a rich wander even without Overpass.
 * Names echo the app's design mockups.
 */
const BASE = { lat: 51.5129, lng: -0.1224 };

// scatter helper: metres offset → lat/lng
function at(dLatM: number, dLngM: number) {
  return {
    lat: BASE.lat + dLatM / 111_320,
    lng: BASE.lng + dLngM / (111_320 * Math.cos((BASE.lat * Math.PI) / 180)),
  };
}

const SEED: {
  name: string;
  category: Category;
  blurb: string;
  era?: string;
  neighbourhood: string;
  off: [number, number];
}[] = [
  {
    name: 'Alder Court',
    category: 'hidden',
    blurb:
      "A cobbled courtyard behind the old ironmonger. Its cast-iron fountain has run since 1890, fed by a spring the Victorians never quite managed to cap. Almost no one knows the gate is unlocked.",
    era: '1890',
    neighbourhood: 'Old Town',
    off: [420, 180],
  },
  {
    name: 'Marlow Books',
    category: 'niche',
    blurb:
      "A poet's tiny bookshop, barely two rooms deep, where the owner shelves by mood rather than author.",
    neighbourhood: 'Riverside',
    off: [-360, 260],
  },
  {
    name: 'The Blue-Tiled Stairway',
    category: 'scenic',
    blurb: 'A narrow flight of azulejo steps between two streets, glowing when the sun catches it.',
    neighbourhood: 'Hill End',
    off: [300, -420],
  },
  {
    name: 'The Well',
    category: 'hidden',
    blurb: 'A capped medieval well set into a wall, easy to walk past a hundred times unnoticed.',
    era: '1640',
    neighbourhood: 'Old Town',
    off: [-520, -140],
  },
  {
    name: 'Hartley Passage',
    category: 'niche',
    blurb: 'A covered arcade of half-forgotten trades — a clockmaker, a print seller, a tea merchant.',
    neighbourhood: 'Old Town',
    off: [140, 520],
  },
  {
    name: "Sculptor's Garden",
    category: 'scenic',
    blurb: 'A pocket garden studded with half-finished stone figures left by a nearby studio.',
    neighbourhood: 'Riverside',
    off: [-260, -480],
  },
  {
    name: 'The Old Lamp Room',
    category: 'hidden',
    blurb: 'A tiny former gas-lamp store, its original brass fittings still bolted to the wall.',
    era: '1870',
    neighbourhood: 'Hill End',
    off: [560, -60],
  },
  {
    name: 'Verrine & Co.',
    category: 'niche',
    blurb: 'A cramped, wonderful shop of nothing but glass — carboys, bell jars, apothecary bottles.',
    neighbourhood: 'Riverside',
    off: [-120, 600],
  },
  {
    name: 'The River Steps',
    category: 'scenic',
    blurb: 'Worn stone steps down to the water, a favourite of no one in particular at dusk.',
    neighbourhood: 'Riverside',
    off: [-620, 320],
  },
  {
    name: 'Candlemakers Yard',
    category: 'hidden',
    blurb: 'A quiet yard where a single chandler still works; the whole lane smells faintly of beeswax.',
    neighbourhood: 'Old Town',
    off: [220, -260],
  },
];

async function main() {
  for (const s of SEED) {
    const pos = at(s.off[0], s.off[1]);
    const osmId = `seed/${s.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
    await prisma.curiosity.upsert({
      where: { osmId },
      create: {
        source: 'seed',
        osmId,
        name: s.name,
        category: s.category,
        blurb: s.blurb,
        era: s.era ?? null,
        neighbourhood: s.neighbourhood,
        lat: pos.lat,
        lng: pos.lng,
      },
      update: {},
    });
  }
  console.log(`Seeded ${SEED.length} curiosities around central London.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
