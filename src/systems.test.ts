import { describe, expect, it } from 'vitest';
import { detectSystem, getSystemById } from './systems';

describe('systems performance profiles', () => {
  it('detects Nintendo DS files', () => {
    const detected = detectSystem('mario.nds');
    expect(Array.isArray(detected)).toBe(false);
    expect(detected && !Array.isArray(detected) ? detected.id : null).toBe('nds');
  });

  it('provides tier settings for PSP, NDS and N64', () => {
    const psp = getSystemById('psp');
    const nds = getSystemById('nds');
    const n64 = getSystemById('n64');

    expect(psp?.tierSettings?.low?.ppsspp_internal_resolution).toBe('1');
    expect(nds?.tierSettings?.low?.desmume_frameskip).toBe('2');
    expect(nds?.tierSettings?.ultra?.desmume_internal_resolution).toBe('1024x768');
    expect(n64?.tierSettings?.low?.['mupen64plus-rdp-plugin']).toBe('rice');
    expect(n64?.tierSettings?.ultra?.['mupen64plus-resolution-factor']).toBe('3');
  });
});
