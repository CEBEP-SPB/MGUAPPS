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
| [CarPlay file check](tools/cebep-carplay-check) | Diagnostic, writes nothing: tells why Maps on cluster shows CarPlay as Failed / Changed by another tool | Maps on cluster 0.11.0+ |
| [CarPlay file repair](tools/cebep-carplay-restore) | One-time repair after the old Yandex fix: puts the shipped safe-area bytes back into the CarPlay file, only when the result is the shipped file by SHA-256 | Maps on cluster 0.11.0+, CarPlay 22.28.3, a REPAIRABLE answer from the check |

### Yandex map fix

For cars where the cluster map already works through **Maps on cluster** (`robertnisipeanu/idrive-apps`) 0.11.0 or newer, and Yandex Navigator sits left of the centre.

1. **Patch** was pressed on the CarPlay tab of the Maps on cluster app, the map shows on the cluster.
2. Install the tool from this source.
3. Restart the head unit.

Good to know:

- the zone is one for all CarPlay navigation apps - after moving it for Yandex, guidance in Apple Maps and Waze may be misplaced;
- the **Patch** button in the Maps on cluster app puts the default zone back; to restore yours, reinstall the tool and restart the head unit;
- removing the tool puts the default zone back;
- carplay on the system partition is not modified, nothing runs at boot;
- if the old `cluster-yandex-safearea-fix` is installed and cannot be removed, this tool leaves an empty backup record for it so the Store can remove it.

Details, your own zone and checks are in the [tool description](tools/cebep-map-zone/README.md).

### Map gone after updating Maps on cluster to 0.11.0

If the old `cluster-yandex-safearea-fix` was ever installed, Maps on cluster 0.11.0 may show CarPlay as
**Failed** or **Changed by another tool**, and Patch does not help. The way out, all from this source:

1. Remove the old `cluster-yandex-safearea-fix` in the Store.
2. Install **CarPlay file check (CEBEP)**. It refuses on purpose; the red text is the result.
3. If the text says `REPAIRABLE` with `res-safe1` / `res-safe2`: install **CarPlay file repair (CEBEP)**, restart the head unit.
4. Maps on cluster - CarPlay - **Patch**, restart. The map is back.
5. Install **Yandex map fix (CEBEP)**, restart. Remove CarPlay file repair.

**Status (2026-11-21), all three run on cars:** Yandex map fix 0.2.3 - working. CarPlay file check 0.1.0 and CarPlay file repair 0.1.0 - used on a car where the old `cluster-yandex-safearea-fix` had left its zone in the CarPlay file: check said REPAIRABLE, repair restored the shipped file, Patch worked again, the cluster map came back.

## Disclaimer

Everything here is unofficial, not affiliated with BMW. Use at your own risk. Open source, GPL-3.0-or-later.
