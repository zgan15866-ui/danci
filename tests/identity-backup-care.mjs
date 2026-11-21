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
  args: ["--no-sandbox", "--disable-dev-shm-usage", "--autoplay-policy=no-user-gesture-required", "--host-resolver-rules=MAP api.web3forms.com 127.0.0.1, MAP *.supabase.co 127.0.0.1"]
});

async function openPage(opts = {}) {
  const ctx = await browser.createBrowserContext();
  const page = await ctx.newPage();
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2 });
  if (opts.dark) await page.emulateMediaFeatures([{ name: "prefers-color-scheme", value: "dark" }]);
  if (opts.noMic) await page.evaluateOnNewDocument(() => { window.MediaRecorder = undefined; });
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
check(html.includes('var APPV="danci-v24"') && html.includes('var SYNC_APPV = "v24"'), "page is app v24");
check(html.includes('var KEY = "danci.v1"'), "learning key unchanged");
check(html.includes('src="voice/mespeak.js"') && html.includes('rawdata:"array"') && html.includes("createBufferSource"), "demo audio is local eSpeak played through Web Audio");
check(html.includes("pitch:68") && html.includes("wordgap:2") && html.includes("amplitude:90"), "demo uses a higher pitch, a short word gap, and slightly lower amplitude");
check(!html.includes("SpeechSynthesisUtterance") && !html.includes("speechSynthesis.speak"), "demo path does not call system TTS");
check(!/responsivevoice|translate\.google|dictionaryapi|speech\.googleapis|unrealspeech|elevenlabs/i.test(html), "page has no online TTS service");
const sw = await (await fetch(BASE + "/sw.js")).text();
check(sw.includes('const CACHE = "danci-v24"') && sw.includes("./voice/mespeak.js"), "service worker cache is danci-v24 and includes the voice engine");
const voiceJs = await (await fetch(BASE + "/voice/mespeak.js")).text();
check(voiceJs.includes("en/en-rp") && voiceJs.includes("en/en-us") && voiceJs.length > 1000000, "bundled engine contains British and American voices");

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
  check(care.hidden && care.lead === "" && !care.text.includes("学两句") && !care.text.includes("牙科"), "before 11:10 there is no waiting-room study card");
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
  const page = await openPage({ fixedNow: Date.UTC(2026, 10, 17, 3, 10, 0), storage: [["danci.v1", JSON.stringify(db({ name: "小明" }))]] });
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
  const page = await openPage({ fixedNow: Date.UTC(2026, 10, 17, 3, 10, 0), storage: [["danci.v1", JSON.stringify(db({ name: "彦神" }))]] });
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
  const page = await openPage({ fixedNow: Date.UTC(2026, 10, 17, 3, 10, 0), storage: [["danci.v1", JSON.stringify(db({ name: "彦神" }))]] });
  await page.click("#careHide");
  await page.waitForFunction(() => document.getElementById("careCard").hidden);
  const mid = await prog(page);
  check(mid.care === "tooth-20261117" && mid.name === "彦神" && mid.extra === "keep", "dismiss records only the care flag");
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

// 今天 11:09 不显示候诊学习；11:10 显示；13:00 休息。非彦神不显示。
{
  const at1109 = Date.UTC(2026, 10, 17, 3, 9, 0);
  const at1110 = Date.UTC(2026, 10, 17, 3, 10, 0);
  const at1300 = Date.UTC(2026, 10, 17, 5, 0, 0);
  const early = Date.UTC(2026, 10, 16, 4, 0, 0);
  const late = Date.UTC(2026, 10, 18, 16, 1, 0);
  const yanshen = (created) => [["danci.v1", JSON.stringify(db({ name: "彦神", created }))]];
  const pageW = await openPage({ dark: true, fixedNow: at1109, storage: yanshen(at1109 - DAY) });
  const w = await pageW.evaluate(() => ({
    hidden: document.getElementById("careCard").hidden,
    lead: document.getElementById("careLead").textContent,
    text: document.body.innerText
  }));
  check(w.hidden && w.lead === "" && !w.text.includes("学两句"), "11:09 does not show the waiting-room study card");
  await shot(pageW, "care_1109_hidden.png");
  await close(pageW);
  const pageS = await openPage({ dark: true, fixedNow: at1110, storage: yanshen(at1110 - DAY) });
  const s = await pageS.evaluate(() => ({
    hidden: document.getElementById("careCard").hidden,
    lead: document.getElementById("careLead").textContent,
    toggle: document.getElementById("careToggle").hidden,
    text: document.body.innerText
  }));
  check(!s.hidden && !s.toggle && s.lead.includes("可以学两句") && s.lead.includes("想休息就休息"), "11:10 shows the waiting-room study card: " + s.lead);
  check(!s.text.includes("明天") && !s.text.includes("11月18日"), "study card is for today, not tomorrow");
  await shot(pageS, "care_1110_study.png");
  await pageS.click("#careToggle");
  await pageS.waitForFunction(() => !document.getElementById("careLines").hidden);
  const lines = await pageS.evaluate(() => document.getElementById("careLines").innerText);
  check(lines.includes("11:10") && lines.includes("11点10分") && lines.includes("报到"), "check-in line matches 11:10");
  check(lines.includes("I'm a bit nervous.") && lines.includes("我有点紧张"), "can say they are nervous");
  check(lines.includes("This tooth hurts.") && lines.includes("这颗牙疼"), "can say the tooth hurts");
  check(lines.includes("Could you use simpler words?") && lines.includes("能说简单一点吗？"), "can ask the dentist to use simpler words");
  check(lines.includes("不是作业，也不是医疗建议") || s.text.includes("不是医疗建议"), "copy says this is not medical advice");
  await pageS.evaluate(() => document.querySelector("#careLines [data-say='2']").click());
  check((await prog(pageS)).extra === "keep", "listening to a line does not score or rename");
  await shot(pageS, "care_1110_phrases.png");
  await close(pageS);
  const pageO = await openPage({ dark: true, fixedNow: at1110, storage: [["danci.v1", JSON.stringify(db({ name: "小红", created: at1110 - DAY }))]] });
  const other = await pageO.evaluate(() => document.getElementById("careCard").hidden && document.getElementById("careLead").textContent === "" && !document.body.innerText.includes("学两句"));
  check(other, "a learner who is not 彦神 does not see the card at 11:10");
  await close(pageO);
  const pageR = await openPage({ dark: true, fixedNow: at1300, storage: yanshen(at1300 - DAY) });
  const r = await pageR.evaluate(() => ({
    lead: document.getElementById("careLead").textContent,
    toggle: document.getElementById("careToggle").hidden
  }));
  check(r.lead.includes("休息为先") && r.lead.includes("听牙医的嘱咐") && !r.lead.includes("学两句") && r.toggle, "13:00 rest comes first: " + r.lead);
  await shot(pageR, "care_1300_rest.png");
  await close(pageR);
  const pageE = await openPage({ fixedNow: early, storage: [["danci.v1", JSON.stringify(db({ name: "彦神", created: early }))]] });
  check(await pageE.evaluate(() => document.getElementById("careCard").hidden), "before 17 Nov Shanghai the card is absent");
  await close(pageE);
  const pageL = await openPage({ fixedNow: late, storage: [["danci.v1", JSON.stringify(db({ name: "彦神", created: late - 2 * DAY }))]] });
  check(await pageL.evaluate(() => document.getElementById("careCard").hidden && document.getElementById("careLead").textContent === ""), "after 19 Nov Shanghai the card expires");
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

// 打开页面就在主界面提示新版本。稍后只藏这一次；已经是当前版本则不再提示。
{
  const raw = JSON.stringify(db({ name: "小红" }));
  const page = await openPage({ storage: [["danci.v1", raw], ["danci.appv", "danci-v18"]] });
  const ui = await page.evaluate(() => ({
    home: !document.getElementById("updHome").hidden,
    title: document.querySelector("#updHome h2").textContent,
    btn: document.getElementById("updHomeGo").textContent,
    bar: document.getElementById("updBar").classList.contains("on"),
    appv: localStorage.getItem("danci.appv"),
    extra: JSON.parse(localStorage.getItem("danci.v1")).prog.b0.extra
  }));
  check(ui.home && ui.title === "发现新版本" && ui.btn === "立即更新" && ui.bar, "opening an old version shows the home update card");
  check(ui.appv === "danci-v24" && ui.extra === "keep", "version key advances without touching study data");
  await shot(page, "home_update_prompt.png");
  await page.click("#updLater");
  const hidden = await page.evaluate(() => document.getElementById("updHome").hidden && !document.getElementById("updBar").classList.contains("on"));
  check(hidden, "稍后 hides the prompt for this open");
  check((await prog(page)).extra === "keep", "dismiss does not change study data");
  await page.goto(BASE + "/?sync=off", { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => document.getElementById("heroT").textContent.length > 0);
  const again = await page.evaluate(() => document.getElementById("updHome").hidden);
  check(again, "after the version key matches, reopen does not nag");
  check(page.__hits.length === 0, "update prompt with sync=off sends nothing");
  await close(page);
}
{
  const page = await openPage({ storage: [["danci.v1", JSON.stringify(db({ name: "小红" }))], ["danci.appv", "danci-v24"]] });
  const hidden = await page.evaluate(() => document.getElementById("updHome").hidden);
  check(hidden, "current version does not show the update card");
  await close(page);
}
{
  const raw = JSON.stringify(db({ name: "小红" }));
  const page = await openPage({ storage: [["danci.v1", raw], ["danci.appv", "danci-v18"]] });
  await page.click("#updHomeGo");
  await page.waitForNavigation({ waitUntil: "domcontentloaded", timeout: 8000 }).catch(() => {});
  await page.waitForFunction(() => document.getElementById("heroT") && document.getElementById("heroT").textContent.length > 0);
  const after = await page.evaluate(() => ({
    hidden: document.getElementById("updHome").hidden,
    extra: JSON.parse(localStorage.getItem("danci.v1")).prog.b0.extra,
    name: JSON.parse(localStorage.getItem("danci.v1")).name
  }));
  check(after.hidden && after.extra === "keep" && after.name === "小红", "立即更新 reloads without wiping records");
  check(page.__hits.length === 0, "tapping update with sync=off sends nothing");
  await close(page);
}

// 普通用户走一遍复习：听完 → 看答案 → 选白话按钮 → 继续 → 下一张 → 完成。
{
  const raw = JSON.stringify(db({
    name: "小红",
    created: Date.now() - 2 * DAY,
    prog: {
      "jh:i": { n: 1, iv: 1, ef: 2.5, due: 1, lap: 0, first: 1, last: 1, extra: "keep" },
      "jh:and": { n: 1, iv: 1, ef: 2.5, due: 2, lap: 0, first: 1, last: 1, extra: "keep" }
    }
  }));
  const page = await openPage({ dark: true, storage: [["danci.v1", raw], ["danci.appv", "danci-v18"]] });
  await page.waitForFunction(() => document.getElementById("dueN").textContent !== "0", { timeout: 8000 });
  await page.evaluate(() => {
    document.getElementById("moreBox").open = true;
    document.getElementById("goReview").scrollIntoView({ block: "center" });
    document.getElementById("goReview").click();
  });
  await page.waitForFunction(() => document.getElementById("study").classList.contains("on") && document.getElementById("reveal"));
  const front = await page.evaluate(() => ({
    word: document.querySelector("#sBody .word").textContent,
    lab: document.querySelector("#sBody .wordlab").textContent,
    quit: document.getElementById("sQuit").textContent,
    count: document.getElementById("sCount").textContent,
    reveal: document.getElementById("reveal").textContent,
    hint: document.body.innerText,
    next: !!document.getElementById("cardNext")
  }));
  check(front.word === "I" && front.lab === "单词", "first card shows the word, not a stray bar: " + front.word);
  check(front.reveal === "看答案" && front.hint.includes("看答案") && !front.next, "before the answer, the way forward is 看答案");
  check(front.quit.includes("退出") && /第\s*1\s*个/.test(front.count), "quit is 退出 and progress is a count, not a button: " + front.quit + " / " + front.count);
  check((await page.$eval("#recGo", (el) => el.textContent)) === "开始录音", "record control is present before answering");
  await page.click("#recGo");
  await page.waitForFunction(() => /麦克风|不能录音|只听示范|不打分/.test(document.getElementById("recMsg").textContent), { timeout: 8000 });
  const recText = await page.$eval("#recMsg", (el) => el.textContent);
  check(/麦克风|不能录音|只听示范|不打分|可以拒绝/.test(recText) && !/\d+\s*%/.test(recText), "headless mic request is explained without a fake score: " + recText);
  await shot(page, "study_step_listen.png");
  const before = JSON.parse(await page.evaluate(() => localStorage.getItem("danci.v1"))).prog["jh:i"].n;
  await page.click("#reveal");
  await page.waitForSelector("#cardNext");
  await page.setViewport({ width: 375, height: 667, deviceScaleFactor: 2 });
  const lay = await page.evaluate(() => {
    const body = document.getElementById("sBody");
    const foot = document.getElementById("sFoot");
    const word = body.querySelector(".word");
    const ans = body.querySelector(".ans");
    body.scrollTop = 0;
    const br = body.getBoundingClientRect();
    const fr = foot.getBoundingClientRect();
    const wr = word.getBoundingClientRect();
    const ar = ans.getBoundingClientRect();
    const cn = ans.querySelector(".gcn").getBoundingClientRect();
    const btns = Array.from(document.querySelectorAll(".grades button"));
    const tops = btns.map((b) => Math.round(b.getBoundingClientRect().top));
    body.scrollTop = body.scrollHeight;
    const ex = ans.querySelector(".ex").getBoundingClientRect();
    const br2 = body.getBoundingClientRect();
    body.scrollTop = 0;
    return {
      gap: Math.round(fr.top - br.bottom),
      wordSeen: wr.bottom > br.top && wr.top < br.bottom,
      glossSeen: cn.top >= br.top - 1 && cn.bottom <= br.bottom + 1,
      exReach: ex.top < br2.bottom && ex.bottom > br2.top,
      row: Math.max.apply(null, tops) - Math.min.apply(null, tops) < 12,
      h: Math.round(btns[0].getBoundingClientRect().height),
      word: word.textContent
    };
  });
  check(lay.gap >= -1 && lay.wordSeen && lay.glossSeen && lay.exReach && lay.row && lay.h >= 44 && lay.word === "I", "375x667 shows the word and gloss, example scrolls clear of the footer: " + JSON.stringify(lay));
  const back = await page.evaluate(() => ({
    labels: Array.from(document.querySelectorAll("#sFoot button[data-q]")).map((b) => b.textContent),
    nextDisabled: document.getElementById("cardNext").disabled,
    nextText: document.getElementById("cardNext").textContent,
    hint: document.getElementById("gradeHint").textContent,
    meaning: document.body.innerText
  }));
  check(back.labels.join("|").includes("不熟悉") && back.labels.join("|").includes("有点难") && back.labels.join("|").includes("记住了") && back.labels.join("|").includes("很熟"), "grade buttons are plain words: " + back.labels.join(" / "));
  check(!back.labels.join("|").includes("模糊") && !back.hint.includes("认识程度"), "no vague 记得程度 wording");
  check(back.nextDisabled && back.nextText === "继续" && back.meaning.includes("我"), "继续 stays disabled until a choice, answer is visible");
  await shot(page, "study_step_answer.png");
  await page.click('button[data-q="2"]');
  const picked = await page.evaluate(() => ({
    n: JSON.parse(localStorage.getItem("danci.v1")).prog["jh:i"].n,
    on: document.querySelector("button[data-q='2']").classList.contains("picked"),
    disabled: document.getElementById("cardNext").disabled,
    text: document.getElementById("cardNext").textContent,
    still: document.querySelector("#sBody .word").textContent
  }));
  check(picked.n === before && picked.on && !picked.disabled && picked.text === "继续" && picked.still === "I", "choosing 记住了 does not advance or reschedule yet");
  await shot(page, "study_step_continue.png");
  await page.click("#cardNext");
  await page.waitForFunction(() => {
    const w = document.querySelector("#sBody .word");
    return w && w.textContent === "and" && document.getElementById("reveal");
  });
  const second = await page.evaluate(() => ({
    word: document.querySelector("#sBody .word").textContent,
    n: JSON.parse(localStorage.getItem("danci.v1")).prog["jh:i"].n,
    count: document.getElementById("sCount").textContent
  }));
  check(second.word === "and" && second.n === before + 1, "继续 goes to the next word and records the grade once");
  await shot(page, "study_step_next.png");
  await page.click("#reveal");
  await page.waitForSelector("#cardNext");
  await page.click('button[data-q="2"]');
  const fin = await page.$eval("#cardNext", (el) => ({ disabled: el.disabled, text: el.textContent }));
  check(!fin.disabled && fin.text === "完成", "last card says 完成");
  await page.click("#cardNext");
  await page.waitForSelector("#sEnd");
  const done = await page.evaluate(() => document.getElementById("sBody").innerText);
  check(done.includes("复习") || done.includes("WIN") || done.includes("K.O.") || done.includes("PERFECT") || done.includes("ROUND"), "session finishes on a result screen: " + done.slice(0, 40));
  await shot(page, "study_step_done.png");
  const endProg = JSON.parse(await page.evaluate(() => localStorage.getItem("danci.v1"))).prog;
  check(endProg["jh:i"].extra === "keep" && endProg["jh:and"].extra === "keep", "walk did not drop stored fields");
  const nBeforeQuiz = endProg["jh:i"].n;
  await page.click("#sQuiz");
  await page.waitForSelector("#drillOpts");
  const gloss = await page.evaluate(() => ({
    label: document.body.innerText.includes("词义"),
    disabled: document.getElementById("drillOk").disabled,
    opts: Array.from(document.querySelectorAll("#drillOpts button")).map((b) => b.textContent)
  }));
  check(gloss.label && gloss.disabled && gloss.opts.length >= 2 && new Set(gloss.opts).size === gloss.opts.length, "quiz is multiple choice with 词义 and no duplicate options: " + gloss.opts.join(","));
  await shot(page, "quiz_prompt.png");
  await page.evaluate(() => document.getElementById("drillOk").click());
  check(gloss.disabled, "check stays disabled until an option is chosen");
  await page.evaluate(() => {
    var buttons = Array.from(document.querySelectorAll("#drillOpts button"));
    var bad = buttons.filter((b) => b.textContent.trim().toLowerCase() !== "i")[0];
    bad.click();
  });
  await page.click("#drillOk");
  const wrong = await page.evaluate(() => ({ res: document.getElementById("drillRes").textContent, n: JSON.parse(localStorage.getItem("danci.v1")).prog["jh:i"].n }));
  check(wrong.res.includes("不对") && wrong.res.indexOf("I") >= 0 && wrong.n === nBeforeQuiz, "wrong choice shows the answer and does not restudy");
  await page.click("#drillNext");
  await page.waitForSelector("#drillOpts");
  await page.evaluate(() => {
    var b = Array.from(document.querySelectorAll("#drillOpts button")).filter((x) => x.textContent.trim().toLowerCase() === "and")[0];
    if (!b) throw new Error("missing and");
    b.click();
  });
  await page.click("#drillOk");
  const right = await page.$eval("#drillRes", (el) => el.textContent);
  check(right.includes("正确"), "choosing the right word is accepted: " + right);
  await page.click("#drillNext");
  await page.waitForSelector("#sEnd");
  const summary = await page.$eval("#sBody", (el) => el.innerText);
  check(summary.includes("对了") && summary.includes("不改变复习计划"), "quiz result is local and says the plan is unchanged");
  await shot(page, "quiz_result.png");
  const nAfter = JSON.parse(await page.evaluate(() => localStorage.getItem("danci.v1"))).prog["jh:i"].n;
  check(nAfter === nBeforeQuiz, "quiz does not change the review count");
  await page.click("#sEnd");
  await page.waitForFunction(() => !document.getElementById("study").classList.contains("on"));
  check(page.__hits.length === 0, "study walk with sync=off sends nothing: " + page.__hits.join(","));
  check(page.__errors.length === 0, "no page errors in study walk: " + page.__errors.join(" | "));
  await close(page);
}
{
  const page = await openPage({
    noMic: true,
    storage: [["danci.v1", JSON.stringify(db({ name: "小红", prog: { b0: { n: 1, iv: 1, ef: 2.5, due: 1, lap: 0, first: 1, last: 1, extra: "keep" } } }))], ["danci.appv", "danci-v20"]]
  });
  await page.evaluate(() => document.getElementById("goReview").click());
  await page.waitForSelector("#recMsg");
  const t = await page.$eval("#recMsg", (el) => el.textContent);
  check(t.includes("不能录音") && t.includes("不给发音打分"), "unsupported recorder explains itself: " + t);
  check(JSON.parse(await page.evaluate(() => localStorage.getItem("danci.v1"))).prog.b0.n === 1, "unsupported recorder does not change progress");
  await close(page);
}

// 喇叭：真实音频缓冲起播。系统 TTS 抛错也不算成功。失败必须能看见。
{
  const raw = JSON.stringify(db({
    name: "小红",
    created: Date.now() - 2 * DAY,
    prog: {
      "jh:i": { n: 1, iv: 1, ef: 2.5, due: 1, lap: 0, first: 1, last: 1, extra: "keep" },
      "jh:and": { n: 1, iv: 1, ef: 2.5, due: 2, lap: 0, first: 1, last: 1, extra: "keep" }
    }
  }));
  const page = await openPage({ storage: [["danci.v1", raw], ["danci.appv", "danci-v24"]] });
  await page.waitForFunction(() => document.getElementById("dueN").textContent !== "0", { timeout: 8000 });
  const tune = await page.evaluate(() => {
    function f0(bytes) {
      const u8 = bytes instanceof Uint8Array ? bytes : Uint8Array.from(bytes);
      const view = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
      let off = 12, rate = 22050, ch = 1, bits = 16, dataOff = 0, dataLen = 0;
      while (off + 8 <= u8.length) {
        const id = String.fromCharCode(u8[off], u8[off + 1], u8[off + 2], u8[off + 3]);
        const size = view.getUint32(off + 4, true);
        if (id === "fmt ") { ch = view.getUint16(off + 10, true); rate = view.getUint32(off + 12, true); bits = view.getUint16(off + 22, true); }
        else if (id === "data") { dataOff = off + 8; dataLen = size; break; }
        off += 8 + size + (size & 1);
      }
      const n = Math.floor(dataLen / (ch * (bits / 8)));
      const pcm = new Float32Array(n);
      for (let i = 0; i < n; i++) pcm[i] = view.getInt16(dataOff + i * ch * 2, true) / 32768;
      const win = Math.floor(rate * 0.04), hop = Math.floor(rate * 0.02);
      const found = [];
      for (let s = 0; s + win < n; s += hop) {
        let e = 0;
        for (let i = 0; i < win; i += 2) e += pcm[s + i] * pcm[s + i];
        if (Math.sqrt(e / (win / 2)) < 0.04) continue;
        let best = 0, bestL = 0;
        for (let L = Math.floor(rate / 320); L <= Math.floor(rate / 70); L++) {
          let c = 0;
          for (let i = 0; i < win - L; i += 2) c += pcm[s + i] * pcm[s + i + L];
          if (c > best) { best = c; bestL = L; }
        }
        if (bestL) found.push(rate / bestL);
      }
      found.sort((a, b) => a - b);
      return found.length ? found[Math.floor(found.length / 2)] : 0;
    }
    const word = "environment";
    const tuned = meSpeak.speak(word, { voice: "en/en-rp", speed: 158, pitch: 68, wordgap: 2, amplitude: 90, rawdata: "array" });
    const old = meSpeak.speak(word, { voice: "en/en-rp", speed: 158, pitch: 50, wordgap: 0, amplitude: 100, rawdata: "array" });
    return { tuned: Math.round(f0(tuned)), old: Math.round(f0(old)), tunedBytes: tuned.length, oldBytes: old.length };
  });
  check(tune.old > 70 && tune.tuned > tune.old + 10 && tune.tunedBytes > 1000, "higher pitch raises the real waveform, not a fake event: " + JSON.stringify(tune));
  const hooked = await page.evaluate(() => {
    window.__ttsCalls = 0;
    window.__audioStarts = [];
    window.__audioStops = 0;
    try {
      const synth = window.speechSynthesis;
      synth.speak = function () { window.__ttsCalls++; throw new Error("tts blocked"); };
      synth.cancel = function () { window.__ttsCalls++; };
    } catch (e) { return String(e); }
    const origStart = AudioBufferSourceNode.prototype.start;
    const origStop = AudioBufferSourceNode.prototype.stop;
    AudioBufferSourceNode.prototype.start = function () {
      const b = this.buffer;
      let peak = 0, hash = 0;
      if (b && b.length) {
        const d = b.getChannelData(0);
        for (let i = 0; i < d.length; i += 17) {
          const a = d[i] < 0 ? -d[i] : d[i];
          if (a > peak) peak = a;
          hash = (Math.imul(hash, 33) + ((d[i] * 1000) | 0)) | 0;
        }
      }
      window.__audioStarts.push({
        duration: b ? b.duration : 0,
        samples: b ? b.length : 0,
        rate: b ? b.sampleRate : 0,
        peak, hash
      });
      return origStart.apply(this, arguments);
    };
    AudioBufferSourceNode.prototype.stop = function () {
      window.__audioStops++;
      return origStop.apply(this, arguments);
    };
    window.__audioStartWrapped = AudioBufferSourceNode.prototype.start;
    window.__real = () => window.__audioStarts.filter((s) => s.duration >= 0.4 && s.peak >= 0.05 && s.samples > 1000 && s.rate === 22050);
    return "ok";
  });
  check(hooked === "ok", "audio buffer spy installed: " + hooked);
  const auto = await page.evaluate(() => {
    window.__audioStarts.length = 0;
    document.getElementById("goReview").click();
    const say = document.querySelector("#sBody .say");
    const top = document.getElementById("sSay2");
    const sr = say.getBoundingClientRect();
    const tr = top.getBoundingClientRect();
    const real = window.__real();
    return {
      real,
      tts: window.__ttsCalls,
      on: say.classList.contains("speaking"),
      sayH: Math.round(sr.height),
      sayW: Math.round(sr.width),
      topH: Math.round(tr.height),
      topW: Math.round(tr.width),
      text: say.textContent,
      word: document.querySelector("#sBody .word").textContent
    };
  });
  check(auto.word === "I" && auto.real.length >= 1 && auto.real[0].peak >= 0.05 && auto.tts === 0, "auto read starts a real buffer without system TTS: " + JSON.stringify(auto.real[0]) + " tts=" + auto.tts);
  check(auto.on && auto.text.includes("听示范"), "听示范 shows it is speaking");
  check(auto.sayH >= 44 && auto.sayW >= 44 && auto.topH >= 44 && auto.topW >= 44, "speaker targets are at least 44px: " + auto.sayH + "x" + auto.sayW + " / " + auto.topH + "x" + auto.topW);
  const again = await page.evaluate(() => {
    window.__audioStarts.length = 0;
    window.__audioStops = 0;
    const say = document.querySelector("#sBody .say");
    say.click();
    say.click();
    return { real: window.__real(), stops: window.__audioStops, on: say.classList.contains("speaking") };
  });
  check(again.real.length >= 2 && again.stops >= 1 && again.on, "second tap stops the previous buffer and starts another: " + JSON.stringify(again));
  const ex = await page.evaluate(() => {
    document.getElementById("reveal").click();
    const b = document.querySelector(".ans .ex button");
    const r = b.getBoundingClientRect();
    window.__audioStarts.length = 0;
    b.click();
    const real = window.__real();
    return { h: Math.round(r.height), w: Math.round(r.width), on: b.classList.contains("speaking"), dur: real[0] && real[0].duration, n: real.length, text: b.parentElement.textContent };
  });
  check(ex.h >= 44 && ex.w >= 44 && ex.on && ex.n >= 1 && ex.dur > 1 && ex.text.includes("I am"), "example speaker plays the sentence buffer: " + JSON.stringify(ex));
  const failed = await page.evaluate(() => {
    const wrapped = window.__audioStartWrapped;
    AudioBufferSourceNode.prototype.start = function () { throw new Error("blocked"); };
    const say = document.querySelector("#sBody .say");
    say.click();
    const out = { toast: document.getElementById("toast").textContent, on: say.classList.contains("speaking") };
    AudioBufferSourceNode.prototype.start = wrapped;
    return out;
  });
  check(failed.toast.includes("朗读没有开始") && !failed.on, "a failed speak is visible and not left looking successful: " + failed.toast + " on=" + failed.on);
  const nBefore = JSON.parse(await page.evaluate(() => localStorage.getItem("danci.v1"))).prog["jh:i"].n;
  const mic = await page.evaluate(async () => {
    window.__tracks = [];
    navigator.mediaDevices.getUserMedia = () => {
      const track = { stop() { track.stopped = true; } };
      window.__tracks.push(track);
      return Promise.resolve({ getTracks() { return [track]; } });
    };
    window.MediaRecorder = class {
      constructor() { this.state = "inactive"; this.mimeType = "audio/webm"; }
      start() { this.state = "recording"; }
      stop() { this.state = "inactive"; const rec = this; setTimeout(() => rec.onstop && rec.onstop(), 0); }
    };
    window.Audio = class {
      constructor(url) { this.src = url; }
      play() { window.__played = this.src; return Promise.resolve(); }
    };
    document.getElementById("recGo").click();
    await new Promise((r) => setTimeout(r, 30));
    const recording = document.getElementById("recMsg").textContent;
    window.__audioStarts.length = 0;
    document.querySelector("#sBody .say").click();
    await new Promise((r) => setTimeout(r, 30));
    const after = {
      recording,
      stopped: window.__tracks[0] && window.__tracks[0].stopped,
      said: window.__real().length,
      msg: document.getElementById("recMsg").textContent
    };
    document.getElementById("recMine").click();
    await new Promise((r) => setTimeout(r, 20));
    after.played = window.__played || "";
    after.playMsg = document.getElementById("recMsg").textContent;
    return after;
  });
  check(mic.recording.includes("正在录音") && mic.stopped && mic.said > 0, "after the mic starts, 听示范 stops the track and still speaks: " + JSON.stringify(mic));
  check(mic.played.startsWith("blob:") && mic.playMsg.includes("正在播放刚才的录音") && mic.playMsg.includes("不上传"), "听我的 plays the local clip only: " + mic.playMsg);
  const nAfter = JSON.parse(await page.evaluate(() => localStorage.getItem("danci.v1"))).prog["jh:i"].n;
  check(nAfter === nBefore, "listening does not change the review count");
  const dict = await page.evaluate(() => {
    document.getElementById("sQuit").click();
    const sel = document.getElementById("prSrc");
    sel.value = "p:learned";
    sel.dispatchEvent(new Event("change"));
    window.__audioStarts.length = 0;
    document.getElementById("goDict").click();
    const auto = window.__real();
    window.__audioStarts.length = 0;
    const slowBtn = document.getElementById("dictSlow");
    slowBtn.click();
    const slow = window.__real();
    return {
      auto: auto[0] && auto[0].duration,
      slow: slow[0] && slow[0].duration,
      on: slowBtn.classList.contains("speaking"),
      n: JSON.parse(localStorage.getItem("danci.v1")).prog["jh:i"].n
    };
  });
  check(dict.auto >= 0.4 && dict.slow > dict.auto * 1.2 && dict.on && dict.n === nBefore, "dictation plays locally and slow is longer: " + JSON.stringify(dict));
  await page.evaluate(() => document.getElementById("sQuit").click());
  await page.waitForFunction(() => !document.getElementById("study").classList.contains("on"));
  await page.evaluate(() => document.querySelector('.tabs button[data-v="set"]').click());
  await page.waitForSelector("#testVoice");
  const voice = await page.evaluate(() => {
    window.__audioStarts.length = 0;
    const b = document.getElementById("testVoice");
    const r = b.getBoundingClientRect();
    b.click();
    const preview = window.__real();
    window.__audioStarts.length = 0;
    document.querySelector('#setAccent button[data-v="en-US"]').click();
    const us = window.__real()[0];
    window.__audioStarts.length = 0;
    document.querySelector('#setAccent button[data-v="en-GB"]').click();
    const gb = window.__real()[0];
    window.__audioStarts.length = 0;
    document.querySelector('#setRate button[data-v="0.75"]').click();
    const slower = window.__real()[0];
    window.__audioStarts.length = 0;
    document.querySelector('#setRate button[data-v="1"]').click();
    const faster = window.__real()[0];
    return {
      h: Math.round(r.height),
      on: b.classList.contains("speaking"),
      preview: preview[0] && preview[0].duration,
      us, gb, slower, faster,
      tts: window.__ttsCalls
    };
  });
  check(voice.h >= 44 && voice.on && voice.preview > 1, "settings preview starts the practice sentence: " + voice.preview);
  check(voice.us && voice.gb && (voice.us.hash !== voice.gb.hash || voice.us.samples !== voice.gb.samples), "British and American buffers differ: " + voice.gb.samples + " vs " + voice.us.samples);
  check(voice.slower && voice.faster && voice.slower.duration > voice.faster.duration * 1.15, "slower rate makes a longer buffer: " + voice.slower.duration + " > " + voice.faster.duration);
  check(voice.tts === 0, "system TTS was never called");
  await page.setOfflineMode(true);
  const offline = await page.evaluate(() => {
    window.__audioStarts.length = 0;
    const b = document.getElementById("testVoice");
    b.click();
    return { n: window.__real().length, on: b.classList.contains("speaking") };
  });
  check(offline.n >= 1 && offline.on, "offline replay still starts the local buffer");
  await page.setOfflineMode(false);
  await shot(page, "speak_settings.png");
  check(page.__hits.length === 0, "speak walk sends nothing: " + page.__hits.join(","));
  check(page.__errors.length === 0, "no page errors in speak walk: " + page.__errors.join(" | "));
  await close(page);
}
{
  const page = await openPage({
    storage: [["danci.v1", JSON.stringify(db({
      name: "小红",
      prog: { "jh:i": { n: 1, iv: 1, ef: 2.5, due: 1, lap: 0, first: 1, last: 1, extra: "keep" } }
    }))], ["danci.appv", "danci-v24"]]
  });
  await page.evaluate(() => {
    window.__audioStarts = [];
    const origStart = AudioBufferSourceNode.prototype.start;
    AudioBufferSourceNode.prototype.start = function () {
      const b = this.buffer;
      let peak = 0;
      if (b && b.length) {
        const d = b.getChannelData(0);
        for (let i = 0; i < d.length; i += 17) peak = Math.max(peak, Math.abs(d[i]));
      }
      window.__audioStarts.push({ duration: b ? b.duration : 0, samples: b ? b.length : 0, peak, rate: b ? b.sampleRate : 0 });
      return origStart.apply(this, arguments);
    };
    window.__real = () => window.__audioStarts.filter((s) => s.duration >= 0.4 && s.peak >= 0.05 && s.samples > 1000);
    navigator.mediaDevices.getUserMedia = () => Promise.reject(new Error("denied"));
  });
  await page.waitForFunction(() => document.getElementById("dueN").textContent !== "0", { timeout: 8000 });
  await page.setViewport({ width: 375, height: 667, deviceScaleFactor: 2 });
  await page.evaluate(() => document.getElementById("goReview").click());
  await page.waitForSelector("#recGo");
  await page.click("#recGo");
  await page.waitForFunction(() => document.getElementById("recMsg").textContent.includes("没有使用麦克风"));
  const denied = await page.evaluate(() => {
    window.__audioStarts.length = 0;
    const say = document.querySelector("#sBody .say");
    say.click();
    const word = document.querySelector("#sBody .word");
    const box = word.getBoundingClientRect();
    return {
      msg: document.getElementById("recMsg").textContent,
      said: window.__real().length,
      on: say.classList.contains("speaking"),
      n: JSON.parse(localStorage.getItem("danci.v1")).prog["jh:i"].n,
      wordTop: box.top,
      wordH: box.height
    };
  });
  check(denied.msg.includes("可以只听示范") && denied.said >= 1 && denied.on && denied.n === 1, "denied mic still plays the demo buffer: " + JSON.stringify(denied));
  check(denied.wordTop >= 0 && denied.wordTop < 500 && denied.wordH > 10, "375x667 still shows the word");
  await shot(page, "speak_demo.png");
  await close(page);
}
{
  const page = await openPage({
    storage: [["danci.v1", JSON.stringify(db({
      name: "小红",
      custom: [{ id: "c1", w: "flibbertigibbet", cn: "自造词", ex: "A flibbertigibbet sat on the bench.", g: "我的生词" }],
      prog: { c1: { n: 2, iv: 3, ef: 2.5, due: 1, lap: 0, first: 1, last: 1, extra: "keep" } }
    }))], ["danci.appv", "danci-v24"]]
  });
  await page.evaluate(() => {
    window.__audioStarts = [];
    const origStart = AudioBufferSourceNode.prototype.start;
    AudioBufferSourceNode.prototype.start = function () {
      const b = this.buffer;
      let peak = 0;
      if (b && b.length) {
        const d = b.getChannelData(0);
        for (let i = 0; i < d.length; i += 17) peak = Math.max(peak, Math.abs(d[i]));
      }
      window.__audioStarts.push({ duration: b ? b.duration : 0, samples: b ? b.length : 0, peak });
      return origStart.apply(this, arguments);
    };
    window.__real = () => window.__audioStarts.filter((s) => s.duration >= 0.4 && s.peak >= 0.05 && s.samples > 1000);
  });
  await page.waitForFunction(() => document.getElementById("dueN").textContent !== "0", { timeout: 8000 });
  const custom = await page.evaluate(() => {
    window.__audioStarts.length = 0;
    document.getElementById("goReview").click();
    const word = document.querySelector("#sBody .word").textContent;
    const wordPlay = window.__real()[0];
    document.getElementById("reveal").click();
    window.__audioStarts.length = 0;
    document.querySelector(".ans .ex button").click();
    const exPlay = window.__real()[0];
    const saved = JSON.parse(localStorage.getItem("danci.v1"));
    return { word, wordDur: wordPlay && wordPlay.duration, exDur: exPlay && exPlay.duration, n: saved.prog.c1.n, extra: saved.prog.c1.extra, id: saved.custom[0].id };
  });
  check(custom.word === "flibbertigibbet" && custom.wordDur >= 0.4 && custom.exDur > custom.wordDur && custom.n === 2 && custom.extra === "keep" && custom.id === "c1", "a made-up word and its sentence both play, records unchanged: " + JSON.stringify(custom));
  check(page.__hits.length === 0, "custom-word audio sends nothing: " + page.__hits.join(","));
  await close(page);
}
{
  const page = await openPage({
    storage: [["danci.v1", JSON.stringify(db({
      name: "小红",
      custom: [{ id: "c1", w: "押金", cn: "没有英文", g: "我的生词" }],
      prog: { c1: { n: 2, iv: 3, ef: 2.5, due: 1, lap: 0, first: 1, last: 1, extra: "keep" } }
    }))], ["danci.appv", "danci-v24"]]
  });
  await page.evaluate(() => {
    window.__audioStarts = [];
    const origStart = AudioBufferSourceNode.prototype.start;
    AudioBufferSourceNode.prototype.start = function () {
      const b = this.buffer;
      window.__audioStarts.push({ duration: b ? b.duration : 0, samples: b ? b.length : 0 });
      return origStart.apply(this, arguments);
    };
  });
  await page.waitForFunction(() => document.getElementById("dueN").textContent !== "0", { timeout: 8000 });
  const quiet = await page.evaluate(() => {
    window.__audioStarts.length = 0;
    document.getElementById("goReview").click();
    const say = document.querySelector("#sBody .say");
    say.click();
    const saved = JSON.parse(localStorage.getItem("danci.v1"));
    return {
      word: document.querySelector("#sBody .word").textContent,
      toast: document.getElementById("toast").textContent,
      on: say.classList.contains("speaking"),
      starts: window.__audioStarts.length,
      n: saved.prog.c1.n
    };
  });
  check(quiet.word === "押金" && quiet.toast.includes("这个词没有示范音") && !quiet.on && quiet.starts === 0 && quiet.n === 2, "a word with no English letters says so instead of pretending to play: " + JSON.stringify(quiet));
  await close(page);
}

await browser.close();
if (failures.length) {
  console.error("\nFAILED " + failures.length);
  failures.forEach((f) => console.error(" - " + f));
  process.exit(1);
}
console.log("\nALL CHECKS PASSED");
