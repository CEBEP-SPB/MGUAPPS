# cebep-carplay-restore - shipped safe area back into the CarPlay file

A one-time repair for [mgu Store](https://github.com/robertnisipeanu/mgu-store). **It writes to
`/usr/bin/carplay`** - read this page first. Used on a car on 2026-11-21: the file was restored,
Patch worked again and the cluster map came back.

## The one case it is for

- Maps on cluster 0.11.0+ shows CarPlay **Failed** / **Changed by another tool**, its log says
  `carplay was modified by something else`;
- the old `cluster-yandex-safearea-fix` was installed on this car;
- **Yandex map fix (CEBEP)** refused to install and named this tool.

If the car is not in this state, the tool refuses with the reason and changes nothing.

## What it does

1. Reads the file; the build must be CarPlay 22.28.3 (by build-id).
2. The file may differ from the shipped one **only** in the 16 safe-area bytes.
3. With the shipped 16 bytes back, the whole file must have the shipped SHA-256.
4. Only then: opens the system partition for writing, replaces the file the same way Maps on
   cluster does (its own writer module: temp file, owner and mode kept, rename), reads it back,
   checks the SHA-256 again, closes the partition.

Any "no" on the way: it refuses with the reason and changes nothing. A file that is already
the shipped one is left alone.

## Steps

1. Install **CarPlay file repair (CEBEP)**. Success: installed, the Store asks for a restart.
   Refusal: red text with the reason - send a photo of it.
2. Restart the head unit.
3. Maps on cluster - CarPlay - **Patch**. Restart again when asked. The cluster map is back.
4. Remove this tool in the Store (it has nothing more to do). Removal changes nothing.
5. For Yandex Navigator in the middle of the cluster: install **Yandex map fix (CEBEP)**.

To confirm the result: Patch in Maps on cluster works again. Over SSH, `node restore.js status` says
`... is the shipped file`.

GPL-3.0-or-later. The shipped values are those of Maps on cluster's own table.
