# Profile System Plan

RetroOasis currently stores credentials and cloud configuration in several separate
browser locations. This document describes the planned **profile system** that
unifies them into named, portable bundles.

## Goals

1. **One-tap switching** between household members or devices (e.g. "Personal" vs "Kids").
2. **Portable backup** of API keys, cloud library sources, OAuth app IDs, and related settings.
3. **No server required** — profiles remain local-first; export/import uses JSON files.
4. **Clear security model** — users understand that profiles contain secrets.

## What a profile contains (v1 snapshot)

| Domain | Current storage | In profile v1 |
|--------|-----------------|---------------|
| Cloud library connections | `Settings.cloudLibraries` | Yes |
| Cover-art / metadata API keys | `retro-oasis.apiKeys` localStorage | Yes |
| Google / Dropbox OAuth app IDs | `cloudAuth` localStorage keys | Yes |
| Save sync provider choice | `CloudSaveManager` + per-provider keys | Metadata only (reconnect required) |
| Netplay username, libretro matching URL | `Settings` | Subset yes |
| ROM blobs, save states, play history | IndexedDB | No (too large; out of scope) |
| Performance / display preferences | `Settings` | Planned v2 |

The initial implementation ships **export / import** and **multi-profile switching** in
Settings → Cloud Library → Profiles. Import supports **new profile** and **merge into active**.

## Architecture (planned)

```
┌─────────────────────────────────────────────────────────┐
│  ProfileManager (singleton)                              │
│  - activeProfileId                                       │
│  - listProfiles(): ProfileMeta[]                         │
│  - switchProfile(id): apply patches + reconnect hooks    │
│  - exportProfile(id): ProfileSnapshotV1                  │
│  - importProfile(blob): validate + merge/replace         │
└───────────────┬─────────────────────────────────────────┘
                │
    ┌───────────┼───────────┬──────────────────┐
    ▼           ▼           ▼                  ▼
 Settings   ApiKeyStore  CloudSaveManager   oauthPopup
```

### Storage layout (shipped)

- `retro-oasis.profiles` — JSON index: `{ version, activeId, profiles: { [id]: { meta, snapshot } } }`
- Snapshots are embedded in the index (plaintext); optional per-key split storage deferred
- Active runtime state mirrors into existing stores on switch; auto-save debounces settings, API keys, and save-sync changes

### Switch flow

1. User selects profile B in Settings.
2. `ProfileManager` serializes current profile A (optional auto-save).
3. Applies profile B snapshot to Settings, ApiKeyStore, OAuth IDs.
4. Dispatches `profile-changed` event; UI rebuilds cloud tabs and Connections.
5. Save sync shows "Reconnect" if provider metadata differs from live connection.

## Security considerations

- **Plaintext JSON export** is the v1 default; file should be treated like a password manager backup.
- **Optional passphrase encryption** (Web Crypto AES-GCM) planned for v1.1 using a user-derived key.
- Never upload profiles to RetroOasis servers; export stays on the user's machine.
- Import validates schema version and sanitizes provider IDs before apply.

## Implementation phases

### Phase 1 (shipped in this branch)

- [x] `ProfileSnapshotV1` schema in `src/profileSnapshot.ts`
- [x] Export / import UI in Cloud Library settings
- [x] Documentation (this file)

### Phase 2 (shipped in this branch)

- [x] `ProfileManager` with named slots in localStorage
- [x] Active profile indicator in header
- [x] Auto-save on settings change (debounced)
- [x] Include save-sync credential blobs in snapshot (plaintext; encryption option deferred)

### Phase 3

- [ ] QR / share link for profile transfer (encrypted payload only)
- [ ] Sync profiles via user's own cloud save folder (opt-in)
- [ ] Per-profile library filter (show only games tagged to profile)

## API sketch (phase 2)

```typescript
interface ProfileMeta {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  color?: string;
}

class ProfileManager {
  getActive(): ProfileMeta | null;
  list(): ProfileMeta[];
  create(name: string): ProfileMeta;
  switchTo(id: string): Promise<void>;
  delete(id: string): void;
  export(id: string): ProfileSnapshotV1;
  importSnapshotAsNewProfile(snapshot): ProfileMeta;
  importSnapshotIntoActive(snapshot): void;
}
```

## Testing strategy

- Unit tests for `parseProfileSnapshot`, `applyProfileSnapshot`, round-trip export.
- UI tests: export button produces downloadable JSON; import applies `cloudLibraries` count.
- Manual: import on second browser profile, verify Connections tab and Cloud Library sources.

## Open questions

1. Should switching profiles clear the visible game library or only cloud-indexed entries?
2. Should kids' profiles hide Connections / Cloud Library settings?
3. Default encryption off vs on for exports?
