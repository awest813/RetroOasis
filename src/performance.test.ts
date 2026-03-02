import { describe, expect, it, vi, afterEach } from 'vitest';
import { detectCapabilities, resolveMode, DeviceCapabilities } from './performance';

describe('performance', () => {
  describe('resolveMode', () => {
    const mockCaps = (recommendedMode: "performance" | "quality"): DeviceCapabilities => ({
      deviceMemoryGB: 8,
      cpuCores: 4,
      gpuRenderer: 'mock',
      isSoftwareGPU: false,
      isLowSpec: false,
      recommendedMode,
      tier: 'medium',
      gpuCaps: {
        renderer: 'mock',
        vendor: 'mock',
        maxTextureSize: 4096,
        maxVertexAttribs: 16,
        maxVaryingVectors: 16,
        maxRenderbufferSize: 4096,
        anisotropicFiltering: false,
        maxAnisotropy: 0,
        floatTextures: false,
        instancedArrays: false,
        webgl2: false,
      },
      gpuBenchmarkScore: 50,
    });

    it('returns recommendedMode when userMode is auto', () => {
      expect(resolveMode('auto', mockCaps('performance'))).toBe('performance');
      expect(resolveMode('auto', mockCaps('quality'))).toBe('quality');
    });

    it('overrides recommendedMode when userMode is performance', () => {
      expect(resolveMode('performance', mockCaps('quality'))).toBe('performance');
      expect(resolveMode('performance', mockCaps('performance'))).toBe('performance');
    });

    it('overrides recommendedMode when userMode is quality', () => {
      expect(resolveMode('quality', mockCaps('performance'))).toBe('quality');
      expect(resolveMode('quality', mockCaps('quality'))).toBe('quality');
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('handles WebGL renderer exception gracefully', () => {
    // Mock document.createElement to throw when creating a canvas
    const originalCreateElement = document.createElement.bind(document);
    vi.spyOn(document, 'createElement').mockImplementation((tagName: string, options?: ElementCreationOptions) => {
      if (tagName === 'canvas') {
        throw new Error('Canvas not supported');
      }
      return originalCreateElement(tagName, options);
    });

    const caps = detectCapabilities();

    expect(caps.gpuRenderer).toBe('unknown');
  });
});
