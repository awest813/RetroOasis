# LANemu Integration Notes

## Overview
LANemu is a virtual LAN backend that allows players to join the same virtual network without complex manual configuration. RetroOasis uses it to facilitate Ad Hoc and LAN multiplayer for supported emulators (like PPSSPP).

## Requirements
- **Java / OpenJDK**: Version 17 or newer is recommended.
- **LANemu.jar**: The executable JAR file.
- **Access Files**: `.dat` files that contain room connection information.

## Ports
- **LANemu Signalling**: Default `2103`.
- **Game Ports**: Varies by emulator (PPSSPP uses `27312`).

## Permissions
- Creating a virtual network adapter may require administrator/root permissions on some systems.
- RetroOasis will prompt the user to run as admin if adapter creation fails.

## Process
1. Detect Java.
2. Launch `java -jar Lanemu.jar --headless`.
3. Detect the virtual IP (usually in the `10.6.x.x` range).
4. Load room access file.
5. Launch emulator pointing to the host's virtual IP.
