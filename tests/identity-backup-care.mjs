// 本地检查：NODE_PATH 指向已安装的 puppeteer-core，且本机有 Chrome。
// 例：NODE_PATH=/tmp/pwtest/node_modules node tests/identity-backup-care.mjs
// 页面一律 ?sync=off，或拦截 api.web3forms.com，不会真发同步邮件。
import fs from "fs";
import { pathToFileURL } from "url";

let puppeteer;
try {
  puppeteer = (await import("puppeteer-core")).default;
} catch (e) {
  const alt = process.env.PUPPETEER_CORE;
  if (!alt) throw e;
  puppeteer = (await import(pathToFileURL(alt).href)).default;
}

const BASE = process.env.DANCI_BASE || "http://127.0.0.1:8765";
const CHROME = process.env.CHROME_PATH || "/usr/local/bin/google-chrome";
const ART = "/opt/cursor/artifacts";
const DAY = 86400000;
fs.mkdirSync(ART, { recursive: true });

const failures = [];
function check(cond, msg) {
  if (!cond) failures.push(msg);
  else console.log("ok:", msg);
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function db(over) {
  const o = Object.assign({
    name: "小红",
    keepMe: "yes-do-not-wipe",
    set: { accent: "en-GB", rate: 0.9, auto: true, cap: 50, batch: 10, goal: 7000, weekGoal: 70, track: "exam" },
    prog: { b0: { n: 3, iv: 4, ef: 2.5, due: 1, lap: 1, sw: 0, first: 1, last: 1, extra: "keep" } },
    custom: [{ id: "c1", w: "deposit", cn: "押金", g: "我的生词" }],
    groups: ["我的生词"],
    log: {},
    quizzes: [],
    nextId: 2,
    created: Date.now() - 2 * DAY,
    fun: { xp: 10, best: 2, rank: 0 }
  }, over || {});
  Object.keys(o).forEach((k) => { if (o[k] === undefined) delete o[k]; });
  return o;
}

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: true,
  args: ["--no-sandbox", "--disable-dev-shm-usage", "--host-resolver-rules=MAP api.web3forms.com 127.0.0.1, MAP *.supabase.co 127.0.0.1"]
});

async function openPage(opts = {}) {
  const ctx = await browser.createBrowserContext();
  const page = await ctx.newPage();
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2 });
  const hits = [];
  const posts = [];
  await page.setRequestInterception(true);
  page.on("request", (req) => {
    const u = req.url();
    if (req.method() === "POST") posts.push(req.postData() || "");
    let host = "";
    try { host = new URL(u).hostname; } catch (e) {}
    if (host === "127.0.0.1" || host === "localhost" || u.startsWith("data:") || u.startsWith("blob:")) { req.continue(); return; }
    hits.push(req.method() + " " + u);
    const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "POST, OPTIONS", "Access-Control-Allow-Headers": "Content-Type, Accept" };
    if (opts.fulfillSync && host === "api.web3forms.com") {
      if (req.method() === "OPTIONS") req.respond({ status: 204, headers: cors });
      else req.respond({ status: 200, contentType: "application/json", headers: cors, body: JSON.stringify({ success: true }) });
    } else req.abort("blockedbyclient");
  });
  page.__posts = posts;
  const errors = [];
  page.on("pageerror", (err) => errors.push(String(err)));
  await page.evaluateOnNewDocument(() => {
    const orig = window.fetch;
    window.fetch = function(input, init) {
      try {
        const u = typeof input === "string" ? input : (input && input.url) || "";
        if (String(u).includes("web3forms") || String(u).includes("supabase")) {
          window.__bodies = window.__bodies || [];
          window.__bodies.push(String(init && init.body || ""));
        }
      } catch (e) {}
      return orig.apply(this, arguments);
    };
  });
  if (opts.fixedNow || opts.storage) {
    await page.evaluateOnNewDocument((fixed, entries) => {
      if (fixed) {
        const Orig = Date;
        class M extends Orig {
          constructor(...args) { super(...(args.length ? args : [fixed])); }
          static now() { return fixed; }
        }
        window.Date = M;
      }
      if (entries) {
        for (const [k, v] of entries) {
          if (localStorage.getItem(k) == null) localStorage.setItem(k, v);
        }
      }
    }, opts.fixedNow || 0, opts.storage || null);
  }
  const errorsBefore = errors;
  await page.goto(BASE + (opts.syncOff === false ? "/" : "/?sync=off"), { waitUntil: "domcontentloaded", timeout: 20000 });
  await page.waitForFunction(() => document.getElementById("heroT") && document.getElementById("heroT").textContent.length > 0);
  page.__hits = hits;
  page.__errors = errorsBefore;
  page.__ctx = ctx;
  return page;
}
async function shot(page, name) { await page.screenshot({ path: ART + "/" + name, type: "png" }); }
async function close(page) { await page.__ctx.close(); }
function prog(page) {
  return page.evaluate(() => {
    const d = JSON.parse(localStorage.getItem("danci.v1"));
    return { name: d.name, learner: d.learner || "", extra: d.prog.b0.extra, keep: d.keepMe, custom: d.custom[0].id, backup: d.lastBackup, care: d.careOff || "" };
  });
}

const html = await (await fetch(BASE + "/index.html")).text();
check(html.includes('var APPV="danci-v16"') && html.includes('var SYNC_APPV = "v16"'), "page is app v16");
check(html.includes('var KEY = "danci.v1"'), "learning key unchanged");
const sw = await (await fetch(BASE + "/sw.js")).text();
check(sw.includes('const CACHE = "danci-v16"'), "service worker cache is danci-v16");

// 根因对照：旧公式把任意 lastBackup 直接换成天数。1700001000000 是 2023-11-14 的毫秒时间，
// 上一版预览截图用了它，所以会出现大约 1097 天。这不是新安装被写成 1097。
{
  const stamp = 1700001000000;
  const days = Math.floor((Date.now() - stamp) / DAY);
  console.log("evidence: lastBackup", stamp, new Date(stamp).toISOString(), "=>", days, "days by the old formula");
  check(days > 1000 && days < 2000, "fixture stamp is about three years, not a new install: " + days);
  const secDays = Math.floor((Date.now() - 1700001000) / DAY);
  check(secDays > 10000, "a seconds timestamp would fabricate a huge day count: " + secDays);
}

// 弟弟：是彦神，称呼保留；再打开不再问；能看见关怀卡；学习记录不动。
{
  const raw = JSON.stringify(db({ name: "弟弟" }));
  const morning = Date.UTC(2026, 10, 17, 1, 0, 0); // 11月17日 09:00 北京时间
  const page = await openPage({ fixedNow: morning, storage: [["danci.v1", raw]] });
  await page.waitForFunction(() => document.getElementById("whoAsk").classList.contains("on"));
  const asked = await page.evaluate(() => ({
    h: document.querySelector("#whoAsk h2").textContent,
    t: document.getElementById("whoText").textContent,
    yes: document.getElementById("whoYes").textContent,
    nameOn: document.getElementById("welcome").classList.contains("on"),
    study: document.getElementById("study").classList.contains("on")
  }));
  check(asked.h === "是彦神吗？" && asked.t.includes("弟弟") && asked.t.includes("不用改名"), "弟弟 sees a one-time identity question: " + asked.t);
  check(asked.yes === "是，就叫弟弟", "yes keeps the nickname");
  check(!asked.nameOn, "identity question is not the empty-name prompt");
  await page.evaluate(() => document.getElementById("battleBtn").click());
  const blocked = await page.evaluate(() => document.getElementById("study").classList.contains("on"));
  check(!blocked, "study waits until the identity question is answered");
  await shot(page, "who_prompt_didi.png");
  await page.click("#whoYes");
  await page.waitForFunction(() => !document.getElementById("whoAsk").classList.contains("on"));
  const after = await prog(page);
  check(after.name === "弟弟" && after.learner === "彦神", "yes keeps 弟弟 and records 彦神");
  check(after.extra === "keep" && after.keep === "yes-do-not-wipe" && after.custom === "c1", "yes does not touch study records");
  const care = await page.evaluate(() => ({
    hidden: document.getElementById("careCard").hidden,
    lead: document.getElementById("careLead").textContent,
    toggle: document.getElementById("careToggle").hidden,
    text: document.body.innerText
  }));
  check(care.hidden === false && care.lead.includes("11点左右") && !care.lead.includes("学两句") && care.toggle, "before 11:00 only a light reminder, no study nudge: " + care.lead);
  check(!care.text.includes("明天") && !care.text.includes("12点") && !care.text.includes("中午"), "reminder does not say tomorrow or 12:00");
  await shot(page, "care_light_before_eleven.png");
  await page.evaluate(() => document.getElementById("battleBtn").click());
  await page.waitForFunction(() => document.getElementById("study").classList.contains("on"));
  await page.click("#sQuit");
  check((await prog(page)).extra === "keep", "main study flow still opens and quits without changing records");
  await page.goto(BASE + "/?sync=off", { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => document.getElementById("heroT").textContent === "弟弟的雅思修行");
  const again = await page.evaluate(() => document.getElementById("whoAsk").classList.contains("on"));
  check(!again, "reopen after yes does not ask again");
  check(page.__hits.length === 0, "identity save with sync=off sends nothing");
  check(page.__errors.length === 0, "no page errors for 弟弟 yes: " + page.__errors.join(" | "));
  await close(page);
}

// 弟弟：不是我。再打开不问，不给关怀卡，不改名。
{
  const page = await openPage({ storage: [["danci.v1", JSON.stringify(db({ name: "弟弟" }))]] });
  await page.waitForSelector("#whoAsk.on");
  await page.click("#whoNo");
  await page.waitForFunction(() => !document.getElementById("whoAsk").classList.contains("on"));
  const after = await prog(page);
  const care = await page.evaluate(() => ({
    hidden: document.getElementById("careCard").hidden,
    lead: document.getElementById("careLead").textContent,
    text: document.body.innerText
  }));
  check(after.name === "弟弟" && after.learner === "other" && after.extra === "keep", "no keeps the nickname and does not mark 彦神");
  check(care.hidden && care.lead === "" && !care.text.includes("牙科预约"), "saying no hides the care card");
  await page.goto(BASE + "/?sync=off", { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => document.getElementById("heroT").textContent.length > 0);
  const again = await page.evaluate(() => document.getElementById("whoAsk").classList.contains("on"));
  check(!again, "reopen after no does not ask again");
  await page.evaluate(() => document.getElementById("battleBtn").click());
  await page.waitForFunction(() => document.getElementById("study").classList.contains("on"));
  check(true, "after no, study still starts");
  await close(page);
}

// 小明：是 / 不是，各问一次。其他名字不问。
{
  const page = await openPage({ storage: [["danci.v1", JSON.stringify(db({ name: "小明" }))]] });
  await page.waitForSelector("#whoAsk.on");
  const yes = await page.$eval("#whoYes", (el) => el.textContent);
  check(yes === "是，就叫小明", "小明 is asked the same way");
  await shot(page, "who_prompt_xiaoming.png");
  await page.click("#whoYes");
  await page.waitForFunction(() => !document.getElementById("whoAsk").classList.contains("on"));
  const got = await prog(page);
  const shown = await page.evaluate(() => ({ hero: document.getElementById("heroT").textContent, care: !document.getElementById("careCard").hidden }));
  check(got.name === "小明" && got.learner === "彦神" && shown.hero === "小明的雅思修行" && shown.care, "小明 yes keeps the nickname and shows care");
  await page.goto(BASE + "/?sync=off", { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => document.getElementById("heroT").textContent === "小明的雅思修行");
  check(!(await page.evaluate(() => document.getElementById("whoAsk").classList.contains("on"))), "小明 reopen after yes does not ask");
  await close(page);
}
{
  const page = await openPage({ storage: [["danci.v1", JSON.stringify(db({ name: "小明" }))]] });
  await page.waitForSelector("#whoAsk.on");
  await page.click("#whoNo");
  await page.waitForFunction(() => !document.getElementById("whoAsk").classList.contains("on"));
  const got = await prog(page);
  const text = await page.evaluate(() => document.body.innerText);
  check(got.name === "小明" && got.learner === "other" && !text.includes("牙科预约"), "小明 no is not treated as 彦神");
  await page.goto(BASE + "/?sync=off", { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => document.getElementById("heroT").textContent === "小明的雅思修行");
  check(!(await page.evaluate(() => document.getElementById("whoAsk").classList.contains("on"))), "小明 reopen after no does not ask");
  await close(page);
}
{
  const page = await openPage({ storage: [["danci.v1", JSON.stringify(db({ name: "小红" }))]] });
  await sleep(200);
  const ui = await page.evaluate(() => ({
    who: document.getElementById("whoAsk").classList.contains("on"),
    name: document.getElementById("welcome").classList.contains("on"),
    care: document.getElementById("careCard").hidden,
    lead: document.getElementById("careLead").textContent,
    text: document.body.innerText,
    hero: document.getElementById("heroT").textContent
  }));
  check(!ui.who && !ui.name && ui.hero === "小红的雅思修行", "other names are not asked and not blocked");
  check(ui.care && ui.lead === "" && !ui.text.includes("牙科") && !ui.text.includes("彦神吗"), "other learners do not see the care card");
  await page.evaluate(() => document.getElementById("battleBtn").click());
  await page.waitForFunction(() => document.getElementById("study").classList.contains("on"));
  await page.click("#sQuit");
  check((await prog(page)).extra === "keep" && (await prog(page)).name === "小红", "other learner study flow is unchanged");
  await close(page);
}

// 称呼本来就是彦神：不用再问，直接看见卡片。
{
  const page = await openPage({ storage: [["danci.v1", JSON.stringify(db({ name: "彦神" }))]] });
  await sleep(200);
  const ui = await page.evaluate(() => ({
    who: document.getElementById("whoAsk").classList.contains("on"),
    care: !document.getElementById("careCard").hidden,
    hero: document.getElementById("heroT").textContent
  }));
  check(!ui.who && ui.care && ui.hero === "彦神的雅思修行", "the name 彦神 is enough; no extra question");
  await close(page);
}

// 收起后不再出现。空名字仍先问名字，填了弟弟再问是不是彦神。
{
  const page = await openPage({ storage: [["danci.v1", JSON.stringify(db({ name: "彦神" }))]] });
  await page.click("#careHide");
  await page.waitForFunction(() => document.getElementById("careCard").hidden);
  const mid = await prog(page);
  check(mid.care === "tooth-20261118" && mid.name === "彦神" && mid.extra === "keep", "dismiss records only the care flag");
  await page.goto(BASE + "/?sync=off", { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => document.getElementById("heroT").textContent === "彦神的雅思修行");
  const hidden = await page.evaluate(() => document.getElementById("careCard").hidden && document.getElementById("careLead").textContent === "");
  check(hidden, "dismissed care card stays hidden");
  await close(page);
}
{
  const page = await openPage({});
  const first = await page.evaluate(() => document.getElementById("welcome").classList.contains("on") && !document.getElementById("whoAsk").classList.contains("on"));
  check(first, "empty name still asks for a name first");
  await page.type("#wName", "弟弟");
  await page.click("#wGo");
  await page.waitForSelector("#whoAsk.on");
  const hero = await page.$eval("#heroT", (el) => el.textContent);
  check(hero === "弟弟的雅思修行", "new 弟弟 keeps that nickname before the identity answer");
  await close(page);
}

// 日期：11点前只提醒；11:00–13:00 才建议学两句；之后休息优先。
{
  const eleven = Date.UTC(2026, 10, 18, 3, 0, 0);
  const before = eleven - 60 * 1000;
  const atStudy = eleven + 5 * 60 * 1000;
  const after = Date.UTC(2026, 10, 18, 5, 5, 0);
  const early = Date.UTC(2026, 10, 16, 4, 0, 0);
  const late = Date.UTC(2026, 10, 19, 16, 1, 0);
  const pageW = await openPage({ fixedNow: before, storage: [["danci.v1", JSON.stringify(db({ name: "彦神", created: before - DAY }))]] });
  const w = await pageW.evaluate(() => ({
    lead: document.getElementById("careLead").textContent,
    toggle: document.getElementById("careToggle").hidden
  }));
  check(w.lead.includes("11点左右") && !w.lead.includes("学两句") && w.toggle, "10:59 is still only a reminder: " + w.lead);
  await close(pageW);
  const pageS = await openPage({ fixedNow: atStudy, storage: [["danci.v1", JSON.stringify(db({ name: "彦神", created: atStudy - DAY }))]] });
  const s = await pageS.evaluate(() => ({
    lead: document.getElementById("careLead").textContent,
    toggle: document.getElementById("careToggle").hidden,
    text: document.body.innerText
  }));
  check(!s.toggle && s.lead.includes("可以学两句") && s.lead.includes("想休息就休息"), "around 11:00 the study nudge appears: " + s.lead);
  check(!s.text.includes("明天") && !s.text.includes("12点") && !s.text.includes("中午"), "study nudge does not say 12:00 or tomorrow");
  await shot(pageS, "care_study_around_eleven.png");
  await pageS.click("#careToggle");
  await pageS.waitForFunction(() => !document.getElementById("careLines").hidden);
  const lines = await pageS.evaluate(() => document.getElementById("careLines").innerText);
  check(lines.includes("around eleven") && lines.includes("大约11点"), "English line says around eleven");
  check(lines.includes("Could you say that more slowly, please?") && lines.includes("能说慢一点吗？"), "optional English lines have Chinese meanings");
  check(lines.includes("What should I do after this?") && lines.includes("我有点紧张"), "lines cover nervousness and aftercare questions");
  await pageS.evaluate(() => document.querySelector("#careLines [data-say='4']").click());
  check((await prog(pageS)).extra === "keep", "listening to a line does not score or rename");
  await shot(pageS, "care_phrases.png");
  await close(pageS);
  const pageR = await openPage({ fixedNow: after, storage: [["danci.v1", JSON.stringify(db({ name: "彦神", created: after - DAY }))]] });
  const r = await pageR.evaluate(() => ({
    lead: document.getElementById("careLead").textContent,
    toggle: document.getElementById("careToggle").hidden
  }));
  check(r.lead.includes("休息为先") && r.lead.includes("听牙医的嘱咐") && !r.lead.includes("学两句") && r.toggle, "after 13:00 rest comes first: " + r.lead);
  await shot(pageR, "care_rest_after_window.png");
  await close(pageR);
  const pageE = await openPage({ fixedNow: early, storage: [["danci.v1", JSON.stringify(db({ name: "彦神", created: early }))]] });
  check(await pageE.evaluate(() => document.getElementById("careCard").hidden), "before 17 Nov Shanghai the card is absent");
  await close(pageE);
  const pageL = await openPage({ fixedNow: late, storage: [["danci.v1", JSON.stringify(db({ name: "彦神", created: late - 2 * DAY }))]] });
  check(await pageL.evaluate(() => document.getElementById("careCard").hidden && document.getElementById("careLead").textContent === ""), "after 20 Nov Shanghai the card expires");
  await close(pageL);
}

// 备份时间：不编天数，不把同步当成备份，也不改时间戳。
async function backupText(over, sync) {
  const storage = [["danci.v1", JSON.stringify(db(over))]];
  if (sync) storage.push(["danci.sync", JSON.stringify(sync)]);
  const page = await openPage({ storage });
  const ui = await page.evaluate(() => ({
    hidden: document.getElementById("bkCard").hidden,
    text: document.getElementById("bkText").textContent,
    hero: document.getElementById("heroSync").textContent,
    raw: localStorage.getItem("danci.v1")
  }));
  await close(page);
  return ui;
}
{
  const recent = await backupText({ created: Date.now() - 2 * DAY });
  check(recent.hidden, "a two-day-old app with no export does not warn");
  const never = await backupText({ created: Date.now() - 40 * DAY });
  check(!never.hidden && never.text.includes("还没有导出过备份") && never.text.includes("40") && never.text.includes("不能代替"), "never exported says so, with the real age: " + never.text);
  check(!/上次导出备份是/.test(never.text), "never exported is not described as an old export");
  const pageN = await openPage({ storage: [["danci.v1", JSON.stringify(db({ created: Date.now() - 40 * DAY }))]] });
  await shot(pageN, "backup_not_exported.png");
  await close(pageN);
  const oldStamp = 1700001000000;
  const expectDays = Math.floor((Date.now() - oldStamp) / DAY);
  const aged = await backupText({ lastBackup: oldStamp, created: oldStamp });
  check(aged.text.includes(String(expectDays)) && aged.text.includes("上次导出备份") && aged.text.includes("不是一回事"), "a real millisecond stamp shows the true day count: " + aged.text);
  check(!aged.text.includes("已经 " + expectDays + " 天没有备份了"), "the old alarming sentence is gone");
  const stored = JSON.parse(aged.raw).lastBackup;
  check(stored === oldStamp, "showing the age does not rewrite lastBackup");
  const seconds = Math.floor((Date.now() - 1700001000) / DAY);
  const bad = await backupText({ lastBackup: 1700001000, created: Date.now() - DAY });
  check(bad.text.includes("对不上") && !bad.text.includes(String(seconds)), "seconds are not turned into a huge day count: " + bad.text);
  const pageB = await openPage({ storage: [["danci.v1", JSON.stringify(db({ lastBackup: 1700001000, created: Date.now() - DAY }))]] });
  await shot(pageB, "backup_bad_timestamp.png");
  await close(pageB);
  const future = await backupText({ lastBackup: Date.now() + 10 * DAY, created: Date.now() - DAY });
  check(future.text.includes("未来") && !/-\d+ 天/.test(future.text), "a future export time is not a negative day count: " + future.text);
  const junk = await backupText({ lastBackup: "nope", created: Date.now() - DAY });
  check(junk.text.includes("对不上") && !junk.text.includes("NaN"), "an invalid export time is not NaN: " + junk.text);
  const unclear = await backupText({ created: "foo" });
  check(unclear.text.includes("看不清") && !/\d{3,} 天/.test(unclear.text), "a bad start date does not invent elapsed days: " + unclear.text);
  check(JSON.parse(unclear.raw).created === "foo", "a bad start date is not overwritten");
  const synced = await backupText({ created: Date.now() - 2 * DAY }, { dev: "t", ses: [], sent: [], cfg: { off: 1 }, last: Date.now() - 3600000 });
  check(synced.hidden && synced.hero.startsWith("上次同步时间：") && !synced.hero.includes("尚未同步"), "sync time shows on the home");
  check(!synced.text.includes("备份") || synced.hidden, "sync time does not create a backup warning");
}

// 同步摘要可以带身份，但不能带牙科内容。请求被拦住。
{
  const page = await openPage({
    fulfillSync: true,
    syncOff: false,
    storage: [["danci.v1", JSON.stringify(db({ name: "弟弟", learner: "彦神" }))]]
  });
  for (let i = 0; i < 15; i++) {
    const got = await page.evaluate(() => (window.__bodies || []).some((b) => b.includes("DANCI-SYNC")));
    if (got) break;
    await page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
    await sleep(200);
  }
  const post = await page.evaluate(() => (window.__bodies || []).find((b) => b.includes("DANCI-SYNC")) || "");
  check(post.includes("learner") && post.includes("彦神") && post.includes("弟弟"), "sync keeps nickname and adds identity");
  check(!post.includes("牙科") && !post.includes("拔牙") && !post.includes("候诊") && !post.includes("tooth"), "sync payload has no dental text");
  check(page.__hits.every((u) => u.includes("api.web3forms.com")), "dental test did not leak to other hosts: " + page.__hits.join(","));
  const raw = JSON.parse(await page.evaluate(() => localStorage.getItem("danci.v1")));
  check(raw.prog.b0.extra === "keep" && raw.name === "弟弟", "sync does not rewrite study data");
  await close(page);
}

await browser.close();
if (failures.length) {
  console.error("\nFAILED " + failures.length);
  failures.forEach((f) => console.error(" - " + f));
  process.exit(1);
}
console.log("\nALL CHECKS PASSED");
