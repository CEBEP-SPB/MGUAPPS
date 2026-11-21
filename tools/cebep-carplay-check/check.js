#!/usr/bin/env node
// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 CEBEP SPB
/* check.js - read-only check of /usr/bin/carplay against the shipped build.
 *
 * Maps on cluster 0.11.0+ patches CarPlay in memory and needs the shipped
 * carplay on disk, byte for byte. When another tool left bytes of its own in
 * the file, Patch fails with "carplay was modified by something else" and no
 * button fixes it. This tool tells which bytes differ and whether putting the
 * shipped values back gives the shipped file (same SHA-256).
 *
 * It NEVER writes anything. `activate` always exits 1 with the result in its
 * last line, so the Store shows the result as an install error and nothing
 * stays installed. That is the intended way to read it.
 *
 * The shipped bytes and SHA-256 are those of Maps on cluster's own table
 * (waze-on-cluster carplay_patch.js, PROVEN), GPL-3.0-or-later.
 *
 * Node 8, no dependencies. All output is ASCII.
 */
'use strict';

var fs = require('fs');
var path = require('path');
var crypto = require('crypto');

var WOC = process.env.CEBEP_WOC_DIR || '/var/opt/waze-on-cluster/current';
var TARGET = process.env.CEBEP_CARPLAY || '/usr/bin/carplay';
var SINK_STOCK = 'avb://media_transport.avb_streaming.15?mime_type=video/H264';

function latin1(s) { return Buffer.from(s, 'latin1').toString('hex'); }
function hex(n) { return '0x' + n.toString(16); }
function sha256(b) { return crypto.createHash('sha256').update(b).digest('hex'); }

/* By GNU build-id: every offset Maps on cluster ever wrote in this build, with
 * the shipped bytes there. */
var PROVEN = {
    '5de62156575d737391ea42254e778a97dbbb51f8': {
        version: 'carplay 22.28.3',
        sha256: process.env.CEBEP_TEST_SHA || 'ddb33e33161387c6479c391684b3d019b0de54ecfcee8d6877eca94aa62f3e50',
        stock: [['variant', 0x2ba4f0, 'ecf2f7ff'], ['sink', 0x2a20b0, latin1(SINK_STOCK)], ['selfstart', 0x18176c, 'e8effdffff'],
                ['res-mm', 0x20ca32, 'ea0000006e000000'], ['res-px', 0x20ca54, '8007000084030000'],
                ['res-safe1', 0x20ca66, '0000000064020000'], ['res-safe2', 0x20ca74, '0e0200000202c000'],
                ['mapurl-text', 0x257838, latin1('Head-Unit does not support Alternate Displays feature.\0')], ['mapurl-code', 0x7b533, '488d3559922100'],
                ['showui-text', 0x2908a0, latin1('mCinemoCarPlay->ShowUI( ::carplay::CarPlayConstantsRepository::a')], ['showui-code', 0x18188a, 'e851cd07004c89e7488b30']],
        geom: { mm: 0x20ca32, px: 0x20ca54, safe1: 0x20ca66, safe2: 0x20ca74 },
    },
};

function geomText(buf, g) {
    return buf.readUInt32LE(g.px) + 'x' + buf.readUInt32LE(g.px + 4) + ' px, ' + buf.readUInt32LE(g.mm) + 'x' + buf.readUInt32LE(g.mm + 4) + ' mm, safe ' +
        buf.readUInt32LE(g.safe1 + 4) + 'x' + buf.readUInt32LE(g.safe2) + '+' + buf.readUInt16LE(g.safe2 + 4) + '+' + buf.readUInt16LE(g.safe2 + 6) +
        ', view ' + buf.readUInt16LE(g.safe1) + ',' + buf.readUInt16LE(g.safe1 + 2);
}

/* {lines: [...], verdict: '...'} - reads only. */
function check() {
    var out = [], buf, locator;
    try { buf = fs.readFileSync(TARGET); } catch (e) { return { lines: out, verdict: 'cannot read ' + TARGET + ': ' + e.message }; }
    var sum = sha256(buf);
    out.push('file ' + TARGET + ', ' + buf.length + ' bytes, sha256 ' + sum);
    try { locator = require(path.join(WOC, 'carplay_locate.js')); } catch (e) {
        return { lines: out, verdict: 'Maps on cluster 0.11.0+ not found (' + WOC + ') - cannot read the build-id' };
    }
    var id = null;
    try { id = locator.buildId(buf); } catch (e) {}
    out.push('build-id ' + (id || 'not found'));
    var p = id && PROVEN[id];
    if (!p) return { lines: out, verdict: 'this CarPlay build is not in the table - nothing to compare with' };
    if (sum === p.sha256) return { lines: out, verdict: 'OK: ' + p.version + ' is the shipped file, nothing differs' };
    var rebuilt = Buffer.from(buf), diff = [];
    p.stock.forEach(function (s) {
        var want = Buffer.from(s[2], 'hex');
        if (s[1] + want.length > buf.length) { diff.push(s[0] + ' beyond the file end'); return; }
        var cur = buf.slice(s[1], s[1] + want.length);
        if (!cur.equals(want)) {
            diff.push(s[0] + ' ' + hex(s[1]) + ' is ' + (want.length <= 12 ? cur.toString('hex') + ', shipped ' + s[2] : '(' + want.length + ' bytes differ)'));
            want.copy(rebuilt, s[1]);
        }
    });
    try { out.push('geometry now: ' + geomText(buf, p.geom)); out.push('geometry shipped: ' + geomText(rebuilt, p.geom)); } catch (e) {}
    var good = sha256(rebuilt) === p.sha256;
    if (!diff.length) return { lines: out, verdict: p.version + ' NOT shipped, and the difference is outside every known site - not repairable from the table' };
    return { lines: out, verdict: p.version + ' NOT shipped. Differs: ' + diff.join('; ') + '. With the shipped values back the sha256 is ' +
        (good ? 'the shipped one - REPAIRABLE' : 'still wrong - other bytes differ too, NOT repairable from the table') };
}

function main() {
    var cmd = process.argv[2] || 'status';
    if (cmd === 'deactivate') { process.stdout.write(JSON.stringify({ status: 'nothing to undo' }) + '\n'); process.exit(0); }
    var r = check();
    r.lines.forEach(function (l) { process.stdout.write(l + '\n'); });
    if (cmd === 'activate') {
        var geo = r.lines.filter(function (l) { return /^geometry now/.test(l); })[0];
        process.stdout.write(JSON.stringify({ status: 'CHECK ONLY, nothing was changed or installed. ' + r.verdict + (geo ? '. ' + geo : '') }) + '\n');
        process.exit(1);
    }
    process.stdout.write(r.verdict + '\n');
    process.exit(0);
}

if (require.main === module) main();
module.exports = { check: check };
