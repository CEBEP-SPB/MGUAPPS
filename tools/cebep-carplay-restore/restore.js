#!/usr/bin/env node
// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 CEBEP SPB
/* restore.js - put the shipped safe-area bytes back into /usr/bin/carplay.
 *
 * One case only. The old tool cluster-yandex-safearea-fix edited the two
 * safe-area immediates of carplay 22.28.3 and its removal can leave values of
 * its own there. Maps on cluster 0.11.0+ then refuses to patch ("carplay was
 * modified by something else") and no button fixes it, because none of its
 * own edits is in the file.
 *
 * What activate does, in this order, stopping at the first "no":
 *   1. the build must be in the table below (by GNU build-id);
 *   2. the file must differ from the shipped one ONLY at res-safe1 / res-safe2;
 *   3. the file with the shipped 16 bytes there must have the shipped SHA-256;
 *   4. Maps on cluster's remount lock must be free and / mounted read-only;
 *   5. / is remounted read-write, the verified image is written with Maps on
 *      cluster's own file_mode.js (a temp file renamed over carplay, owner and
 *      mode kept), read back and its SHA-256 checked, / remounted read-only.
 * Nothing else is ever written. A file that is already the shipped one is
 * left alone. The running CarPlay keeps the old file until the next start.
 *
 * The shipped bytes and SHA-256 are Maps on cluster's own table
 * (waze-on-cluster carplay_patch.js, PROVEN), GPL-3.0-or-later.
 *
 *   restore.js activate     check, and repair when every check passes
 *   restore.js status       check only (read-only)
 *   restore.js deactivate   nothing to undo, exit 0
 *
 * Node 8, no dependencies. All output is ASCII.
 */
'use strict';

var fs = require('fs');
var path = require('path');
var crypto = require('crypto');

var WOC = process.env.CEBEP_WOC_DIR || '/var/opt/waze-on-cluster/current';
var TARGET = process.env.CEBEP_CARPLAY || '/usr/bin/carplay';
var MOUNT = process.env.CEBEP_MOUNT || '/bin/mount';
var PROC_MOUNTS = process.env.CEBEP_PROC_MOUNTS || '/proc/mounts';
var SINK_STOCK = 'avb://media_transport.avb_streaming.15?mime_type=video/H264';
var REPAIRS = ['res-safe1', 'res-safe2'];   /* the only sites this tool may write */

function latin1(s) { return Buffer.from(s, 'latin1').toString('hex'); }
function sha256(b) { return crypto.createHash('sha256').update(b).digest('hex'); }
function say(s) { process.stdout.write(s + '\n'); }
function finish(obj, code) { process.stdout.write(JSON.stringify(obj) + '\n'); process.exit(code); }

var PROVEN = {
    '5de62156575d737391ea42254e778a97dbbb51f8': {
        version: 'carplay 22.28.3',
        sha256: process.env.CEBEP_TEST_SHA || 'ddb33e33161387c6479c391684b3d019b0de54ecfcee8d6877eca94aa62f3e50',
        stock: [['variant', 0x2ba4f0, 'ecf2f7ff'], ['sink', 0x2a20b0, latin1(SINK_STOCK)], ['selfstart', 0x18176c, 'e8effdffff'],
                ['res-mm', 0x20ca32, 'ea0000006e000000'], ['res-px', 0x20ca54, '8007000084030000'],
                ['res-safe1', 0x20ca66, '0000000064020000'], ['res-safe2', 0x20ca74, '0e0200000202c000'],
                ['mapurl-text', 0x257838, latin1('Head-Unit does not support Alternate Displays feature.\0')], ['mapurl-code', 0x7b533, '488d3559922100'],
                ['showui-text', 0x2908a0, latin1('mCinemoCarPlay->ShowUI( ::carplay::CarPlayConstantsRepository::a')], ['showui-code', 0x18188a, 'e851cd07004c89e7488b30']],
    },
};

/* Read-only. { err } or { shipped: true, p } or { p, buf, sum, out, diff: [names] } where
 * out is buf with the shipped bytes at REPAIRS and has the shipped SHA-256. */
function analyse() {
    var buf, locator;
    try { buf = fs.readFileSync(TARGET); } catch (e) { return { err: 'cannot read ' + TARGET + ': ' + e.message }; }
    try { locator = require(path.join(WOC, 'carplay_locate.js')); } catch (e) { return { err: 'Maps on cluster 0.11.0+ not found (' + WOC + ')' }; }
    var id = null;
    try { id = locator.buildId(buf); } catch (e) {}
    var p = id && PROVEN[id];
    if (!p) return { err: 'this CarPlay build (' + (id || 'no build-id') + ') is not in the table - not touching it' };
    var sum = sha256(buf);
    if (sum === p.sha256) return { shipped: true, p: p };
    var out = Buffer.from(buf), diff = [];
    p.stock.forEach(function (s) {
        var want = Buffer.from(s[2], 'hex');
        if (s[1] + want.length > buf.length || !buf.slice(s[1], s[1] + want.length).equals(want)) diff.push(s[0]);
        if (REPAIRS.indexOf(s[0]) >= 0 && s[1] + want.length <= out.length) want.copy(out, s[1]);
    });
    var other = diff.filter(function (n) { return REPAIRS.indexOf(n) < 0; });
    if (other.length) return { err: p.version + ' differs at ' + diff.join(', ') + ': more than the safe area - not touching it' };
    if (!diff.length) return { err: p.version + ' is not the shipped file, but the safe area is the shipped one: the difference is elsewhere - not touching it' };
    if (sha256(out) !== p.sha256) return { err: p.version + ': with the shipped safe area back the sha256 is still wrong - other bytes differ, not touching it' };
    return { p: p, buf: buf, sum: sum, out: out, diff: diff };
}

function rootState() {
    try {
        var lines = fs.readFileSync(PROC_MOUNTS, 'utf8').split('\n'), opts = null;
        for (var i = 0; i < lines.length; i++) { var f = lines[i].split(' '); if (f[1] === '/') opts = f[3]; }
        if (opts !== null) return /(^|,)ro(,|$)/.test(opts) ? 'ro' : 'rw';
    } catch (e) {}
    return null;
}
function remount(mode) {
    var r = require('child_process').spawnSync(MOUNT, ['-o', 'remount,' + mode, '/'], { timeout: 15000 });
    return !r.error && r.status === 0;
}
function sleepMs(ms) { var end = Date.now() + ms; while (Date.now() < end) {} }

var NEXT = 'Restart the head unit, then Maps on cluster - CarPlay - Patch';

function activate() {
    var a = analyse();
    if (a.err) { finish({ status: 'NOT REPAIRED, nothing was changed: ' + a.err }, 1); return; }
    if (a.shipped) { finish({ status: a.p.version + ' is already the shipped file, nothing to repair. ' + NEXT }, 0); return; }
    var fileMode, lock;
    try { fileMode = require(path.join(WOC, 'file_mode.js')); lock = require(path.join(WOC, 'remount_lock.js')); } catch (e) {
        finish({ status: 'NOT REPAIRED, nothing was changed: Maps on cluster\'s writer modules not found (' + e.message + ')' }, 1); return;
    }
    if (rootState() !== 'ro') { finish({ status: 'NOT REPAIRED, nothing was changed: / is not mounted read-only right now (another tool may be writing) - restart the head unit and try again' }, 1); return; }
    if (!lock.tryAcquire()) { finish({ status: 'NOT REPAIRED, nothing was changed: another tool holds the remount lock - restart the head unit and try again' }, 1); return; }
    var result = null, code = 1, madeRw = false;
    try {
        if (!remount('rw')) { result = 'NOT REPAIRED, nothing was changed: could not remount / read-write'; return; }
        madeRw = true;
        /* The file must still be the one that was analysed. */
        if (sha256(fs.readFileSync(TARGET)) !== a.sum) { result = 'NOT REPAIRED, nothing was changed: ' + TARGET + ' changed while checking'; return; }
        var want = fileMode.wanted(TARGET, null, fileMode.EXEC);
        fileMode.replace(TARGET, a.out, want, true);
        var now = sha256(fs.readFileSync(TARGET));
        if (now !== a.p.sha256) { result = 'WRITE CHECK FAILED: ' + TARGET + ' reads sha256 ' + now + ' after the write, shipped is ' + a.p.sha256 + '. Do not restart; send this text'; return; }
        result = 'REPAIRED: ' + a.p.version + ' is the shipped file again (sha256 verified, ' + a.diff.join(' + ') + ' put back). ' + NEXT;
        code = 0;
    } catch (e) {
        var after = null;
        try { after = sha256(fs.readFileSync(TARGET)); } catch (e2) {}
        result = (after === a.sum ? 'NOT REPAIRED, the file is as it was: ' : after === a.p.sha256 ? 'REPAIRED with a warning (the file is the shipped one): ' : 'WRITE FAILED, file state unknown - do not restart, send this text: ') + e.message;
        if (after === a.p.sha256) code = 0;
    } finally {
        if (madeRw) {
            var ro = false;
            for (var i = 0; i < 4 && !ro; i++) { if (i) sleepMs(500); remount('ro'); ro = rootState() === 'ro'; }
            if (!ro) say('WARNING: / is still read-write after remount; the next head-unit start mounts it read-only again');
        }
        try { lock.release(); } catch (e3) {}
        finish(code === 0 ? { status: result, reboot: 'CarPlay file restored; restart the head unit' } : { status: result }, code);
    }
}

function main() {
    var cmd = process.argv[2] || 'status';
    if (cmd === 'deactivate') { finish({ status: 'nothing to undo' }, 0); return; }
    if (cmd === 'activate') { activate(); return; }
    var a = analyse();
    say(a.err ? 'would not repair: ' + a.err : a.shipped ? a.p.version + ' is the shipped file' : 'would repair: ' + a.diff.join(' + ') + ' of ' + a.p.version);
    process.exit(0);
}

if (require.main === module) main();
