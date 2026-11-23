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

### Yandex map fix

> **After install: restart the head unit once. After pressing Patch in Maps on cluster: restart TWICE, a couple of minutes apart - the zone comes back by itself, do not reinstall.**

For cars where the cluster map already works through **Maps on cluster** (`robertnisipeanu/idrive-apps`) 0.11.0 or newer, and Yandex Navigator sits left of the centre.

1. The map shows on the cluster (Maps on cluster 0.14.2+ patches CarPlay by itself; on older versions press **Patch** on the CarPlay tab of its app).
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

**Status (2026-11-23):** Yandex map fix - working on a car with Maps on cluster 0.14.9, including the zone coming back by itself after Patch (two restarts).

`tools/cebep-carplay-check` (read-only diagnostic) and `tools/cebep-carplay-restore` (one-time repair of the CarPlay file after the old fix) are kept in the repository but not listed in the Store: Maps on cluster 0.14.7+ handles that case by itself. They are for use over SSH on a car where the map tool cannot be updated.

The Store shows the tool's description in Russian on head units set to Russian (the `texts.ru` entry in `mgu-repo.json`) and in English everywhere else. The tool's own messages are English.

## Disclaimer

Everything here is unofficial, not affiliated with BMW. Use at your own risk. Open source, GPL-3.0-or-later.
