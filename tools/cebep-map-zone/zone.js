#!/usr/bin/env node
// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 CEBEP SPB
/* zone.js - cluster map zone for Yandex Navigator, for Maps on cluster
 * (waze-on-cluster) 0.11.0 and newer.
 *
 * Since 0.11.0 Maps on cluster does not edit /usr/bin/carplay: it keeps a
 * "plan" of edits (/var/opt/waze-on-cluster/inmem-carplay.plan) and applies it
 * to CarPlay in memory at every start. The plan is made by its own generator,
 * which has a regular --safe WxH+X+Y option. This tool does one thing: it asks
 * that generator (inmem.makePlan) to make the plan again with the same
 * arguments plus --safe. Every check (CarPlay build, coding, edit sites,
 * checksums) stays with Maps on cluster; it puts the new plan on trial itself.
 *
 *   zone.js activate     install / update: write the zone into the plan
 *   zone.js deactivate   removal: put the default zone back. Never blocks removal.
 *   zone.js status       show what the plan holds now (read-only)
 *
 * Nothing runs at boot. Takes effect at the next head-unit start.
 *
 * One exception to "nothing is written to the system partition": when the old
 * third-party tool cluster-yandex-safearea-fix is installed and has lost its
 * backup record, the Store cannot remove it (its removal hook exits 1 with
 * "no backup ... nothing to revert"). activate then leaves an empty backup
 * record next to carplay (a ~100 byte JSON, carplay itself is not touched) so
 * that the old tool can be removed in the Store; its own removal deletes the
 * record again. See helpOldFix().
 *
 * Node 8, no dependencies. All output is ASCII.
 */
'use strict';

var fs = require('fs');
var path = require('path');

var WOC = process.env.CEBEP_WOC_DIR || '/var/opt/waze-on-cluster/current';
var SHIPPED_CONF = path.join(__dirname, 'zone.conf');
var LOCAL_CONF = process.env.CEBEP_ZONE_LOCAL || '/var/opt/cebep-map-zone/zone.local.conf';
var FRAME = { w: 1088, h: 480 };
var DEFAULT_SAFE = '504x368+456+72';

function say(line) { process.stdout.write('zone: ' + line + '\n'); }
function finish(result, code) { process.stdout.write(JSON.stringify(result) + '\n'); process.exit(code); }

/* "504x368+456+72" -> the same string when the format and bounds are fine, else null. */
function checkSafe(text) {
    var m = /^\s*(\d+)x(\d+)\+(\d+)\+(\d+)\s*$/.exec(text || '');
    if (!m) return null;
    var w = +m[1], h = +m[2], x = +m[3], y = +m[4];
    if (w < 16 || h < 16 || x + w > FRAME.w || y + h > FRAME.h) return null;
    return w + 'x' + h + '+' + x + '+' + y;
}

function confSafe(file) {
    var text;
    try { text = fs.readFileSync(file, 'utf8'); } catch (e) { return null; }
    var lines = text.split('\n'), found = null;
    for (var i = 0; i < lines.length; i++) {
        var m = /^\s*safe\s*=\s*(\S+)\s*$/.exec(lines[i]);
        if (m) found = m[1];
    }
    return found;
}

/* Which zone to set and where it came from. A bad line in the local file does
 * not fail silently: it is reported and the next source is used. */
function wantedSafe() {
    var local = confSafe(LOCAL_CONF);
    if (local !== null) {
        var okLocal = checkSafe(local);
        if (okLocal) return { safe: okLocal, from: LOCAL_CONF };
        say('zone "' + local + '" in ' + LOCAL_CONF + ' is not valid (need WxH+X+Y inside ' + FRAME.w + 'x' + FRAME.h + ') - using the shipped zone');
    }
    var shipped = checkSafe(confSafe(SHIPPED_CONF));
    if (shipped) return { safe: shipped, from: 'zone.conf' };
    return { safe: DEFAULT_SAFE, from: 'built-in' };
}

/* The plan arguments without --safe and its value. */
function stripSafe(args) {
    var out = [];
    for (var i = 0; i < args.length; i++) {
        if (args[i] === '--safe') { i++; continue; }
        out.push(args[i]);
    }
    return out;
}
function argOf(args, name) {
    var i = args.indexOf(name);
    return i >= 0 && i + 1 < args.length ? args[i + 1] : null;
}

/* Maps on cluster's modules on the unit. An error text when it is missing or older than 0.11.0. */
function loadWoc() {
    var inmem;
    try { inmem = require(path.join(WOC, 'inmem.js')); }
    catch (e) { return { err: 'Maps on cluster 0.11.0 or newer not found (' + path.join(WOC, 'inmem.js') + '): install or update it in the Store' }; }
    if (!inmem || typeof inmem.makePlan !== 'function' || typeof inmem.readRecord !== 'function')
        return { err: 'this Maps on cluster version has a different plan mechanism - this tool does not support it' };
    return { inmem: inmem };
}

/* What is recorded about the CarPlay plan and whether its zone can be changed. */
function inspect(inmem) {
    var rec = inmem.readRecord('carplay');
    if (!rec) return { err: 'Maps on cluster has no CarPlay patch plan: open the Maps on cluster app, CarPlay tab, press Patch, restart the head unit and install this tool again' };
    if (rec.needsPlan) return { err: 'Maps on cluster could not make its plan (' + (rec.error || 'no reason recorded') + '): fix the map first with Patch in its app' };
    if (rec.enabled !== true) return { err: 'the CarPlay patch is disabled in Maps on cluster' + (rec.by ? ' (' + rec.by + ')' : '') + ': enable it with Patch in the map app' };
    if (!Array.isArray(rec.args)) return { err: 'the plan record has no arguments - this tool does not support this Maps on cluster version' };
    var panel = argOf(rec.args, '--panel');
    if (panel !== 'high') return { err: 'the map patch is in panel ' + (panel || '?') + ' mode: the zone exists only in panel high mode' };
    if (argOf(rec.args, '--res') === 'stock') return { err: 'the map patch uses the stock resolution (--res stock): there is no zone in this mode' };
    return { rec: rec, safe: argOf(rec.args, '--safe') };
}

/* The boot-recovery failure count belongs to the previous plan; the new one
 * starts clean. A failure here does not matter, it is only a counter. */
function resetRecovery() {
    try {
        var rec = require(path.join(WOC, 'recovery.js'));
        new rec.Recovery({ target: rec.TARGETS.carplay }).resetCount();
    } catch (e) { say('boot-recovery counter not reset (' + e.message + ') - harmless'); }
}

/* ---- the old third-party tool cluster-yandex-safearea-fix -------------------
 * It patched /usr/bin/carplay on disk and kept a backup record beside it. Maps
 * on cluster 0.11.0 put carplay back to stock, and on many units the record is
 * gone - then the old tool's removal hook dies with "no backup ... nothing to
 * revert" and the Store refuses to remove it. With a record that lists no
 * regions the same hook has nothing to write, reports "already reverted",
 * deletes the record and exits 0.
 *
 * So: only when the old tool is installed AND its record is missing AND Maps
 * on cluster has a working in-memory plan (so carplay on disk is stock and the
 * old tool has nothing left to undo), write that empty record. / is read-only on the unit, so it is remounted read-write
 * for this one small file and read-only again, under Maps on cluster's remount
 * lock when it is there. carplay itself is never opened for writing. Any
 * failure here is reported and ignored: it must not fail the zone. */
var OLD_FIX_DIR = process.env.CEBEP_OLD_FIX_DIR || '/var/opt/cluster-yandex-safearea-fix';
var CARPLAY = process.env.CEBEP_CARPLAY || '/usr/bin/carplay';
var OLD_BACKUP = CARPLAY + '.woc-safearea.json';
var MOUNT = process.env.CEBEP_MOUNT || '/bin/mount';
var PROC_MOUNTS = process.env.CEBEP_PROC_MOUNTS || '/proc/mounts';

function oldFixInstalled() { try { return fs.statSync(OLD_FIX_DIR).isDirectory(); } catch (e) { return false; } }
function rootState() {
    try {
        var lines = fs.readFileSync(PROC_MOUNTS, 'utf8').split('\n'), opts = null;
        for (var i = 0; i < lines.length; i++) { var p = lines[i].split(' '); if (p[1] === '/') opts = p[3]; }
        if (opts !== null) return /(^|,)ro(,|$)/.test(opts) ? 'ro' : 'rw';
    } catch (e) {}
    return null;
}
function remount(mode) {
    var cp = require('child_process');
    var r = cp.spawnSync(MOUNT, ['-o', 'remount,' + mode, '/'], { timeout: 15000 });
    return !r.error && r.status === 0;
}
function sleepMs(ms) { var end = Date.now() + ms; while (Date.now() < end) {} }
function helpOldFix() {
    var lock = null, locked = false, madeRw = false;
    try {
        if (!oldFixInstalled()) return;
        if (fs.existsSync(OLD_BACKUP)) { say('old cluster-yandex-safearea-fix is installed and has a backup record - not touching it'); return; }
        if (!fs.existsSync(CARPLAY)) { say('old cluster-yandex-safearea-fix is installed, but ' + CARPLAY + ' is not there - leaving it alone'); return; }
        var state = rootState();
        if (state === null) { say('old cluster-yandex-safearea-fix: cannot tell whether / is read-only - not writing its backup record'); return; }
        try { lock = require(path.join(WOC, 'remount_lock.js')); locked = lock.tryAcquire(); } catch (e) { lock = null; }
        if (lock && !locked) { say('old cluster-yandex-safearea-fix: another tool is writing to / right now - backup record not written, install this tool again later'); return; }
        if (state === 'ro') {
            if (!remount('rw')) { say('old cluster-yandex-safearea-fix: could not remount / read-write - backup record not written'); return; }
            madeRw = true;
        }
        var body = JSON.stringify({ buildId: 'none', binaryId: 'none', savedAt: new Date().toISOString(), by: 'cebep-map-zone', regions: {} }, null, 2) + '\n';
        var fd = fs.openSync(OLD_BACKUP, 'wx', 0o600);
        try { fs.writeSync(fd, body); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
        say('old cluster-yandex-safearea-fix had no backup record: wrote an empty one (' + OLD_BACKUP + '), it can be removed in the Store now');
    } catch (e) {
        say('old cluster-yandex-safearea-fix: backup record not written (' + e.message + ') - harmless for the zone');
    } finally {
        if (madeRw) {
            var ro = false;
            for (var i = 0; i < 4 && !ro; i++) { if (i) sleepMs(500); remount('ro'); ro = rootState() === 'ro'; }
            if (!ro) say('WARNING: / is still read-write after remount; the next head-unit start mounts it read-only again');
        }
        if (lock && locked) { try { lock.release(); } catch (e) {} }
    }
}

/* Read-only: whether /usr/bin/carplay is the 22.28.3 build that differs from
 * the shipped file only in the 16 safe-area bytes (what the old fix's removal
 * leaves there) - the case CarPlay file repair (CEBEP) mends. The shipped bytes
 * and SHA-256 are Maps on cluster's own (carplay_patch.js, PROVEN). Any doubt
 * reads as "no". */
var CP_BUILD = '5de62156575d737391ea42254e778a97dbbb51f8';
var CP_SHA = process.env.CEBEP_TEST_SHA || 'ddb33e33161387c6479c391684b3d019b0de54ecfcee8d6877eca94aa62f3e50';
var CP_SAFE = [[0x20ca66, '0000000064020000'], [0x20ca74, '0e0200000202c000']];
function leftoverZone() {
    try {
        var crypto = require('crypto');
        var buf = fs.readFileSync(CARPLAY);
        if (require(path.join(WOC, 'carplay_locate.js')).buildId(buf) !== CP_BUILD) return false;
        if (crypto.createHash('sha256').update(buf).digest('hex') === CP_SHA) return false;
        var out = Buffer.from(buf);
        CP_SAFE.forEach(function (s) { Buffer.from(s[1], 'hex').copy(out, s[0]); });
        return !out.equals(buf) && crypto.createHash('sha256').update(out).digest('hex') === CP_SHA;
    } catch (e) { return false; }
}

function replan(inmem, args, cb) {
    try { inmem.makePlan('carplay', args, 90000, function (err, rec) { cb(err || null, rec); }); }
    catch (e) { cb(e); }
}

function activate() {
    var woc = loadWoc();
    if (woc.err) { finish({ status: 'zone not written: ' + woc.err }, 1); return; }
    var now = inspect(woc.inmem);
    if (now.err) {
        /* No working in-memory plan while the old fix is installed usually means
         * carplay on disk still carries an earlier disk patch plus the old fix's
         * edit, which Maps on cluster reports as changed by another tool. The old
         * fix must undo its own edit first, with its own backup. */
        var hint = oldFixInstalled() ? '. The old cluster-yandex-safearea-fix is installed: if the Maps on cluster app shows CarPlay as changed by another tool, remove the old fix in the Store first, then press Patch' : '';
        /* Read-only look at the file: the old fix's zone left in carplay is the
         * usual reason Maps on cluster has no plan. This tool never writes
         * carplay; it names the tool that does. */
        if (leftoverZone()) {
            finish({ status: 'zone not written: the CarPlay file still holds the map zone of the old cluster-yandex-safearea-fix, so Maps on cluster cannot patch. ' +
                (oldFixInstalled() ? 'Remove the old cluster-yandex-safearea-fix in the Store, then install ' : 'Install ') +
                'CarPlay file repair (CEBEP) from this source, restart the head unit, press Patch in the Maps on cluster app, restart, and install this tool again' }, 1);
            return;
        }
        finish({ status: 'zone not written: ' + now.err + hint }, 1); return;
    }
    /* Only now: a working in-memory plan means carplay on disk is stock, so an
     * empty backup record cannot hide an edit the old fix still has to undo. */
    helpOldFix();
    var want = wantedSafe();
    say('wanted zone ' + want.safe + ' (' + want.from + '), in the plan now: ' + (now.safe || 'default'));
    if (now.safe === want.safe) { finish({ status: 'zone ' + want.safe + ' is already in the map plan' }, 0); return; }
    var args = stripSafe(now.rec.args).concat(['--safe', want.safe]);
    replan(woc.inmem, args, function (err) {
        /* On failure Maps on cluster's previous plan stays as it was: the
         * generator writes the new one to a temp file and swaps only a finished one. */
        if (err) { finish({ status: 'zone not written, the map plan is unchanged: ' + err.message }, 1); return; }
        resetRecovery();
        finish({ status: 'zone ' + want.safe + ' written into the map plan',
                 reboot: 'cluster map zone ' + want.safe + ' takes effect at the next head-unit start' }, 0);
    });
}

/* Removal: put the default zone back. Whatever happens it exits 0: a tool that
 * cannot be removed is worse than a leftover zone (Patch in the map app
 * resets it). */
function deactivate() {
    var woc = loadWoc();
    if (woc.err) { finish({ status: 'nothing to restore: ' + woc.err }, 0); return; }
    var rec = null;
    try { rec = woc.inmem.readRecord('carplay'); } catch (e) {}
    if (!rec || !Array.isArray(rec.args) || rec.args.indexOf('--safe') < 0) {
        finish({ status: 'nothing to restore: the map plan has the default zone' }, 0); return;
    }
    if (rec.needsPlan || rec.enabled !== true) {
        finish({ status: 'the map plan is not active now; Patch in the Maps on cluster app restores the default zone' }, 0); return;
    }
    replan(woc.inmem, stripSafe(rec.args), function (err) {
        if (err) {
            finish({ status: 'could not restore the default zone (' + err.message + '); the tool is removed anyway, Patch in the Maps on cluster app resets the zone' }, 0);
            return;
        }
        resetRecovery();
        finish({ status: 'default zone restored in the map plan',
                 reboot: 'default cluster map zone takes effect at the next head-unit start' }, 0);
    });
}

function status() {
    var woc = loadWoc();
    if (woc.err) { say(woc.err); process.exit(0); }
    if (leftoverZone()) say('CarPlay file: still holds the old fix\'s map zone - install CarPlay file repair (CEBEP)');
    var rec = woc.inmem.readRecord('carplay'), want = wantedSafe();
    say('wanted zone: ' + want.safe + ' (' + want.from + ')');
    if (!rec) { say('no CarPlay patch plan'); process.exit(0); }
    say('plan: ' + (rec.needsPlan ? 'not made (' + (rec.error || '?') + ')' : rec.enabled === true ? 'enabled' : 'disabled' + (rec.by ? ' (' + rec.by + ')' : '')) +
        (rec.trial ? ', on trial' : rec.proven ? ', proven' : ''));
    say('plan arguments: ' + (Array.isArray(rec.args) ? rec.args.join(' ') : '?'));
    say('zone in the plan: ' + ((Array.isArray(rec.args) && argOf(rec.args, '--safe')) || 'default'));
    say('old cluster-yandex-safearea-fix: ' + (!oldFixInstalled() ? 'not installed' : 'installed, backup record ' + (fs.existsSync(OLD_BACKUP) ? 'present' : 'missing') + ' - remove it in the Store'));
    process.exit(0);
}

function main() {
    var cmd = process.argv[2];
    if (cmd === 'activate') activate();
    else if (cmd === 'deactivate') deactivate();
    else if (cmd === 'status') status();
    else { process.stderr.write('usage: zone.js activate|deactivate|status\n'); process.exit(2); }
}
if (require.main === module) main();
else module.exports = { checkSafe: checkSafe, stripSafe: stripSafe, argOf: argOf };
