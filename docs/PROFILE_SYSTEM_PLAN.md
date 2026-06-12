# Profile System

RetroOasis stores credentials and cloud configuration in several separate browser
locations. The **profile system** unifies them into named, portable bundles.

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
| Save sync provider choice | `CloudSaveManager` + per-provider keys | Metadata + credential blobs (`cloudSaveStorage`); auto-connect on switch |
| Netplay username, libretro matching URL | `Settings` | Subset yes |
| ROM blobs, save states, play history | IndexedDB | No (too large; out of scope) |
| Performance / display preferences | `Settings` | Yes (`settingsSubset.displayPrefs`) |
| Library game tags (filter) | `retro-oasis.profile.gameTags` | Yes (`libraryGameIds` per profile slot) |

Shipped in **Settings → Cloud Library → Profiles**. Import supports **new profile** and **merge into active**.

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│  ProfileManager (singleton)                              │
│  - activeProfileId                                       │
│  - listProfiles(): ProfileMeta[]                         │
│  - switchProfile(id): apply patches + reconnect hooks    │
│  - exportProfileSnapshot(id): ProfileSnapshotV1          │
│  - importProfileIndexRaw / importSnapshot*               │
└───────────────┬─────────────────────────────────────────┘
                │
    ┌───────────┼───────────┬──────────────────┐
    ▼           ▼           ▼                  ▼
 Settings   ApiKeyStore  CloudSaveManager   oauthPopup
```

### Storage layout

- `retro-oasis.profiles` — JSON index: `{ version, activeId, profiles: { [id]: { meta, snapshot } } }`
- Snapshots are embedded in the index (plaintext); entries are normalized on load and cloud import
- Active runtime state mirrors into existing stores on switch; auto-save debounces settings, API keys, and save-sync changes

### Switch flow

1. User selects profile B in Settings.
2. `ProfileManager` saves current profile A (flush debounced auto-save on cloud upload).
3. Applies profile B snapshot to Settings, ApiKeyStore, OAuth IDs.
4. Dispatches `profile-changed` event; UI rebuilds cloud tabs, library filter toggle, and header chip.
5. Restores save-sync credential blobs and attempts auto-connect.
6. Applies `displayPrefs` from the snapshot, or baseline defaults when absent (prevents volume/UI bleed).

## Security considerations

- **Plaintext JSON export** — treat like a password manager backup.
- **Optional passphrase encryption** (PBKDF2 + AES-GCM, `.retroprofile` files).
- **Never upload to RetroOasis servers** — export stays on the user's machine.
- **Save-sync profile backup** uploads the full local index (API keys, OAuth IDs, credential blobs) to the user's own WebDAV/GDrive/Dropbox folder **in plaintext**. Only use on storage you trust.
- Import validates schema version; cloud libraries, API keys, and display prefs are sanitized before apply.
- Encrypted imports cap PBKDF2 iterations and base64 field sizes; share codes cap decompressed size.

## Shipped features

- Multi-profile slots, header chip, accent colors, debounced auto-save
- Export JSON / encrypted `.retroprofile`, merge or new-slot import
- Encrypted share codes (`ro-profile:v1:`) + QR render/scan
- Cloud index backup via save sync (WebDAV, Nextcloud, Google Drive, Dropbox)
- Per-profile library filter with game tags on local, cloud, and multi-disc import
- Header profile chip with quick-switch menu (when multiple profiles exist)

## API (current)

```typescript
interface ProfileMeta {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  color?: string;
}

// ProfileManager highlights
getActiveProfileId(): string;
listProfiles(): ProfileMeta[];
createProfile(name, deps): ProfileMeta | string;
switchProfile(id, deps): Promise<true | false | string>; // string = persist error message
deleteProfile(id, deps?): boolean | string;
exportProfileSnapshot(id, deps?): ProfileSnapshotV1 | null;
exportProfileIndexForCloud(deps): { ok: true; raw } | { ok: false; error };
importSnapshotAsNewProfile(snapshot, deps): ProfileMeta | string;
importSnapshotIntoActive(snapshot, deps): string | null;
importProfileIndexRaw(raw, "replace" | "merge", deps?): string | null;
flushAutoSave(deps): string | null; // null = success, string = error
```

### Cloud index merge semantics

**Merge** adds remote slots with new IDs and replaces existing slots when the remote copy has a newer `updatedAt`. Library game tags for updated slots are synced exactly from embedded `libraryGameIds`; orphan tag lists are pruned.
**Replace** overwrites the entire local index with the remote copy and replaces all library tag lists from embedded snapshots.

Cloud upload calls `exportProfileIndexForCloud` so every slot's embedded `libraryGameIds` reflects live tag storage before upload.

## Library filter semantics

- Game tags are stored globally in `retro-oasis.profile.gameTags` and also embedded per slot as `libraryGameIds` in snapshots (export/import/cloud sync).
- When **Filter library to active profile** is enabled, the library shows games tagged to the active profile plus any untagged games (shared household library).
- Games are tagged on import: local file import, cloud ROM import, and multi-disc/M3U flows.

## Testing strategy

- Unit tests: `profileSnapshot`, `profileManager`, `profileCrypto`, `profileShare`, `profileGameTags`, `profileCloudSync`, `profileDisplayPrefs`, `profileQr`
- Manual: switch profiles during gameplay; upload/download cloud index; share-code transfer between devices

## Open questions

1. Should kids' profiles hide Connections / Cloud Library settings?
2. Default encryption off vs on for exports?
3. ~~Should cloud index backup optionally encrypt the uploaded index?~~ **Shipped:** optional passphrase encryption toggle in Profiles → Cloud backup.
