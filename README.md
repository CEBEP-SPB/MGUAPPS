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
| [YANDEX MAP FIX](tools/cebep-map-zone) | Puts Yandex Navigator in the middle of the instrument cluster by moving the CarPlay map zone | Maps on cluster 0.11.0+ |

### YANDEX MAP FIX

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

**Status: test version 0.2.1.** The logic is tested on a bench against the plan module of Maps on cluster 0.11.0; not yet proven on cars.

## Disclaimer

Everything here is unofficial, not affiliated with BMW. Use at your own risk. Open source, GPL-3.0-or-later.
