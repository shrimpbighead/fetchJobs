const fetch = require("node-fetch"); // Node 16
const cheerio = require("cheerio");
const Parser = require('rss-parser');
const nodemailer = require("nodemailer");
const fs = require("fs");
const path = require("path");

// --------------------------------------------
// 配置
// --------------------------------------------
const { SMTP_USER, SMTP_PASS, TO_USER } = require('./env');

const CHECK_INTERVAL = 60 * 60 * 1000; // 1 小时
const MAX_SAVED_IDS_ELEDUCK = 200;
const MAX_SAVED_IDS_V2EX = 300;

const ELEDUCK_DATA_FILE = path.join(__dirname, "eleduck_ids.txt");
const V2EX_DATA_FILE = path.join(__dirname, "v2ex_ids.txt");

const V2EX_RSS_URLS = [
    'https://www.v2ex.com/feed/remote.xml',
    'https://www.v2ex.com/feed/jobs.xml',
    'https://www.v2ex.com/feed/outsourcing.xml'
];

// 创建 nodemailer transporter
const transporter = nodemailer.createTransport({
    host: "smtp.qq.com",
    port: 465,
    secure: true,
    auth: { user: SMTP_USER, pass: SMTP_PASS },
});
console.log(SMTP_USER,SMTP_PASS,111);
// --------------------------------------------
// 工具函数
// --------------------------------------------
function loadSavedIds(file) {
    if (!fs.existsSync(file)) return [];
    return fs.readFileSync(file, "utf8").split("\n").filter(Boolean);
}

function saveIds(file, ids, max) {
    fs.writeFileSync(file, ids.slice(0, max).join("\n"), "utf8");
}

async function sendMail(subject, text) {
    await transporter.sendMail({
        from: `"Monitor" <${SMTP_USER}>`,
        to: TO_USER,
        subject,
        text
    });
    console.log("📨 已发送邮件:", subject);
}

// --------------------------------------------
// Eleduck 监控
// --------------------------------------------
function containsEleduckKeyword(title) {
    return title.includes("前端") || title.includes("全栈");
}

async function fetchEleduckList(page = 1) {
    const url = `https://svc.eleduck.com/api/v1/posts?sort=-published_at&page=${page}`;
    const res = await fetch(url);
    const json = await res.json();
    return json?.posts || [];
}

async function fetchEleduckDetail(id) {
    const url = `https://eleduck.com/posts/${id}`;
    const res = await fetch(url);
    const html = await res.text();
    const $ = cheerio.load(html);

    const title = $("h1.page-title").clone().children().remove().end().text().trim();
    const content = $(".post-contents .rich-content").text().trim();
    return { title, content };
}

async function checkEleduckUpdates() {
    console.log("⏰ 检查 Eleduck 新文章...");
    const savedIds = loadSavedIds(ELEDUCK_DATA_FILE);
    const newIds = [];
    let foundNew = false;

    for (let p = 1; p <= 4; p++) {
        const list = await fetchEleduckList(p);
        for (const item of list) {
            const id = item.id;
            const title = item.full_title || item.title || "";
            if (savedIds.includes(id)) continue;

            if (containsEleduckKeyword(title)) {
                const detail = await fetchEleduckDetail(id);
                const mailText =
                    `标题：${detail.title}\n\n正文：\n${detail.content}\n\n原文链接：https://eleduck.com/posts/${id}`;
                await sendMail('Eleduck ' + detail.title, mailText);
                newIds.push(id);
                foundNew = true;
            }
        }
    }

    const allIds = [...newIds, ...savedIds].slice(0, MAX_SAVED_IDS_ELEDUCK);
    saveIds(ELEDUCK_DATA_FILE, allIds, MAX_SAVED_IDS_ELEDUCK);

    if (!foundNew) console.log("✨ Eleduck 没有新文章");
    else console.log("✅ Eleduck 新文章已处理完毕");
}

// --------------------------------------------
// V2EX 监控
// --------------------------------------------
async function checkV2EXUpdates() {
    console.log("⏰ 检查 V2EX 新帖子...");
    const parser = new Parser();
    const savedIds = loadSavedIds(V2EX_DATA_FILE);
    const newIds = [];

    for (const url of V2EX_RSS_URLS) {
        const feed = await parser.parseURL(url);

        for (const item of feed.items) {
            const id = item.id || item.link;
            const title = item.title || '';
            if (savedIds.includes(id)) continue;

            if (title.includes("前端")) {
                const mailText = `${title}\n\n链接: ${item.link}\n\n${item.contentSnippet || ''}`;
                await sendMail('V2EX ' + title, mailText);
                newIds.push(id);
            }
        }
    }

    const allIds = [...newIds, ...savedIds];
    saveIds(V2EX_DATA_FILE, allIds, MAX_SAVED_IDS_V2EX);

    console.log("✅ V2EX 本次检查完成");
}

// --------------------------------------------
// 启动定时器
// --------------------------------------------
async function checkAll() {
    await checkEleduckUpdates();
    await checkV2EXUpdates();
}

console.log("🚀 监控已启动，每小时执行一次");
checkAll(); // 先执行一次
setInterval(checkAll, CHECK_INTERVAL);
