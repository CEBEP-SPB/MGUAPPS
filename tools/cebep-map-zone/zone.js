#!/usr/bin/env node
// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 CEBEP SPB
/* zone.js - зона карты на щитке под Яндекс Навигатор, для Maps on cluster
 * (waze-on-cluster) 0.11.0 и новее.
 *
 * С 0.11.0 Maps on cluster не правит /usr/bin/carplay: он держит "план" правок
 * (/var/opt/waze-on-cluster/inmem-carplay.plan) и накладывает его на CarPlay в
 * памяти при каждом запуске. План делает его же генератор, и у генератора есть
 * штатный параметр --safe ШxВ+X+Y. Этот тул делает одно: просит тот же генератор
 * (inmem.makePlan) сделать план заново с теми же параметрами плюс --safe.
 * Все проверки (сборка CarPlay, кодировка, места правок, контрольные суммы)
 * остаются за Maps on cluster; новый план он сам ставит "на испытание".
 *
 *   zone.js activate     установка / обновление: записать зону в план
 *   zone.js deactivate   удаление: вернуть штатную зону. Никогда не мешает удалению.
 *   zone.js status       показать, что сейчас в плане (только чтение)
 *
 * В системный раздел ничего не пишется, при загрузке ничего не запускается.
 * Вступает в силу при следующем старте головы. Node 8, без зависимостей.
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

/* "504x368+456+72" -> та же строка, если формат и границы в порядке, иначе null. */
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

/* Какую зону ставить и откуда она взята. Битая строка в своём файле не роняет
 * установку молча: о ней говорится, и берётся следующая по порядку. */
function wantedSafe() {
    var local = confSafe(LOCAL_CONF);
    if (local !== null) {
        var okLocal = checkSafe(local);
        if (okLocal) return { safe: okLocal, from: LOCAL_CONF };
        say('в ' + LOCAL_CONF + ' зона "' + local + '" не годится (нужно ШxВ+X+Y внутри ' + FRAME.w + 'x' + FRAME.h + ') - беру зону из комплекта');
    }
    var shipped = checkSafe(confSafe(SHIPPED_CONF));
    if (shipped) return { safe: shipped, from: 'zone.conf' };
    return { safe: DEFAULT_SAFE, from: 'встроенная' };
}

/* Параметры плана без --safe и его значения. */
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

/* Модули Maps on cluster с головы. null и причина, если его нет или он старее 0.11.0. */
function loadWoc() {
    var inmem;
    try { inmem = require(path.join(WOC, 'inmem.js')); }
    catch (e) { return { err: 'Maps on cluster 0.11.0 или новее не найден (' + path.join(WOC, 'inmem.js') + '): поставь или обнови его в Магазине' }; }
    if (!inmem || typeof inmem.makePlan !== 'function' || typeof inmem.readRecord !== 'function')
        return { err: 'у этой версии Maps on cluster другой механизм плана - тул под неё не рассчитан' };
    return { inmem: inmem };
}

/* Что сейчас записано про план CarPlay и можно ли менять в нём зону. */
function inspect(inmem) {
    var rec = inmem.readRecord('carplay');
    if (!rec) return { err: 'у Maps on cluster нет плана патча CarPlay: открой приложение Maps on cluster, вкладка CarPlay, нажми Patch, перезагрузи голову и поставь этот тул ещё раз' };
    if (rec.needsPlan) return { err: 'Maps on cluster сам не смог сделать план (' + (rec.error || 'причина не записана') + '): сначала почини карту кнопкой Patch в её приложении' };
    if (rec.enabled !== true) return { err: 'патч CarPlay в Maps on cluster выключен' + (rec.by ? ' (' + rec.by + ')' : '') + ': включи его кнопкой Patch в приложении карты' };
    if (!Array.isArray(rec.args)) return { err: 'в записи плана нет его параметров - тул под такую версию Maps on cluster не рассчитан' };
    var panel = argOf(rec.args, '--panel');
    if (panel !== 'high') return { err: 'патч карты стоит в режиме panel ' + (panel || '?') + ': зона задаётся только в режиме high' };
    if (argOf(rec.args, '--res') === 'stock') return { err: 'патч карты стоит со штатным разрешением (--res stock): зона в этом режиме не задаётся' };
    return { rec: rec, safe: argOf(rec.args, '--safe') };
}

/* Счётчик сбоев boot recovery относится к прежнему плану: новому он не нужен.
 * Не получилось - не страшно, это только счётчик. */
function resetRecovery() {
    try {
        var rec = require(path.join(WOC, 'recovery.js'));
        new rec.Recovery({ target: rec.TARGETS.carplay }).resetCount();
    } catch (e) { say('счётчик boot recovery не сброшен (' + e.message + ') - это не мешает'); }
}

function replan(inmem, args, cb) {
    try { inmem.makePlan('carplay', args, 90000, function (err, rec) { cb(err || null, rec); }); }
    catch (e) { cb(e); }
}

function activate() {
    var woc = loadWoc();
    if (woc.err) { finish({ status: 'зона не записана: ' + woc.err }, 1); return; }
    var now = inspect(woc.inmem);
    if (now.err) { finish({ status: 'зона не записана: ' + now.err }, 1); return; }
    var want = wantedSafe();
    say('нужна зона ' + want.safe + ' (' + want.from + '), сейчас в плане: ' + (now.safe || 'штатная'));
    if (now.safe === want.safe) { finish({ status: 'зона ' + want.safe + ' уже стоит в плане карты' }, 0); return; }
    var args = stripSafe(now.rec.args).concat(['--safe', want.safe]);
    replan(woc.inmem, args, function (err) {
        /* Не получилось - прежний план Maps on cluster остался как был: генератор
         * пишет новый во временный файл и подменяет только готовый. */
        if (err) { finish({ status: 'зона не записана, план карты остался прежним: ' + err.message }, 1); return; }
        resetRecovery();
        finish({ status: 'зона ' + want.safe + ' записана в план карты',
                 reboot: 'cluster map zone ' + want.safe + ' takes effect at the next head-unit start' }, 0);
    });
}

/* Удаление: вернуть штатную зону. Что бы ни случилось - код 0: тул, который
 * нельзя удалить, хуже, чем оставшаяся своя зона (её сбрасывает Patch в
 * приложении карты). */
function deactivate() {
    var woc = loadWoc();
    if (woc.err) { finish({ status: 'возвращать нечего: ' + woc.err }, 0); return; }
    var rec = null;
    try { rec = woc.inmem.readRecord('carplay'); } catch (e) {}
    if (!rec || !Array.isArray(rec.args) || rec.args.indexOf('--safe') < 0) {
        finish({ status: 'возвращать нечего: в плане карты штатная зона' }, 0); return;
    }
    if (rec.needsPlan || rec.enabled !== true) {
        finish({ status: 'план карты сейчас не действует; штатную зону вернёт Patch в приложении Maps on cluster' }, 0); return;
    }
    replan(woc.inmem, stripSafe(rec.args), function (err) {
        if (err) {
            finish({ status: 'штатную зону вернуть не удалось (' + err.message + '); тул удаляется, зону сбросит Patch в приложении Maps on cluster' }, 0);
            return;
        }
        resetRecovery();
        finish({ status: 'в план карты возвращена штатная зона',
                 reboot: 'default cluster map zone takes effect at the next head-unit start' }, 0);
    });
}

function status() {
    var woc = loadWoc();
    if (woc.err) { say(woc.err); process.exit(0); }
    var rec = woc.inmem.readRecord('carplay'), want = wantedSafe();
    say('нужна зона: ' + want.safe + ' (' + want.from + ')');
    if (!rec) { say('плана патча CarPlay нет'); process.exit(0); }
    say('план: ' + (rec.needsPlan ? 'не сделан (' + (rec.error || '?') + ')' : rec.enabled === true ? 'включён' : 'выключен' + (rec.by ? ' (' + rec.by + ')' : '')) +
        (rec.trial ? ', на испытании' : rec.proven ? ', проверен' : ''));
    say('параметры плана: ' + (Array.isArray(rec.args) ? rec.args.join(' ') : '?'));
    say('зона в плане: ' + ((Array.isArray(rec.args) && argOf(rec.args, '--safe')) || 'штатная'));
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
