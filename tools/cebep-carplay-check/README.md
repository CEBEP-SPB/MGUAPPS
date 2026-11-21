# cebep-carplay-check - why Maps on cluster cannot patch CarPlay

A diagnostic for [mgu Store](https://github.com/robertnisipeanu/mgu-store). **It writes nothing.**

## When to use it

Maps on cluster 0.11.0+ shows CarPlay **Status: Failed** or **Changed by another tool**,
Patch does not help, the cluster map is gone. Usual cause: an older tool (for example
`cluster-yandex-safearea-fix`) left bytes of its own in `/usr/bin/carplay`, and Maps on
cluster patches in memory only over the shipped file.

## How to use it

1. Add this repository as a source, channel Branch.
2. Open **CarPlay file check (CEBEP)** and press Install.
3. The install is **refused on purpose**. The red error text is the result. Take a photo of it.

Nothing is installed and nothing on the head unit is changed.

## What the result says

- `OK: ... is the shipped file` - the file is fine, the cause is elsewhere.
- `NOT shipped. Differs: ... REPAIRABLE` - only known places differ; with the shipped values
  back the file is the shipped one (same SHA-256).
- `NOT repairable from the table` - other bytes differ too.

Over SSH the same check: `node check.js status`.

GPL-3.0-or-later. The shipped values are those of Maps on cluster's own table.
