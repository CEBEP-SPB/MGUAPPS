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
 *   zone.js ensure       the boot check: put the zone back when Patch reset it
 *
 * The zone depends on the car: the same cluster shows the map frame at another
 * place on a 3 Series than on an X4. The body comes from the head unit's own
 * coding image (/dev/shm/rawcodingdata, CAFD HU_MGU 3002 BAUREIHE - the image
 * Maps on cluster reads the cluster variant from; read-only here), and
 * zone.conf lists the zone of each body. See bodyOf().
 *
 * cebep-map-zone.service runs `ensure` once, a minute after each head-unit
 * start, in the background. Takes effect at the next head-unit start.
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
var SHIPPED_CONF = process.env.CEBEP_ZONE_CONF || path.join(__dirname, 'zone.conf');
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

/* The car's body from the head unit's coding image, the one CodingShmApp
 * publishes and Maps on cluster reads KI_KOMBI_VARIANT from: flags at 0x28
 * (both of 0x09 set once the coding is there), payload from 0x2c; CAFD HU_MGU
 * block 3002 starts 0x12d into the payload and its byte 0x1b is BAUREIHE.
 * Checked against E-Sys on a G06 (0x24). Read-only.
 * -> { code, name } or { err }. An unknown code has name ''. */
var CODING = process.env.CEBEP_CODING || '/dev/shm/rawcodingdata';
var BODY_OFF = 0x2c + 0x12d + 0x1b;
var BODY = {
    0x05: 'G01LCI', 0x08: 'G02LCI', 0x09: 'G08LCI', 0x13: 'G08BEV', 0x18: 'G08BEVLCI', 0x20: 'G26BEV', 0x21: 'G11',
    0x22: 'G12', 0x23: 'G05', 0x24: 'G06', 0x25: 'G07', 0x26: 'G14', 0x27: 'G15', 0x28: 'G16', 0x29: 'G07LCI',
    0x2a: 'G20', 0x2b: 'G21', 0x2c: 'G22', 0x2d: 'G23', 0x2e: 'G24', 0x2f: 'G26', 0x30: 'G30', 0x31: 'G31',
    0x32: 'G38', 0x33: 'G32', 0x34: 'G30LCI', 0x35: 'G31LCI', 0x36: 'G32LCI', 0x37: 'G38LCI', 0x38: 'F90LCI',
    0x39: 'F97LCI', 0x3a: 'G28', 0x3b: 'G29', 0x3c: 'J29', 0x3d: 'F98LCI', 0x3e: 'G82', 0x47: 'G09', 0x48: 'G18',
    0x49: 'G20LCI', 0x4a: 'G83', 0x50: 'G21LCI', 0x51: 'G28BEV', 0x53: 'G28LCI', 0x58: 'G81', 0x59: 'G87',
    0x5b: 'F95', 0x5c: 'F96', 0x5d: 'G80', 0x65: 'G01', 0x66: 'G02', 0x67: 'G08', 0x6a: 'F93', 0x7b: 'G42',
    0x88: 'F97', 0x89: 'F98'
};
function bodyOf() {
    var buf;
    try { buf = fs.readFileSync(CODING); } catch (e) { return { err: 'the head unit coding cannot be read (' + (e.code || e.message) + ')' }; }
    if (buf.length <= BODY_OFF) return { err: 'the head unit coding image is too short (' + buf.length + ' bytes)' };
    if ((buf[0x28] & 0x09) !== 0x09) return { err: 'the head unit coding is not published yet' };
    var code = buf[BODY_OFF];
    return { code: code, name: BODY[code] || '' };
}
function hex(n) { return '0x' + (n < 16 ? '0' : '') + n.toString(16); }

/* The zone zone.conf lists for a body: a line  safe[G20 G21 ...]=WxH+X+Y. */
function bodySafe(name) {
    if (!name) return null;
    var text;
    try { text = fs.readFileSync(SHIPPED_CONF, 'utf8'); } catch (e) { return null; }
    var lines = text.split('\n'), found = null;
    for (var i = 0; i < lines.length; i++) {
        var m = /^\s*safe\[([A-Za-z0-9 ,]+)\]\s*=\s*(\S+)\s*$/.exec(lines[i]);
        if (m && m[1].split(/[ ,]+/).indexOf(name) >= 0) found = m[2];
    }
    return checkSafe(found);
}

/* Which zone to set and where it came from: the owner's own zone, else the
 * zone of this car's body, else the common one. A bad line in the local file
 * does not fail silently: it is reported and the next source is used.
 * `unsure` is set when the body could not be read and nothing else decided the
 * zone: the boot check then leaves the plan alone instead of writing the
 * common zone over a body's own one. */
function wantedSafe() {
    var local = confSafe(LOCAL_CONF);
    if (local !== null) {
        var okLocal = checkSafe(local);
        if (okLocal) return { safe: okLocal, from: LOCAL_CONF };
        say('zone "' + local + '" in ' + LOCAL_CONF + ' is not valid (need WxH+X+Y inside ' + FRAME.w + 'x' + FRAME.h + ') - using the shipped zone');
    }
    var body = bodyOf(), tag = body.err ? 'body unknown: ' + body.err : body.name ? 'body ' + body.name : 'body code ' + hex(body.code) + ' is not in the list';
    var own = body.err ? null : bodySafe(body.name);
    if (own) return { safe: own, from: 'zone.conf, ' + tag, body: body };
    var shipped = checkSafe(confSafe(SHIPPED_CONF));
    var out = shipped ? { safe: shipped, from: 'zone.conf, common zone, ' + tag } : { safe: DEFAULT_SAFE, from: 'built-in, ' + tag };
    out.body = body;
    if (body.err) out.unsure = true;
    return out;
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
    /* Stale: the record is enabled but no longer describes the CarPlay file (it
     * was replaced or edited since the plan was made - seen after removing the
     * old cluster-yandex-safearea-fix, which writes its zone back into the
     * file). Maps on cluster then arms nothing at boot and shows "Not patched"
     * until Patch is pressed. Its own test (inmem.current) decides. */
    var stale = false;
    try { stale = typeof inmem.current === 'function' && !inmem.current('carplay'); } catch (e) { stale = false; }
    return { rec: rec, safe: argOf(rec.args, '--safe'), stale: stale };
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
 * leaves there). Maps on cluster 0.14.7+ works with it; older ones refuse to plan. The shipped bytes
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
         * usual reason an older Maps on cluster has no plan. This tool never
         * writes carplay; it says to update Maps on cluster. */
        if (leftoverZone()) {
            finish({ status: 'zone not written: the CarPlay file still holds the map zone of the old cluster-yandex-safearea-fix, so Maps on cluster cannot patch. ' +
                (oldFixInstalled() ? 'Remove the old cluster-yandex-safearea-fix in the Store. ' : '') +
                'Update Maps on cluster to 0.14.7 or newer, press Patch on the CarPlay tab of its app and restart the head unit. Then install this tool again' }, 1);
            return;
        }
        finish({ status: 'zone not written: ' + now.err + hint }, 1); return;
    }
    /* Only now: a working in-memory plan means carplay on disk is stock, so an
     * empty backup record cannot hide an edit the old fix still has to undo. */
    helpOldFix();
    var want = wantedSafe();
    say('wanted zone ' + want.safe + ' (' + want.from + '), in the plan now: ' + (now.safe || 'default'));
    clearEnsure();
    if (now.stale) say('the map plan was made for another CarPlay file than the one on the unit now - planning again');
    if (now.safe === want.safe && !now.stale) { finish({ status: 'zone ' + want.safe + ' is already in the map plan' }, 0); return; }
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

/* ---- the boot check -----------------------------------------------------------
 * Patch in the Maps on cluster app makes a plan with the default zone. A minute
 * after each head-unit start, cebep-map-zone.service runs `ensure`: when the
 * plan works and its zone is not the wanted one, the same re-plan as `activate`
 * is done, in the background. Nothing waits for it and it never blocks CarPlay;
 * the zone it puts back takes effect at the next head-unit start.
 *
 * The same re-plan is done when the plan is enabled but was made for another
 * CarPlay file than the one on the unit now (see inspect): what the Patch
 * button would do, with the wanted zone, so the button is not needed.
 *
 * It only ever re-plans a plan Maps on cluster has enabled: a patch that was
 * removed, or one boot recovery turned off, is left alone. It writes nothing
 * outside /var/opt. Three failed attempts in a row for the same zone and it
 * stops trying until the tool is installed again. It always exits 0. */
var ENSURE_STATE = process.env.CEBEP_ENSURE_STATE || '/var/opt/cebep-map-zone/ensure.json';
var ENSURE_TRIES = 3;
function readEnsure() {
    try { var o = JSON.parse(fs.readFileSync(ENSURE_STATE, 'utf8')); return o && typeof o === 'object' ? o : {}; } catch (e) { return {}; }
}
function writeEnsure(o) {
    try { fs.writeFileSync(ENSURE_STATE + '.new', JSON.stringify(o) + '\n'); fs.renameSync(ENSURE_STATE + '.new', ENSURE_STATE); } catch (e) {}
}
function clearEnsure() { try { fs.unlinkSync(ENSURE_STATE); } catch (e) {} }

function ensure() {
    var woc = loadWoc();
    if (woc.err) { say('boot check: ' + woc.err + ' - nothing to do'); process.exit(0); }
    var now = inspect(woc.inmem);
    if (now.err) { say('boot check: ' + now.err + ' - leaving the plan alone'); process.exit(0); }
    var want = wantedSafe();
    if (want.unsure && !now.stale) { say('boot check: ' + want.body.err + ' - leaving the plan alone at this start (it has ' + (now.safe || 'the default zone') + ')'); process.exit(0); }
    if (now.safe === want.safe && !now.stale) { clearEnsure(); say('boot check: zone ' + want.safe + ' is in the map plan (' + want.from + ')'); process.exit(0); }
    var st = readEnsure();
    if (st.zone === want.safe && st.fails >= ENSURE_TRIES) {
        say('boot check: zone ' + want.safe + ' could not be written ' + st.fails + ' times (' + (st.last || '?') + ') - not trying again; install the tool again to retry');
        process.exit(0);
    }
    say(now.stale ? 'boot check: the map plan was made for another CarPlay file than the one on the unit now (Maps on cluster shows Not patched) - planning again with zone ' + want.safe
                  : 'boot check: the plan has ' + (now.safe || 'the default zone') + ', putting ' + want.safe + ' (' + want.from + ') back');
    replan(woc.inmem, stripSafe(now.rec.args).concat(['--safe', want.safe]), function (err) {
        if (err) {
            writeEnsure({ zone: want.safe, fails: (st.zone === want.safe ? (st.fails || 0) : 0) + 1, last: String(err.message).slice(0, 200) });
            say('boot check: zone not written, the map plan is unchanged: ' + err.message);
            process.exit(0);
        }
        /* A plan that still does not fit right after it was made would be made
         * again at every start: count it as a failure, so it stops after three. */
        var fits = true;
        try { fits = !now.stale || typeof woc.inmem.current !== 'function' || !!woc.inmem.current('carplay'); } catch (e) { fits = true; }
        if (!fits) {
            writeEnsure({ zone: want.safe, fails: (st.zone === want.safe ? (st.fails || 0) : 0) + 1, last: 'the new plan does not fit the CarPlay file either' });
            say('boot check: planned again, but Maps on cluster still does not take the plan for this CarPlay file - press Patch in its app');
            process.exit(0);
        }
        clearEnsure();
        resetRecovery();
        say(now.stale ? 'boot check: the map plan is made again for this CarPlay file, with zone ' + want.safe + '; the map is patched from the next head-unit start'
                      : 'boot check: zone ' + want.safe + ' is back in the map plan; it takes effect at the next head-unit start');
        process.exit(0);
    });
}

/* Removal: put the default zone back. Whatever happens it exits 0: a tool that
 * cannot be removed is worse than a leftover zone (Patch in the map app
 * resets it). */
function deactivate() {
    clearEnsure();
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
    if (leftoverZone()) say('CarPlay file: still holds the old fix\'s map zone - with Maps on cluster 0.14.7 or newer press Patch in its app if the map is gone');
    var rec = woc.inmem.readRecord('carplay'), want = wantedSafe();
    say('wanted zone: ' + want.safe + ' (' + want.from + ')');
    if (want.body && !want.body.err) say('body by the head unit coding: ' + (want.body.name || '?') + ' (BAUREIHE ' + hex(want.body.code) + ')');
    if (!rec) { say('no CarPlay patch plan'); process.exit(0); }
    say('plan: ' + (rec.needsPlan ? 'not made (' + (rec.error || '?') + ')' : rec.enabled === true ? 'enabled' : 'disabled' + (rec.by ? ' (' + rec.by + ')' : '')) +
        (rec.trial ? ', on trial' : rec.proven ? ', proven' : ''));
    say('plan arguments: ' + (Array.isArray(rec.args) ? rec.args.join(' ') : '?'));
    say('zone in the plan: ' + ((Array.isArray(rec.args) && argOf(rec.args, '--safe')) || 'default'));
    try { if (typeof woc.inmem.current === 'function') say('plan matches the CarPlay file on the unit: ' + (woc.inmem.current('carplay') ? 'yes' : 'NO - Maps on cluster arms nothing until it is planned again (the boot check does that)')); } catch (e) {}
    say('old cluster-yandex-safearea-fix: ' + (!oldFixInstalled() ? 'not installed' : 'installed, backup record ' + (fs.existsSync(OLD_BACKUP) ? 'present' : 'missing') + ' - remove it in the Store'));
    process.exit(0);
}

function main() {
    var cmd = process.argv[2];
    if (cmd === 'activate') activate();
    else if (cmd === 'deactivate') deactivate();
    else if (cmd === 'status') status();
    else if (cmd === 'ensure') ensure();
    else { process.stderr.write('usage: zone.js activate|deactivate|status|ensure\n'); process.exit(2); }
}
if (require.main === module) main();
else module.exports = { checkSafe: checkSafe, stripSafe: stripSafe, argOf: argOf };
