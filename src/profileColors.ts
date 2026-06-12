/** Preset accent colors for distinguishing household profiles in the UI. */
export const PROFILE_COLOR_PRESETS = [
  "#5b8def",
  "#34c759",
  "#ff9f0a",
  "#ff375f",
  "#bf5af2",
  "#64d2ff",
  "#a2845e",
] as const;

export type ProfileColor = (typeof PROFILE_COLOR_PRESETS)[number];

export function pickDefaultProfileColor(index: number): ProfileColor {
  return PROFILE_COLOR_PRESETS[((index % PROFILE_COLOR_PRESETS.length) + PROFILE_COLOR_PRESETS.length) % PROFILE_COLOR_PRESETS.length]!;
}

export function isValidProfileColor(value: string): value is ProfileColor {
  return (PROFILE_COLOR_PRESETS as readonly string[]).includes(value);
}
