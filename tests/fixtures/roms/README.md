Test ROM Fixtures
=================

This directory contains legally distributable ROM fixtures used by automated tests.

- `TOBUNES.NES` is an open-source homebrew NES ROM supplied for RetroOasis testing.
  - Size: 40,976 bytes
  - SHA-256: `33415EC4015ED8AB76BBD0692C8ECB8BD9A10F1E987696E592F1F0DC40E60CE1`
  - Header: iNES (`NES\x1A`)
- `synthetic_psx_test.cue` and `synthetic_psx_test.bin` are synthetic blank PSX
  MODE2/2352 disc-image fixtures for file parsing, UI loading, and virtual
  CD-ROM mount tests. They do not contain an ISO 9660 filesystem, `SYSTEM.CNF`,
  or executable boot payload.
  - Size: 42,336 bytes
  - Sectors: 18 MODE2/2352 sectors
  - SHA-256: `4E45F5E96EC9422E53D433460BE7BC3A37F78ADE0699608304E4F985411D0390`

Keep these files small and only add ROMs with explicit permission or an open-source/homebrew license.
