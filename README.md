# MGUAPPS - mgu Store source by CEBEP SPB

Add-ons for [mgu Store](https://github.com/robertnisipeanu/mgu-store) on BMW MGU head units (iDrive 7).

**Where the car stands depends on the phone too.** With the same zone and the same Yandex Navigator version
some iPhones put the car up to 2 cm right of centre, with or without route guidance; others are exactly
centred. The tool cannot see or change that. Checked 2026-11-24 with one iPhone on a G02, a G20 and a G05:
centred on all three (Yandex map fix 0.5.1, zone 504x368+456+72). A car can get its own zone in
`/var/opt/cebep-map-zone/zone.local.conf` (see the tool's README).

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
>
> **Maps on cluster will show CarPlay as "Update needed". That is normal with this tool: do not press Patch.**

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

### The old cluster-yandex-safearea-fix: how to remove it without losing the map

The old fix does nothing with Maps on cluster 0.11.0+ and should be removed. **Removing it can leave its own map zone in the CarPlay file**; Maps on cluster then shows CarPlay as **Not patched** (older versions: Failed / Changed by another tool) and the cluster shows BMW's own map instead of the phone's. Seen on two cars. The way through, with Maps on cluster 0.14.7 or newer:

1. In the Store remove the tool `cluster-yandex-safearea-fix` itself (in the installed list). Removing only its source does not remove the tool.
2. Restart the head unit.
3. Wait a couple of minutes: Yandex map fix 0.4.0+ sees that the plan no longer fits the CarPlay file and makes it again with its zone. (Without the fix, or with an older one: open Maps on cluster - CarPlay and press **Patch**, restart, wait, restart.)
4. Restart again: the phone's map is back on the cluster, Yandex in the middle. After this restart the map may take about a minute to appear.

The Patch-button way was checked on a car on 2026-11-23 (Maps on cluster 0.14.10, Yandex map fix 0.3.1). Yandex map fix 0.4.0 ran on the same car the same day: the zone stays, and comes back after Patch in two restarts. Its automatic re-plan after the old fix's removal is bench-tested; no car with the old fix has run it yet.

`tools/cebep-carplay-check` (read-only diagnostic) and `tools/cebep-carplay-restore` (one-time repair of the CarPlay file after the old fix) are kept in the repository but not listed in the Store: Maps on cluster 0.14.7+ handles that case by itself. They are for use over SSH on a car where the map tool cannot be updated.

The Store shows the tool's description in Russian on head units set to Russian (the `texts.ru` entry in `mgu-repo.json`) and in English everywhere else. The tool's own messages are English.

## Disclaimer

Everything here is unofficial, not affiliated with BMW. Use at your own risk. Open source, GPL-3.0-or-later.
