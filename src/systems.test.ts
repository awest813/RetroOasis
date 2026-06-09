import { describe, expect, it } from "vitest";
import {
  SYSTEMS,
  detectSystem,
  detectSystemFromRomHeader,
  getSystemById,
  getSystemByCoreHint,
  getSystemFeatureSummary,
  getPSPSettingsForTier,
  getNDSSettingsForTier,
  getN3DSSettingsForTier,
  getGBASettingsForTier,
  getPSXSettingsForTier,
  getGBSettingsForTier,
  getGBCSettingsForTier,
  type SystemInfo,
} from "./systems.js";
import { EJS_CDN_BASE, wasmCorePackageNameFor } from "./emulator.js";

describe('systems performance profiles', () => {
  describe('detectSystem', () => {
    it('detects Nintendo DS files', () => {
      const detected = detectSystem('mario.nds');
      expect(Array.isArray(detected)).toBe(false);
      expect(detected && !Array.isArray(detected) ? detected.id : null).toBe('nds');
    });

    it('detects new EmulatorJS 4.3-pre system file types', () => {
      const intv = detectSystem('night-stalker.int');
      expect(Array.isArray(intv)).toBe(false);
      expect(intv && !Array.isArray(intv) ? intv.id : null).toBe('intv');

      const n3ds = detectSystem('pilotwings-resort.3ds');
      expect(Array.isArray(n3ds)).toBe(false);
      expect(n3ds && !Array.isArray(n3ds) ? n3ds.id : null).toBe('3ds');

      const dos = detectSystem('duke3d.bat');
      expect(Array.isArray(dos)).toBe(false);
      expect(dos && !Array.isArray(dos) ? dos.id : null).toBe('dos');
    });

    it('detects unique extensions correctly', () => {
      // .cso is unique to PSP (ISO compressed)
      const pspDetected = detectSystem('game.cso');
      expect(Array.isArray(pspDetected)).toBe(false);
      expect(pspDetected && !Array.isArray(pspDetected) ? pspDetected.id : null).toBe('psp');

      const gbaDetected = detectSystem('pokemon.gba');
      expect(Array.isArray(gbaDetected)).toBe(false);
      expect(gbaDetected && !Array.isArray(gbaDetected) ? gbaDetected.id : null).toBe('gba');

      const n64Detected = detectSystem('pilotwings.64');
      expect(Array.isArray(n64Detected)).toBe(false);
      expect(n64Detected && !Array.isArray(n64Detected) ? n64Detected.id : null).toBe('n64');

      const gameGearDetected = detectSystem('X-Men (USA).gg');
      expect(Array.isArray(gameGearDetected)).toBe(false);
      expect(gameGearDetected && !Array.isArray(gameGearDetected) ? gameGearDetected.id : null).toBe('segaGG');
    });

    it('defaults Genesis ROMs to the standard core instead of prompting for the wide variant', () => {
      const detected = detectSystem('Shining Force (USA).md');
      expect(Array.isArray(detected)).toBe(false);
      expect(detected && !Array.isArray(detected) ? detected.id : null).toBe('segaMD');
    });

    it('detects Sega 32X ROM extensions directly', () => {
      const detected = detectSystem('Knuckles Chaotix (USA).32x');
      expect(Array.isArray(detected)).toBe(false);
      expect(detected && !Array.isArray(detected) ? detected.id : null).toBe('sega32x');

      const alternate = detectSystem('Virtua Racing Deluxe.68k');
      expect(Array.isArray(alternate)).toBe(false);
      expect(alternate && !Array.isArray(alternate) ? alternate.id : null).toBe('sega32x');
    });

    it('.iso is shared between PSP and PSX — returns an array of candidates', () => {
      const detected = detectSystem('game.iso');
      expect(Array.isArray(detected)).toBe(true);
      const ids = (detected as SystemInfo[]).map(s => s.id);
      expect(ids).toContain('psp');
      expect(ids).toContain('psx');
    });

    it('.pbp is shared between PSP and PSX — returns an array of candidates', () => {
      const detected = detectSystem('eboot.pbp');
      expect(Array.isArray(detected)).toBe(true);
      const ids = (detected as SystemInfo[]).map(s => s.id);
      expect(ids).toContain('psp');
      expect(ids).toContain('psx');
    });

    it('.bin is accepted as a PS1 file format', () => {
      const detected = detectSystem('game.bin');
      // .bin may only match psx, or could be shared with other systems
      // Either way, psx must be in the result
      if (Array.isArray(detected)) {
        const ids = (detected as SystemInfo[]).map(s => s.id);
        expect(ids).toContain('psx');
      } else {
        expect(detected?.id).toBe('psx');
      }
    });

    it('handles case insensitivity for extensions', () => {
      // .CSO is unique to PSP (use cso instead of iso since iso is now shared)
      const detected = detectSystem('GAME.CSO');
      expect(Array.isArray(detected)).toBe(false);
      expect(detected && !Array.isArray(detected) ? detected.id : null).toBe('psp');
    });

    it('returns null for unknown extensions', () => {
      const detected = detectSystem('game.unknown');
      expect(detected).toBeNull();

      const noExtDetected = detectSystem('game_without_extension');
      expect(noExtDetected).toBeNull();
    });

    it('returns null for extensionless files whose names coincide with known extensions', () => {
      // A file literally named "bin" (no dot) has no extension and must not
      // be matched against the "bin" extension used by PSX / Atari 7800.
      expect(detectSystem('bin')).toBeNull();
      // Similarly for "iso", which is shared between PSP and PSX.
      expect(detectSystem('iso')).toBeNull();
      // And "zip", shared between arcade/MAME cores.
      expect(detectSystem('zip')).toBeNull();
    });

    it('detects ambiguous CHD extensions for Saturn, PSX, and Dreamcast', () => {
      // The current PPSSPP web core aborts on PSP CHD files, so PSP is not offered.
      const chdDetected = detectSystem('game.chd');
      expect(Array.isArray(chdDetected)).toBe(true);
      const ids = (chdDetected as SystemInfo[]).map(s => s.id);
      expect(ids).toContain('psx');
      expect(ids).toContain('segaSaturn');
      expect(ids).toContain('segaDC');
      expect(ids).not.toContain('psp');
    });

    it('detects ambiguous extensions for Arcade and MAME 2003+', () => {
      // .zip is shared between Arcade (FBNeo) and MAME 2003+
      const zipDetected = detectSystem('romset.zip');
      expect(Array.isArray(zipDetected)).toBe(true);
      const ids = (zipDetected as SystemInfo[]).map(s => s.id);
      expect(ids).toContain('arcade');
      expect(ids).toContain('mame2003');
    });

    it('detects ambiguous extensions for PS1 and Atari 7800', () => {
      // .bin is shared between PS1 and Atari 7800
      const binDetected = detectSystem('game.bin');
      expect(Array.isArray(binDetected)).toBe(true);
      const ids = (binDetected as SystemInfo[]).map(s => s.id);
      expect(ids).toContain('psx');
      expect(ids).toContain('atari7800');
    });

    it('detects other ambiguous disc formats shared between systems', () => {
      // .m3u is shared between PSX, Sega CD, Saturn, and Dreamcast
      const m3uDetected = detectSystem('playlist.m3u');
      expect(Array.isArray(m3uDetected)).toBe(true);
      let ids = (m3uDetected as SystemInfo[]).map(s => s.id);
      expect(ids).toContain('psx');
      expect(ids).toContain('segaCD');
      expect(ids).toContain('segaSaturn');
      expect(ids).toContain('segaDC');

      // .cue is shared across CD-based systems; .img, .mdf, .ccd are shared between PSX and Saturn
      ['game.cue', 'game.img', 'game.mdf', 'game.ccd'].forEach(file => {
        const detected = detectSystem(file);
        expect(Array.isArray(detected)).toBe(true);
        ids = (detected as SystemInfo[]).map(s => s.id);
        expect(ids).toContain('psx');
        if (file.endsWith('.cue')) expect(ids).toContain('segaCD');
        expect(ids).toContain('segaSaturn');
      });
    });

    it('handles files with multiple dots correctly', () => {
      // should detect the LAST extension
      const detected = detectSystem('game.iso.zip');
      expect(Array.isArray(detected)).toBe(true);
      const ids = (detected as SystemInfo[]).map(s => s.id);
      expect(ids).toContain('arcade');
      expect(ids).toContain('mame2003');
    });

    it('handles files ending in a dot correctly', () => {
      const detected = detectSystem('game.');
      expect(detected).toBeNull();
    });

    it('handles empty filename correctly', () => {
      const detected = detectSystem('');
      expect(detected).toBeNull();
    });

    it('returns null for hidden files (dot-prefixed names like ".gitignore")', () => {
      // With lastIndexOf-based extraction, a leading dot is not treated as a
      // separator — dotIdx === 0, which is not > 0, so ext resolves to "" and
      // detectSystem correctly returns null.
      const detected = detectSystem('.gitignore');
      expect(detected).toBeNull();
    });

    it('falls back to ROM header fingerprinting for extensionless files', () => {
      const nesHeader = new Uint8Array([0x4e, 0x45, 0x53, 0x1a]);
      const detected = detectSystem('mystery_dump', nesHeader);
      expect(Array.isArray(detected)).toBe(false);
      expect(detected && !Array.isArray(detected) ? detected.id : null).toBe('nes');
    });
  });

  describe('system table completeness', () => {
    it('keeps non-empty ids, at least one extension, and a valid resolved corePath URL for every system', () => {
      const defaultEjsSettings: Record<string, string> = {};
      for (const system of SYSTEMS) {
        expect(system.id.trim().length).toBeGreaterThan(0);
        expect(system.extensions.length).toBeGreaterThan(0);
        for (const ext of system.extensions) {
          expect(ext.trim().length).toBeGreaterThan(0);
          expect(ext).toBe(ext.toLowerCase());
        }

        const resolvedCorePath = system.corePath ??
          `${EJS_CDN_BASE}cores/${wasmCorePackageNameFor(system, defaultEjsSettings)}-wasm.data`;
        if (resolvedCorePath.startsWith("./")) {
          expect(resolvedCorePath).not.toContain("..");
        } else {
          const parsed = new URL(resolvedCorePath);
          expect(parsed.protocol === "https:" || parsed.protocol === "http:").toBe(true);
        }
      }
    });
  });

  describe('detectSystemFromRomHeader', () => {
    it('recognises NES iNES magic bytes', () => {
      const header = new Uint8Array([0x4e, 0x45, 0x53, 0x1a, 0x01, 0x00, 0x00, 0x00]);
      expect(detectSystemFromRomHeader(header)?.id).toBe('nes');
    });

    it('recognises SNES LoROM-like headers by map mode and reset vector range', () => {
      const header = new Uint8Array(0x10000);
      header[0x7fd5] = 0x20; // LoROM map mode
      header[0x7ffc] = 0x00;
      header[0x7ffd] = 0x80; // reset vector = 0x8000
      expect(detectSystemFromRomHeader(header)?.id).toBe('snes');
    });

    it('recognises N64 headers in z64, v64, and n64 byte orders', () => {
      expect(detectSystemFromRomHeader(new Uint8Array([0x80, 0x37, 0x12, 0x40]))?.id).toBe('n64');
      expect(detectSystemFromRomHeader(new Uint8Array([0x37, 0x80, 0x40, 0x12]))?.id).toBe('n64');
      expect(detectSystemFromRomHeader(new Uint8Array([0x40, 0x12, 0x37, 0x80]))?.id).toBe('n64');
    });

    it('recognises Nintendo 3DS NCSD and 3DSX headers', () => {
      const ncsd = new Uint8Array(0x104);
      ncsd[0x100] = 0x4e; ncsd[0x101] = 0x43; ncsd[0x102] = 0x53; ncsd[0x103] = 0x44;
      expect(detectSystemFromRomHeader(ncsd)?.id).toBe('3ds');

      const homebrew = new Uint8Array([0x33, 0x44, 0x53, 0x58, 0x00]);
      expect(detectSystemFromRomHeader(homebrew)?.id).toBe('3ds');
    });
  });

  describe('getSystemByCoreHint', () => {
    it('maps webretro N64 core URLs to the RetroOasis N64 profile', () => {
      expect(getSystemByCoreHint('parallel_n64')?.id).toBe('n64');
      expect(getSystemByCoreHint('mupen64plus-next')).toBeUndefined();
    });

    it('maps 3DS core hints to the experimental 3DS profile', () => {
      expect(getSystemByCoreHint('azahar')?.id).toBe('3ds');
      expect(getSystemByCoreHint('citra')?.id).toBe('3ds');
    });

    it('maps Flycast core hints to the experimental Dreamcast profile', () => {
      expect(getSystemByCoreHint('flycast')?.id).toBe('segaDC');
    });

    it('ignores autodetect because RetroOasis already auto-detects file imports', () => {
      expect(getSystemByCoreHint('autodetect')).toBeUndefined();
    });
  });

  describe('getSystemFeatureSummary', () => {
    it('includes threaded core and RetroAchievements where applicable', () => {
      const psp = getSystemById('psp')!;
      expect(getSystemFeatureSummary(psp)).toContain('Multi-threaded');
      const gba = getSystemById('gba')!;
      expect(getSystemFeatureSummary(gba)).toContain('RetroAchievements');
      expect(getSystemFeatureSummary(psp)).toContain('RetroAchievements');
      const psx = getSystemById('psx')!;
    expect(getSystemFeatureSummary(psx)).toContain('RetroAchievements');
    const genesis = getSystemById('segaMD')!;
    expect(getSystemFeatureSummary(genesis)).toContain('RetroAchievements');
    const segaCd = getSystemById('segaCD')!;
    expect(getSystemFeatureSummary(segaCd)).toContain('BIOS');
    expect(getSystemFeatureSummary(segaCd)).toContain('RetroAchievements');
    const sega32x = getSystemById('sega32x')!;
    expect(getSystemFeatureSummary(sega32x)).toContain('RetroAchievements');
    const nds = getSystemById('nds')!;
    expect(getSystemFeatureSummary(nds)).toContain('Built-in touch');
  });
  });

  it('provides tier settings for PSP, NDS, N64, Saturn and Dreamcast', () => {
    const psp = getSystemById('psp');
    const nds = getSystemById('nds');

    const saturn = getSystemById('segaSaturn');
    const dc = getSystemById('segaDC');

    expect(psp?.tierSettings?.low?.ppsspp_internal_resolution).toBe('1');
    expect(nds?.tierSettings?.low?.desmume_frameskip).toBe('2');
    expect(nds?.tierSettings?.ultra?.desmume_internal_resolution).toBe('1024x768');
    expect(getSystemById('3ds')?.tierSettings?.low?.retroarch_core).toBe('azahar');
    expect(getSystemById('3ds')?.tierSettings?.low?.citra_resolution_factor).toBe('1x (Native)');
    expect(getSystemById('3ds')?.tierSettings?.ultra?.citra_resolution_factor).toBe('3x');
    expect(getSystemById('3ds')?.extensions).toEqual(expect.arrayContaining(['axf', '3dsx']));
    expect(getSystemById('psp')?.extensions).toContain('prx');
    expect(getSystemById('dos')?.tierSettings?.low?.retroarch_core).toBe('dosbox_pure');
    expect(getSystemById('segaCD')?.tierSettings?.high?.retroarch_core).toBe('genesis_plus_gx');
    expect(getSystemById('segaCD')?.tierSettings?.high?.genesis_plus_gx_cartridge_slot).toBe('mcd');
    expect(getSystemById('sega32x')?.tierSettings?.high?.retroarch_core).toBe('picodrive');

    expect(saturn?.tierSettings?.low?.retroarch_core).toBe('yabause');
    expect(saturn?.tierSettings?.low?.yabause_frameskip).toBe('enabled');
    expect(saturn?.tierSettings?.ultra?.yabause_addon_cartridge).toBe('4M_ram');
    // Dreamcast keeps app-facing Flycast keys and core-facing Reicast aliases.
    expect(dc?.tierSettings?.low?.flycast_frame_skipping).toBe('enabled');
    expect(dc?.tierSettings?.low?.reicast_frame_skipping).toBe('enabled');
    expect(dc?.tierSettings?.ultra?.flycast_internal_resolution).toBe('1920x1440');
    expect(dc?.tierSettings?.ultra?.reicast_internal_resolution).toBe('1920x1440');
    expect(dc?.coreId).toBe('flycast');
    expect(dc?.corePath).toContain('flycast-wasm.data');
    expect(dc?.extensions).toContain('zip');
    expect(dc?.needsWebGL2).toBe(true);
    expect(dc?.needsBios).toBe(false);
    expect(dc?.experimental).toBe(true);
    expect(dc?.stabilityNotice).toContain('stabil');
    expect(dc?.tierSettings?.low?.flycast_hle_bios).toBe('enabled');
    expect(dc?.tierSettings?.low?.reicast_hle_bios).toBe('enabled');
    expect(dc?.tierSettings?.ultra?.flycast_hle_bios).toBe('enabled');
    expect(dc?.tierSettings?.ultra?.reicast_hle_bios).toBe('enabled');
  });

  it('does not advertise PS2 until a launchable browser core is wired', () => {
    expect(getSystemById('ps2')).toBeUndefined();
    const detected = detectSystem('game.iso');
    const ids = Array.isArray(detected) ? detected.map(s => s.id) : detected ? [detected.id] : [];
    expect(ids).not.toContain('ps2');
  });

  it('provides non-empty tier settings for every supported 2D system', () => {
    for (const system of SYSTEMS.filter(s => !s.is3D)) {
      expect(system.tierSettings, system.id).toBeDefined();
      expect(Object.keys(system.perfSettings).length, `${system.id} perf`).toBeGreaterThan(0);
      expect(Object.keys(system.qualitySettings).length, `${system.id} quality`).toBeGreaterThan(0);
      for (const tier of ['low', 'medium', 'high', 'ultra'] as const) {
        expect(Object.keys(system.tierSettings?.[tier] ?? {}).length, `${system.id} ${tier}`).toBeGreaterThan(0);
      }
    }
  });

  it('adds explicit arcade and handheld 2D core settings', () => {
    expect(getSystemById('arcade')?.tierSettings?.low?.retroarch_core).toBe('fbneo');
    expect(getSystemById('mame2003')?.tierSettings?.ultra?.['mame2003-plus_art_resolution']).toBe('2');
    expect(getSystemById('atari7800')?.tierSettings?.high?.retroarch_core).toBe('prosystem');
    expect(getSystemById('lynx')?.tierSettings?.high?.handy_rot).toBe('None');
    expect(getSystemById('ngp')?.tierSettings?.high?.ngp_language).toBe('english');
    expect(getSystemById('intv')?.tierSettings?.high?.retroarch_core).toBe('freeintv');
  });

  it('exposes 4.3-pre alternate cores as explicit selectable profiles', () => {
    expect(getSystemById('snesBsnes')?.coreId).toBe('snes');
    expect(getSystemById('snesBsnes')?.tierSettings?.high?.retroarch_core).toBe('bsnes');
    expect(getSystemById('segaMDWide')?.coreId).toBe('segaMD');
    expect(getSystemById('segaMDWide')?.tierSettings?.high?.retroarch_core).toBe('genesis_plus_gx_wide');
    expect(getSystemById('segaCD')?.tierSettings?.high?.retroarch_core).toBe('genesis_plus_gx');
    expect(getSystemById('sega32x')?.tierSettings?.high?.retroarch_core).toBe('picodrive');
    expect(getSystemById('3ds')?.experimental).toBe(true);
    expect(getSystemById('3ds')?.needsThreads).toBe(true);
    expect(getSystemById('dos')?.needsThreads).toBe(true);
  });

  it('wires every supported system to an explicit EmulatorJS core package', () => {
    const expectedCoreBySystem: Record<string, string> = {
      psp: "ppsspp",
      nes: "fceumm",
      snes: "snes9x",
      snesBsnes: "bsnes",
      gba: "mgba",
      gbc: "gambatte",
      gb: "gambatte",
      nds: "desmume2015",
      "3ds": "azahar",
      n64: "parallel_n64",
      psx: "pcsx_rearmed",
      segaMD: "genesis_plus_gx",
      segaMDWide: "genesis_plus_gx_wide",
      segaCD: "genesis_plus_gx",
      sega32x: "picodrive",
      segaGG: "genesis_plus_gx",
      segaMS: "genesis_plus_gx",
      atari2600: "stella2014",
      intv: "freeintv",
      dos: "dosbox_pure",
      arcade: "fbneo",
      segaSaturn: "yabause",
      segaDC: "flycast",
      mame2003: "mame2003_plus",
      atari7800: "prosystem",
      lynx: "handy",
      ngp: "mednafen_ngp",
    };

    for (const system of SYSTEMS) {
      const tierSettings = system.tierSettings?.high ?? system.qualitySettings;
      const resolvedCore = system.corePath
        ? system.coreId ?? system.id
        : wasmCorePackageNameFor(system, tierSettings);

      expect(resolvedCore, system.id).toBe(expectedCoreBySystem[system.id]);
      expect(resolvedCore, system.id).not.toContain("/");
      expect(resolvedCore, system.id).not.toContain(".data");
    }
  });

  describe('PSP audio latency settings', () => {
    it('uses the highest audio buffer on the low tier', () => {
      const psp = getSystemById('psp');
      expect(psp?.tierSettings?.low?.ppsspp_audio_latency).toBe('2');
    });

    it('uses a medium audio buffer on the medium tier', () => {
      const psp = getSystemById('psp');
      expect(psp?.tierSettings?.medium?.ppsspp_audio_latency).toBe('1');
    });

    it('uses a medium audio buffer on the high tier', () => {
      const psp = getSystemById('psp');
      expect(psp?.tierSettings?.high?.ppsspp_audio_latency).toBe('1');
    });

    it('uses the lowest audio latency on the ultra tier', () => {
      const psp = getSystemById('psp');
      expect(psp?.tierSettings?.ultra?.ppsspp_audio_latency).toBe('0');
    });
  });

  describe('PSP audio resampling settings', () => {
    it('disables resampling on low tier to save CPU', () => {
      const psp = getSystemById('psp');
      expect(psp?.tierSettings?.low?.ppsspp_audio_resampling).toBe('disabled');
    });

    it('enables resampling on medium, high and ultra tiers for better quality', () => {
      const psp = getSystemById('psp');
      // Medium tier enables resampling: the CPU cost is modest and audio
      // quality is noticeably better for music-heavy PSP titles.
      expect(psp?.tierSettings?.medium?.ppsspp_audio_resampling).toBe('enabled');
      expect(psp?.tierSettings?.high?.ppsspp_audio_resampling).toBe('enabled');
      expect(psp?.tierSettings?.ultra?.ppsspp_audio_resampling).toBe('enabled');
    });
  });

  describe('PSP 3D performance settings', () => {
    it('uses the 4.3-pre PPSSPP OpenGL backend on every tier', () => {
      const psp = getSystemById('psp');
      expect(psp?.tierSettings?.low?.ppsspp_rendering_mode).toBe('OpenGL');
      expect(psp?.tierSettings?.medium?.ppsspp_rendering_mode).toBe('OpenGL');
      expect(psp?.tierSettings?.high?.ppsspp_rendering_mode).toBe('OpenGL');
      expect(psp?.tierSettings?.ultra?.ppsspp_rendering_mode).toBe('OpenGL');
    });

    it('leaves FPS uncapped on low tier to avoid PSP loading-state timing bugs', () => {
      const psp = getSystemById('psp');
      expect(psp?.tierSettings?.low?.ppsspp_force_max_fps).toBe('0');
    });

    it('uncaps FPS on high and ultra tiers', () => {
      const psp = getSystemById('psp');
      expect(psp?.tierSettings?.high?.ppsspp_force_max_fps).toBe('0');
      expect(psp?.tierSettings?.ultra?.ppsspp_force_max_fps).toBe('0');
    });

    it('uses compatibility-safe PSP CPU and I/O options on every tier', () => {
      const psp = getSystemById('psp');
      for (const tier of ['low', 'medium', 'high', 'ultra'] as const) {
        const settings = psp?.tierSettings?.[tier];
        expect(settings?.ppsspp_fast_memory).toBe('disabled');
        expect(settings?.ppsspp_io_timing_method).toBe('Host');
        expect(settings?.ppsspp_separate_io_thread).toBe('disabled');
        expect(settings?.ppsspp_unsafe_func_replacements).toBe('disabled');
        expect(settings?.ppsspp_locked_cpu_speed).toBe('0');
        expect(settings?.ppsspp_change_emulated_psp_cpu_clock).toBe('0');
      }
    });
  });

  // ── GBA tier settings ───────────────────────────────────────────────────

  describe('GBA (mGBA) tier settings', () => {
    it('provides tier settings for GBA', () => {
      const gba = getSystemById('gba');
      expect(gba?.tierSettings).toBeDefined();
      expect(gba?.tierSettings?.low).toBeDefined();
      expect(gba?.tierSettings?.medium).toBeDefined();
      expect(gba?.tierSettings?.high).toBeDefined();
      expect(gba?.tierSettings?.ultra).toBeDefined();
    });

    it('routes through mGBA and omits frameskip options rejected by the web core', () => {
      const gba = getSystemById('gba');
      expect(gba?.tierSettings?.low?.retroarch_core).toBe('mgba');
      expect(gba?.tierSettings?.low?.mgba_frameskip).toBeUndefined();
      expect(gba?.tierSettings?.medium?.mgba_frameskip).toBeUndefined();
      expect(gba?.tierSettings?.high?.mgba_frameskip).toBeUndefined();
      expect(gba?.tierSettings?.ultra?.mgba_frameskip).toBeUndefined();
    });

    it('does not send stale mGBA visual options rejected by the web core', () => {
      const gba = getSystemById('gba');
      for (const tier of ['low', 'medium', 'high', 'ultra'] as const) {
        expect(gba?.tierSettings?.[tier]?.mgba_color_correction).toBeUndefined();
        expect(gba?.tierSettings?.[tier]?.mgba_interframe_blending).toBeUndefined();
      }
    });

    it('always skips BIOS', () => {
      const gba = getSystemById('gba');
      expect(gba?.tierSettings?.low?.mgba_skip_bios).toBe('ON');
      expect(gba?.tierSettings?.ultra?.mgba_skip_bios).toBe('ON');
    });

    it('getGBASettingsForTier returns a copy of the correct tier settings', () => {
      const lowSettings = getGBASettingsForTier('low');
      expect(lowSettings.retroarch_core).toBe('mgba');
      expect(lowSettings.mgba_frameskip).toBeUndefined();
      expect(lowSettings.mgba_color_correction).toBeUndefined();

      const ultraSettings = getGBASettingsForTier('ultra');
      expect(ultraSettings.mgba_frameskip).toBeUndefined();
      expect(ultraSettings.mgba_interframe_blending).toBeUndefined();
    });
  });

  // ── PSX tier settings ───────────────────────────────────────────────────

  describe('PS1 (PCSX ReARMed) tier settings', () => {
    it('provides tier settings for PSX', () => {
      const psx = getSystemById('psx');
      expect(psx?.tierSettings).toBeDefined();
      expect(psx?.tierSettings?.low).toBeDefined();
      expect(psx?.tierSettings?.ultra).toBeDefined();
    });

    it('does not include Beetle-only resolution settings on PS1 tiers', () => {
      const psx = getSystemById('psx');
      // pcsx_rearmed has no beetle resolution key.
      expect(psx?.tierSettings?.low?.beetle_psx_hw_internal_resolution).toBeUndefined();
      expect(psx?.tierSettings?.medium?.beetle_psx_hw_internal_resolution).toBeUndefined();
    });

    it('omits Beetle resolution settings on high and ultra tiers', () => {
      const psx = getSystemById('psx');
      expect(psx?.tierSettings?.high?.beetle_psx_hw_internal_resolution).toBeUndefined();
      expect(psx?.tierSettings?.ultra?.beetle_psx_hw_internal_resolution).toBeUndefined();
    });

    it('pcsx_rearmed low/medium tiers have no frame duping option (not a beetle key)', () => {
      const psx = getSystemById('psx');
      expect(psx?.tierSettings?.low?.beetle_psx_hw_frame_duping).toBeUndefined();
      expect(psx?.tierSettings?.medium?.beetle_psx_hw_frame_duping).toBeUndefined();
    });

    it('omits Beetle filtering settings on high and ultra tiers', () => {
      const psx = getSystemById('psx');
      expect(psx?.tierSettings?.high?.beetle_psx_hw_filter).toBeUndefined();
      expect(psx?.tierSettings?.ultra?.beetle_psx_hw_filter).toBeUndefined();
      // low/medium use pcsx_rearmed — no beetle_psx_hw_ filter key
      expect(psx?.tierSettings?.low?.beetle_psx_hw_filter).toBeUndefined();
    });

    it('getPSXSettingsForTier returns a copy of the correct tier settings', () => {
      // low/medium: pcsx_rearmed options
      const lowSettings = getPSXSettingsForTier('low');
      expect(lowSettings.pcsx_rearmed_drc).toBe('enabled');
      expect(lowSettings.pcsx_rearmed_frameskip).toBe('0');
      expect(lowSettings.retroarch_core).toBe('pcsx_rearmed');

      const mediumSettings = getPSXSettingsForTier('medium');
      expect(mediumSettings.pcsx_rearmed_drc).toBe('enabled');
      expect(mediumSettings.retroarch_core).toBe('pcsx_rearmed');

      // high/ultra remain on PCSX ReARMed.
      const highSettings = getPSXSettingsForTier('high');
      expect(highSettings.retroarch_core).toBe('pcsx_rearmed');
      expect(highSettings.pcsx_rearmed_drc).toBe('enabled');

      const ultraSettings = getPSXSettingsForTier('ultra');
      expect(ultraSettings.retroarch_core).toBe('pcsx_rearmed');
      expect(ultraSettings.pcsx_rearmed_drc).toBe('enabled');
    });

    it('uses pcsx_rearmed for every PS1 tier', () => {
      const psx = getSystemById('psx');
      expect(psx?.tierSettings?.low?.retroarch_core).toBe('pcsx_rearmed');
      expect(psx?.tierSettings?.medium?.retroarch_core).toBe('pcsx_rearmed');
      expect(psx?.tierSettings?.high?.retroarch_core).toBe('pcsx_rearmed');
      expect(psx?.tierSettings?.ultra?.retroarch_core).toBe('pcsx_rearmed');
    });

    it('getPSXSettingsForTier has pcsx_rearmed_ options, not beetle_psx_hw_ options', () => {
      const tiers = ['low', 'medium', 'high', 'ultra'] as const;
      for (const tier of tiers) {
        const settings = getPSXSettingsForTier(tier);
        expect(settings.pcsx_rearmed_drc).toBe('enabled');
        expect(settings.beetle_psx_hw_renderer).toBeUndefined();
      }
    });

    it('omits Beetle Lightrec dynarec settings on high and ultra tiers', () => {
      const psx = getSystemById('psx');
      expect(psx?.tierSettings?.high?.beetle_psx_hw_cpu_dynarec).toBeUndefined();
      expect(psx?.tierSettings?.ultra?.beetle_psx_hw_cpu_dynarec).toBeUndefined();
      // low/medium use pcsx_rearmed DRC instead
      expect(psx?.tierSettings?.low?.pcsx_rearmed_drc).toBe('enabled');
      expect(psx?.tierSettings?.medium?.pcsx_rearmed_drc).toBe('enabled');
    });

    it('omits Beetle PGXP settings on high and ultra tiers', () => {
      const psx = getSystemById('psx');
      expect(psx?.tierSettings?.high?.beetle_psx_hw_pgxp_mode).toBeUndefined();
      expect(psx?.tierSettings?.ultra?.beetle_psx_hw_pgxp_mode).toBeUndefined();
    });

    it('omits Beetle GTE overclock settings on high and ultra tiers', () => {
      const psx = getSystemById('psx');
      expect(psx?.tierSettings?.high?.beetle_psx_hw_gte_overclock).toBeUndefined();
      expect(psx?.tierSettings?.ultra?.beetle_psx_hw_gte_overclock).toBeUndefined();
      // PCSX ReARMed has no beetle_psx_hw_ GTE key.
      expect(psx?.tierSettings?.low?.beetle_psx_hw_gte_overclock).toBeUndefined();
      expect(psx?.tierSettings?.medium?.beetle_psx_hw_gte_overclock).toBeUndefined();
    });

    it('omits Beetle analog calibration on high and ultra tiers', () => {
      const psx = getSystemById('psx');
      expect(psx?.tierSettings?.high?.beetle_psx_hw_analog_calibration).toBeUndefined();
      expect(psx?.tierSettings?.ultra?.beetle_psx_hw_analog_calibration).toBeUndefined();
      // PCSX ReARMed has no beetle_psx_hw_ analog key.
      expect(psx?.tierSettings?.low?.beetle_psx_hw_analog_calibration).toBeUndefined();
      expect(psx?.tierSettings?.medium?.beetle_psx_hw_analog_calibration).toBeUndefined();
    });
  });

  // ── getN3DSSettingsForTier ──────────────────────────────────────────────

  describe('getN3DSSettingsForTier', () => {
    it('returns tier settings for 3DS low tier', () => {
      const settings = getN3DSSettingsForTier('low');
      expect(settings.retroarch_core).toBe('azahar');
      expect(settings.citra_resolution_factor).toBe('1x (Native)');
      expect(settings.citra_use_cpu_jit).toBe('enabled');
    });

    it('returns tier settings for 3DS ultra tier', () => {
      const settings = getN3DSSettingsForTier('ultra');
      expect(settings.citra_resolution_factor).toBe('3x');
      expect(settings.citra_use_acc_mul).toBe('enabled');
    });

    it('returns a deep copy (mutations do not affect the original)', () => {
      const settings = getN3DSSettingsForTier('low');
      settings.citra_resolution_factor = '10x';
      const fresh = getN3DSSettingsForTier('low');
      expect(fresh.citra_resolution_factor).toBe('1x (Native)');
    });
  });

  // ── getNDSSettingsForTier ───────────────────────────────────────────────

  describe('getNDSSettingsForTier', () => {
    it('returns tier settings for NDS low tier', () => {
      const settings = getNDSSettingsForTier('low');
      expect(settings.retroarch_core).toBe('desmume2015');
      expect(settings.desmume_num_cores).toBe('1');
      expect(settings.desmume_frameskip).toBe('2');
      expect(settings.desmume_cpu_mode).toBe('jit');
      expect(settings.desmume_pointer_type).toBe('touch');
      expect(settings.desmume_color_depth).toBe('16-bit');
    });

    it('returns tier settings for NDS ultra tier', () => {
      const settings = getNDSSettingsForTier('ultra');
      expect(settings.retroarch_core).toBe('desmume2015');
      expect(settings.desmume_internal_resolution).toBe('1024x768');
      expect(settings.desmume_cpu_mode).toBe('jit');
      expect(settings.desmume_num_cores).toBe('2');
      expect(settings.desmume_color_depth).toBe('32-bit');
    });

    it('high tier enables advanced timing and OpenGL', () => {
      const settings = getNDSSettingsForTier('high');
      expect(settings.desmume_advanced_timing).toBe('enabled');
      expect(settings.desmume_opengl_mode).toBe('enabled');
      expect(settings.desmume_color_depth).toBe('32-bit');
      expect(settings.desmume_mic_mode).toBe('internal');
    });

    it('returns a deep copy (mutations do not affect the original)', () => {
      const settings = getNDSSettingsForTier('low');
      settings.desmume_frameskip = '999';

      const fresh = getNDSSettingsForTier('low');
      expect(fresh.desmume_frameskip).toBe('2');
    });
  });

  // ── getPSPSettingsForTier ───────────────────────────────────────────────

  describe('getPSPSettingsForTier', () => {
    it('returns a deep copy (mutations do not affect the original)', () => {
      const settings = getPSPSettingsForTier('low');
      settings.ppsspp_internal_resolution = '999';

      const fresh = getPSPSettingsForTier('low');
      expect(fresh.ppsspp_internal_resolution).toBe('1');
    });
  });

  // ── is3D flag ───────────────────────────────────────────────────────────────

  describe('is3D system flag', () => {
    it('marks PSP as a 3D system', () => {
      expect(getSystemById('psp')?.is3D).toBe(true);
    });

    it('marks N64 as a 3D system', () => {
      expect(getSystemById('n64')?.is3D).toBe(true);
    });

    it('marks PS1 as a 3D system', () => {
      expect(getSystemById('psx')?.is3D).toBe(true);
    });

    it('marks Sega Saturn as a 3D system', () => {
      expect(getSystemById('segaSaturn')?.is3D).toBe(true);
    });

    it('marks Dreamcast as a 3D system', () => {
      expect(getSystemById('segaDC')?.is3D).toBe(true);
    });

    it('does not mark NES as a 3D system', () => {
      expect(getSystemById('nes')?.is3D).toBeFalsy();
    });

    it('does not mark SNES as a 3D system', () => {
      expect(getSystemById('snes')?.is3D).toBeFalsy();
    });

    it('does not mark GBA as a 3D system', () => {
      expect(getSystemById('gba')?.is3D).toBeFalsy();
    });

    it('does not mark Game Boy Color as a 3D system', () => {
      expect(getSystemById('gbc')?.is3D).toBeFalsy();
    });

    it('marks NDS as a 3D system (DS hardware includes a dedicated 3D rendering engine)', () => {
      expect(getSystemById('nds')?.is3D).toBe(true);
    });
  });



  describe('Game Boy (GB) core settings', () => {
    it('detects .gb files as the Game Boy system', () => {
      const detected = detectSystem('tetris.gb');
      expect(Array.isArray(detected)).toBe(false);
      expect(detected && !Array.isArray(detected) ? detected.id : null).toBe('gb');
    });

    it('uses DMG hardware mode on the low tier for authentic monochrome experience', () => {
      const settings = getGBSettingsForTier('low');
      expect(settings['retroarch_core']).toBe('gambatte');
      expect(settings['gambatte_gb_hwmode']).toBe('GB');
      expect(settings['gambatte_gb_colorization']).toBe('disabled');
    });

    it('switches to GBC hardware mode on medium+ tiers to enable built-in colour palettes', () => {
      const medium = getGBSettingsForTier('medium');
      const high   = getGBSettingsForTier('high');
      const ultra  = getGBSettingsForTier('ultra');
      expect(medium['retroarch_core']).toBe('gambatte');
      expect(high['retroarch_core']).toBe('gambatte');
      expect(ultra['retroarch_core']).toBe('gambatte');
      expect(medium['gambatte_gb_hwmode']).toBe('GBC');
      expect(high['gambatte_gb_hwmode']).toBe('GBC');
      expect(ultra['gambatte_gb_hwmode']).toBe('GBC');
    });

    it('enables internal GBC colour palettes on medium+ tiers', () => {
      const medium = getGBSettingsForTier('medium');
      expect(medium['gambatte_gb_colorization']).toBe('internal');
    });

    it('enables mix_frames LCD ghosting on high and ultra tiers', () => {
      const low    = getGBSettingsForTier('low');
      const medium = getGBSettingsForTier('medium');
      const high   = getGBSettingsForTier('high');
      const ultra  = getGBSettingsForTier('ultra');
      expect(low['gambatte_mix_frames']).toBe('disabled');
      expect(medium['gambatte_mix_frames']).toBe('disabled');
      expect(high['gambatte_mix_frames']).toBe('mix');
      expect(ultra['gambatte_mix_frames']).toBe('mix');
    });

    it('applies dark_filter_level 10 only on ultra tier', () => {
      expect(getGBSettingsForTier('low')['gambatte_dark_filter_level']).toBe('0');
      expect(getGBSettingsForTier('high')['gambatte_dark_filter_level']).toBe('0');
      expect(getGBSettingsForTier('ultra')['gambatte_dark_filter_level']).toBe('10');
    });

    it('GB system uses GB_TIER_SETTINGS via getSystemById', () => {
      const gb = getSystemById('gb');
      expect(gb?.tierSettings?.low?.['gambatte_gb_hwmode']).toBe('GB');
      expect(gb?.tierSettings?.high?.['gambatte_gb_hwmode']).toBe('GBC');
    });
  });

  describe('Game Boy Color (GBC) core settings', () => {
    it('detects .gbc files as the Game Boy Color system', () => {
      const detected = detectSystem('pokemon_crystal.gbc');
      expect(Array.isArray(detected)).toBe(false);
      expect(detected && !Array.isArray(detected) ? detected.id : null).toBe('gbc');
    });

    it('always uses GBC hardware mode on all tiers', () => {
      const tiers = (['low', 'medium', 'high', 'ultra'] as const);
      for (const tier of tiers) {
        expect(getGBCSettingsForTier(tier)['retroarch_core']).toBe('gambatte');
        expect(getGBCSettingsForTier(tier)['gambatte_gb_hwmode']).toBe('GBC');
      }
    });

    it('does not apply GB colorisation keys — native GBC games are already full colour', () => {
      for (const tier of ['low', 'medium', 'high', 'ultra'] as const) {
        const settings = getGBCSettingsForTier(tier);
        expect(settings['gambatte_gb_colorization']).toBeUndefined();
        expect(settings['gambatte_gb_internal_palette']).toBeUndefined();
      }
    });

    it('enables mix_frames LCD ghosting on high and ultra tiers', () => {
      expect(getGBCSettingsForTier('low')['gambatte_mix_frames']).toBe('disabled');
      expect(getGBCSettingsForTier('medium')['gambatte_mix_frames']).toBe('disabled');
      expect(getGBCSettingsForTier('high')['gambatte_mix_frames']).toBe('mix');
      expect(getGBCSettingsForTier('ultra')['gambatte_mix_frames']).toBe('mix');
    });

    it('applies dark_filter_level 10 only on ultra tier', () => {
      expect(getGBCSettingsForTier('low')['gambatte_dark_filter_level']).toBe('0');
      expect(getGBCSettingsForTier('high')['gambatte_dark_filter_level']).toBe('0');
      expect(getGBCSettingsForTier('ultra')['gambatte_dark_filter_level']).toBe('10');
    });

    it('GBC system uses GBC_TIER_SETTINGS via getSystemById', () => {
      const gbc = getSystemById('gbc');
      // All tiers should use GBC hardware mode, not GB
      expect(gbc?.tierSettings?.low?.['gambatte_gb_hwmode']).toBe('GBC');
      expect(gbc?.tierSettings?.high?.['gambatte_gb_hwmode']).toBe('GBC');
      // Colorization keys must not appear for native GBC games
      expect(gbc?.tierSettings?.low?.['gambatte_gb_colorization']).toBeUndefined();
    });
  });
});
