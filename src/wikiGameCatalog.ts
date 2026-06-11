/**
 * wikiGameCatalog.ts — Curated iconic games (Atari → 3DS) for Game of the Day.
 *
 * Each entry maps to an English Wikipedia article. The daily picker chooses
 * deterministically from this list; article summaries and thumbnails are
 * fetched at display time via the Wikipedia API.
 */

export interface WikiGameCatalogEntry {
  /** Display name shown in the widget. */
  name: string;
  /** Exact English Wikipedia article title. */
  wikiTitle: string;
  /** RetroOasis system id for platform badge / icon. */
  systemId: string;
}

/** Representative classics from Atari 2600 through Nintendo 3DS. */
export const WIKI_GAME_CATALOG: readonly WikiGameCatalogEntry[] = [
  // Atari 2600 / early home
  { name: "Pitfall!", wikiTitle: "Pitfall!", systemId: "atari2600" },
  { name: "Adventure", wikiTitle: "Adventure (1980 video game)", systemId: "atari2600" },
  { name: "Asteroids", wikiTitle: "Asteroids (video game)", systemId: "atari2600" },
  { name: "Pac-Man", wikiTitle: "Pac-Man (Atari 2600 video game)", systemId: "atari2600" },
  { name: "Yars' Revenge", wikiTitle: "Yars' Revenge", systemId: "atari2600" },
  { name: "River Raid", wikiTitle: "River Raid", systemId: "atari2600" },
  // Atari 7800
  { name: "Asteroids", wikiTitle: "Asteroids (video game)", systemId: "atari7800" },
  { name: "Food Fight", wikiTitle: "Food Fight (video game)", systemId: "atari7800" },
  // NES
  { name: "Super Mario Bros.", wikiTitle: "Super Mario Bros.", systemId: "nes" },
  { name: "The Legend of Zelda", wikiTitle: "The Legend of Zelda (video game)", systemId: "nes" },
  { name: "Metroid", wikiTitle: "Metroid (video game)", systemId: "nes" },
  { name: "Mega Man 2", wikiTitle: "Mega Man 2", systemId: "nes" },
  { name: "Castlevania", wikiTitle: "Castlevania (1986 video game)", systemId: "nes" },
  { name: "Contra", wikiTitle: "Contra (video game)", systemId: "nes" },
  { name: "Final Fantasy", wikiTitle: "Final Fantasy (video game)", systemId: "nes" },
  { name: "Dragon Quest", wikiTitle: "Dragon Quest (video game)", systemId: "nes" },
  { name: "Kirby's Adventure", wikiTitle: "Kirby's Adventure", systemId: "nes" },
  // Master System / Game Gear
  { name: "Sonic the Hedgehog", wikiTitle: "Sonic the Hedgehog (1991 video game)", systemId: "segaMS" },
  { name: "Phantasy Star", wikiTitle: "Phantasy Star (video game)", systemId: "segaMS" },
  { name: "Shinobi", wikiTitle: "Shinobi (1987 video game)", systemId: "segaGG" },
  // SNES
  { name: "Super Mario World", wikiTitle: "Super Mario World", systemId: "snes" },
  { name: "The Legend of Zelda: A Link to the Past", wikiTitle: "The Legend of Zelda: A Link to the Past", systemId: "snes" },
  { name: "Super Metroid", wikiTitle: "Super Metroid", systemId: "snes" },
  { name: "Chrono Trigger", wikiTitle: "Chrono Trigger", systemId: "snes" },
  { name: "Final Fantasy VI", wikiTitle: "Final Fantasy VI", systemId: "snes" },
  { name: "EarthBound", wikiTitle: "EarthBound", systemId: "snes" },
  { name: "Super Mario Kart", wikiTitle: "Super Mario Kart", systemId: "snes" },
  { name: "Donkey Kong Country", wikiTitle: "Donkey Kong Country", systemId: "snes" },
  { name: "Street Fighter II", wikiTitle: "Street Fighter II", systemId: "snes" },
  // Genesis / Mega Drive
  { name: "Sonic the Hedgehog 2", wikiTitle: "Sonic the Hedgehog 2", systemId: "segaMD" },
  { name: "Streets of Rage 2", wikiTitle: "Streets of Rage 2", systemId: "segaMD" },
  { name: "Phantasy Star IV", wikiTitle: "Phantasy Star IV", systemId: "segaMD" },
  { name: "Gunstar Heroes", wikiTitle: "Gunstar Heroes", systemId: "segaMD" },
  { name: "Shining Force", wikiTitle: "Shining Force", systemId: "segaMD" },
  // Sega CD / 32X
  { name: "Lunar: The Silver Star", wikiTitle: "Lunar: The Silver Star", systemId: "segaCD" },
  { name: "Knuckles' Chaotix", wikiTitle: "Knuckles' Chaotix", systemId: "sega32x" },
  // Game Boy
  { name: "Tetris", wikiTitle: "Tetris (Game Boy video game)", systemId: "gb" },
  { name: "Pokémon Red and Blue", wikiTitle: "Pokémon Red and Blue", systemId: "gb" },
  { name: "The Legend of Zelda: Link's Awakening", wikiTitle: "The Legend of Zelda: Link's Awakening", systemId: "gb" },
  { name: "Metroid II", wikiTitle: "Metroid II: Return of Samus", systemId: "gb" },
  // GBA
  { name: "Metroid Fusion", wikiTitle: "Metroid Fusion", systemId: "gba" },
  { name: "The Legend of Zelda: The Minish Cap", wikiTitle: "The Legend of Zelda: The Minish Cap", systemId: "gba" },
  { name: "Advance Wars", wikiTitle: "Advance Wars", systemId: "gba" },
  { name: "Fire Emblem", wikiTitle: "Fire Emblem (2003 video game)", systemId: "gba" },
  { name: "Castlevania: Aria of Sorrow", wikiTitle: "Castlevania: Aria of Sorrow", systemId: "gba" },
  { name: "Pokémon Emerald", wikiTitle: "Pokémon Emerald", systemId: "gba" },
  // N64
  { name: "Super Mario 64", wikiTitle: "Super Mario 64", systemId: "n64" },
  { name: "The Legend of Zelda: Ocarina of Time", wikiTitle: "The Legend of Zelda: Ocarina of Time", systemId: "n64" },
  { name: "GoldenEye 007", wikiTitle: "GoldenEye 007 (1997 video game)", systemId: "n64" },
  { name: "Banjo-Kazooie", wikiTitle: "Banjo-Kazooie", systemId: "n64" },
  { name: "Mario Kart 64", wikiTitle: "Mario Kart 64", systemId: "n64" },
  { name: "Star Fox 64", wikiTitle: "Star Fox 64", systemId: "n64" },
  // PlayStation
  { name: "Final Fantasy VII", wikiTitle: "Final Fantasy VII", systemId: "psx" },
  { name: "Metal Gear Solid", wikiTitle: "Metal Gear Solid (1998 video game)", systemId: "psx" },
  { name: "Castlevania: Symphony of the Night", wikiTitle: "Castlevania: Symphony of the Night", systemId: "psx" },
  { name: "Resident Evil 2", wikiTitle: "Resident Evil 2", systemId: "psx" },
  { name: "Crash Bandicoot", wikiTitle: "Crash Bandicoot (video game)", systemId: "psx" },
  { name: "Tekken 3", wikiTitle: "Tekken 3", systemId: "psx" },
  // Saturn
  { name: "Panzer Dragoon Saga", wikiTitle: "Panzer Dragoon Saga", systemId: "segaSaturn" },
  { name: "Nights into Dreams", wikiTitle: "Nights into Dreams", systemId: "segaSaturn" },
  // Dreamcast
  { name: "Sonic Adventure", wikiTitle: "Sonic Adventure", systemId: "segaDC" },
  { name: "Shenmue", wikiTitle: "Shenmue", systemId: "segaDC" },
  { name: "Jet Set Radio", wikiTitle: "Jet Set Radio", systemId: "segaDC" },
  // Nintendo DS
  { name: "New Super Mario Bros.", wikiTitle: "New Super Mario Bros.", systemId: "nds" },
  { name: "The World Ends with You", wikiTitle: "The World Ends with You", systemId: "nds" },
  { name: "Phoenix Wright: Ace Attorney", wikiTitle: "Phoenix Wright: Ace Attorney", systemId: "nds" },
  { name: "Mario Kart DS", wikiTitle: "Mario Kart DS", systemId: "nds" },
  { name: "Pokémon Diamond and Pearl", wikiTitle: "Pokémon Diamond and Pearl", systemId: "nds" },
  // Nintendo 3DS
  { name: "The Legend of Zelda: Ocarina of Time 3D", wikiTitle: "The Legend of Zelda: Ocarina of Time 3D", systemId: "3ds" },
  { name: "Fire Emblem Awakening", wikiTitle: "Fire Emblem Awakening", systemId: "3ds" },
  { name: "Animal Crossing: New Leaf", wikiTitle: "Animal Crossing: New Leaf", systemId: "3ds" },
  { name: "Pokémon X and Y", wikiTitle: "Pokémon X and Y", systemId: "3ds" },
  { name: "Super Mario 3D Land", wikiTitle: "Super Mario 3D Land", systemId: "3ds" },
  { name: "Monster Hunter 4 Ultimate", wikiTitle: "Monster Hunter 4 Ultimate", systemId: "3ds" },
];
