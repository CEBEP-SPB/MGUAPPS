# cebep-map-zone - cluster map zone for Yandex Navigator

> ## RESTARTS
> **After install: restart the head unit once.**
> **After pressing Patch in Maps on cluster: restart TWICE, a couple of minutes apart.**
> The zone comes back by itself. Do not reinstall the tool.

A tool for [mgu Store](https://github.com/robertnisipeanu/mgu-store), an add-on to
**Maps on cluster** (waze-on-cluster, `robertnisipeanu/idrive-apps`) **0.11.0 and newer**.

## Why

CarPlay gets one "safe area" from the head unit for every navigation app. Maps on
cluster's default zone (`504x368+286+72`) suits Apple Maps; with it Yandex Navigator
puts the car left of the middle of the instrument cluster. This tool moves the zone
for Yandex.

The zone is one for all CarPlay apps: what suits Yandex may misplace guidance in
Apple Maps and Waze. Install it if Yandex is what you want on the cluster.

## How it works

Since 0.11.0 Maps on cluster does not edit `/usr/bin/carplay`: it keeps a plan of
edits and applies it to CarPlay in memory at start. The plan is made by its own
generator, which has a regular `--safe` option. This tool does one thing: it asks
that generator to make the plan again with the same arguments plus `--safe <zone>`.

- `/usr/bin/carplay` is not modified;
- one short background check a minute after each head-unit start (see "What resets the zone"); nothing waits for it;
- every check (CarPlay build, coding, edit sites) stays with Maps on cluster;
- Maps on cluster puts the new plan on trial itself and disables it if CarPlay crashes with it.

## Install

1. Maps on cluster 0.11.0+ is installed and the map shows on the cluster (before 0.14.2 press **Patch** on the CarPlay tab of its app; newer versions patch by themselves).
2. Add this repository as a source in the Store, channel: Branch.
3. Install **Yandex map fix**. Restart the head unit.

If the tool cannot write the zone, the install fails with the reason (map not
patched, patch disabled, `panel mid` mode) - it never stays "installed but not working".

## Your own zone

Default is `504x368+456+72` (WxH+X+Y inside the 1088x480 frame). Car left of centre - make X bigger.

Put your zone into `/var/opt/cebep-map-zone/zone.local.conf`:

```
safe=504x368+433+72
```

then reinstall the tool in the Store and restart the head unit.

## What resets the zone

- The **Patch** button in the Maps on cluster app makes a plan with the default zone. Since 0.3.0 this
  tool puts its zone back by itself: a minute after the next head-unit start a background check sees the
  default zone and writes yours again. So after pressing Patch: restart twice (the first start applies
  the map patch and the check runs, the second start has your zone). Nothing to reinstall.
- A Maps on cluster update keeps the zone.
- A patch you removed with **Remove patch**, or one Maps on cluster turned off by itself, is left alone:
  the check never turns a patch on.

Since 0.4.0 the same check also notices a plan that no longer fits the CarPlay file - what happens
after the old `cluster-yandex-safearea-fix` is removed, when Maps on cluster shows **Not patched** - and
makes the plan again by itself, with your zone. Pressing Patch is then not needed: restart, wait a
couple of minutes, restart.

To go back to the default zone for good, remove this tool.

The check writes nothing outside `/var/opt`, never blocks CarPlay's start, and gives up after three
failed attempts in a row (install the tool again to retry). Its output: `journalctl -u cebep-map-zone`.

The Maps on cluster app will show that the zone differs from the default and offer Patch - that is expected.

## The old cluster-yandex-safearea-fix

The older third-party tool `usharafiev/cluster-yandex-safearea-fix` patched carplay
on disk. It does nothing with Maps on cluster 0.11.0+, and on many units the Store
cannot remove it: its removal fails with
`no backup at /usr/bin/carplay.woc-safearea.json; nothing to revert`.

When this tool is installed, the map plan in memory is working, and it sees the old
one **without** that backup record, it writes an empty record (`/usr/bin/carplay.woc-safearea.json`, about 100 bytes; the
system partition is opened for writing only for this file and closed again; carplay
itself is not touched). After that the old tool can be removed in the Store the
normal way, and its own removal deletes the record.

If the map is gone after updating Maps on cluster to 0.11.0 (CarPlay **Failed** in its app): the old
fix left its map zone in the CarPlay file. This tool sees that (it only reads the file) and says so:
update Maps on cluster to **0.14.7 or newer**, press **Patch** on the CarPlay tab of its app and restart.
Then install this tool again.

If the Maps on cluster app shows CarPlay as **changed by another tool** and this tool
refuses with `no CarPlay patch plan`: carplay on disk still carries the old fix's edit.
Remove the old fix in the Store first (it undoes its own edit), then press Patch in the
Maps on cluster app, restart, and install this tool.

This tool does not remove the old one itself. The two do not fight on 0.11.0+, but
there is no reason to keep both.

## Check and removal

See what the plan holds now (read-only):

```
node /var/opt/cebep-map-zone/current/zone.js status
```

Removing the tool in the Store puts the default zone back. Removal is never blocked:
if the zone could not be restored, the tool is removed anyway and Patch resets the zone.

## Limits

- iDrive 7 only, Maps on cluster 0.11.0+ only. It does not install on 0.10.x and older;
- if Maps on cluster changes its patch mechanism again, the tool refuses with a clear reason instead of breaking the map.

GPL-3.0-or-later.
