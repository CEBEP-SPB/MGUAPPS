# MGUAPPS - mgu Store source by CEBEP SPB

Add-ons for [mgu Store](https://github.com/robertnisipeanu/mgu-store) on BMW MGU head units (iDrive 7).

## How to add it in the car

In the Store app on the head unit: **Sources -> add**, type

```
CEBEP-SPB/MGUAPPS
```

and pick the **Branch** channel (branch `main`). The head unit needs internet.

## What is here

| Tool | What it does | Needs |
|---|---|---|
| [Yandex map fix](tools/cebep-map-zone) | Puts Yandex Navigator in the middle of the instrument cluster by moving the CarPlay map zone | Maps on cluster 0.11.0+ |
| [CarPlay file repair](tools/cebep-carplay-restore) | One-time repair after the old Yandex fix: puts the shipped safe-area bytes back into the CarPlay file, only when the result is the shipped file by SHA-256 | Maps on cluster 0.11.0+, CarPlay 22.28.3 |

### Yandex map fix

For cars where the cluster map already works through **Maps on cluster** (`robertnisipeanu/idrive-apps`) 0.11.0 or newer, and Yandex Navigator sits left of the centre.

1. **Patch** was pressed on the CarPlay tab of the Maps on cluster app, the map shows on the cluster.
2. Install the tool from this source.
3. Restart the head unit.

Good to know:

- the zone is one for all CarPlay navigation apps - after moving it for Yandex, guidance in Apple Maps and Waze may be misplaced;
- removing the tool puts the default zone back;
- the **Patch** button no longer needs a reinstall: since 0.3.0 the tool puts its zone back by itself after the next head-unit start (restart twice after Patch);
- carplay on the system partition is not modified; one short background check runs a minute after each head-unit start;
- if the old `cluster-yandex-safearea-fix` is installed and cannot be removed, this tool leaves an empty backup record for it so the Store can remove it.

Details, your own zone and checks are in the [tool description](tools/cebep-map-zone/README.md).

### Map gone after updating Maps on cluster (CarPlay: Failed / Changed by another tool)

Happens on cars where the old `cluster-yandex-safearea-fix` was installed: it left its map zone in the CarPlay file.

1. Remove the old `cluster-yandex-safearea-fix` in the Store.
2. Update **Maps on cluster to 0.14.7 or newer** and restart the head unit. Since that version it handles the leftover by itself, the map comes back.
3. Install **Yandex map fix (CEBEP)**, restart.

Only where Maps on cluster cannot be updated: install **CarPlay file repair (CEBEP)** after step 1, restart, press Patch in Maps on cluster, restart. It refuses with the reason and changes nothing if the car is not in that state.

**Status (2026-11-23):** Yandex map fix 0.3.0 - working on a car with Maps on cluster 0.14.9, including the zone coming back by itself after Patch (two restarts). CarPlay file repair - worked on a car on 2026-11-21; since Maps on cluster 0.14.7 it is needed only where the map tool cannot be updated.

`tools/cebep-carplay-check` is a read-only diagnostic kept in the repository but not listed in the Store: over SSH, `node check.js status` tells which bytes of the CarPlay file differ from the shipped build.

## Disclaimer

Everything here is unofficial, not affiliated with BMW. Use at your own risk. Open source, GPL-3.0-or-later.
