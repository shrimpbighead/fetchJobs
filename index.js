const fetch = require("node-fetch");
const cheerio = require("cheerio");
const Parser = require("rss-parser");
const nodemailer = require("nodemailer");
const fs = require("fs");
const path = require("path");

const { SMTP_USER, SMTP_PASS, TO_USER } = require("./env");

// ======================================================
// 通用工具
// ======================================================
async function fetchJSON(url) {
    const res = await fetch(url);
    return res.json();
}

async function fetchHTML(url) {
    const res = await fetch(url);
    return res.text();
}

async function sendMail(subject, text) {
    await transporter.sendMail({
        from: `"Monitor" <${SMTP_USER}>`,
        to: TO_USER,
        subject,
        text
    });
    console.log("📨 邮件已发送:", subject);
}

function matchKeywords(text, keywords) {
    return keywords.some(k => text.includes(k));
}

function loadIds(file) {
    if (!fs.existsSync(file)) return [];
    return fs.readFileSync(file, "utf8").split("\n").filter(Boolean);
}

function saveIds(file, ids, max) {
    fs.writeFileSync(file, ids.slice(0, max).join("\n"), "utf8");
}

const transporter = nodemailer.createTransport({
    host: "smtp.qq.com",
    port: 465,
    secure: true,
    auth: { user: SMTP_USER, pass: SMTP_PASS }
});

// ======================================================
// 通用处理器（所有任务共用）
// ======================================================
async function processTask(task) {
    console.log(`⏰ Checking: ${task.name}`);

    const savedIds = loadIds(task.dataFile);
    const list = await task.fetchList();
    const newIds = [];

    for (const item of list) {
        const id = task.getId(item);
        if (savedIds.includes(id)) continue;

        const title = task.getTitle(item);
        if (matchKeywords(title, task.keywords)) {
            const link = task.getLink(item);
            const body = await task.getBody(item);

            const mailTitle = `${task.name} ${title}`;
            const mailText =
                `标题：${title}\n\n` +
                (body ? `内容摘要：\n${body}\n\n` : "") +
                (link ? `链接：${link}\n` : "");

            await sendMail(mailTitle, mailText);
            // console.log(mailTitle, mailText,111);
            newIds.push(id);
        }
    }

    saveIds(task.dataFile, [...newIds, ...savedIds], task.maxSave);
    console.log(`✅ ${task.name} Done`);
}

// ======================================================
// 任务：只写配置，不写重复逻辑
// ======================================================
const parser = new Parser();

const tasks = [
    // ---------------------------
    // Eleduck
    // ---------------------------
    {
        name: "Eleduck",
        keywords: ["前端", "全栈"],
        dataFile: path.join(__dirname, "eleduck_ids.txt"),
        maxSave: 200,

        async fetchList() {
            let out = [];
            for (let p = 1; p <= 4; p++) {
                const json = await fetchJSON(
                    `https://svc.eleduck.com/api/v1/posts?sort=-published_at&page=${p}`
                );
                out = out.concat(json.posts || []);
            }
            return out;
        },

        getId: x => String(x.id),
        getTitle: x => x.full_title || x.title || "",
        getLink: x => `https://eleduck.com/posts/${x.id}`,

        async getBody(x) {
            const html = await fetchHTML(`https://eleduck.com/posts/${x.id}`);
            const $ = cheerio.load(html);
            return $(".post-contents .rich-content").text().trim();
        }
    },

    // ---------------------------
    // V2EX
    // ---------------------------
    {
        name: "V2EX",
        keywords: ["前端"],
        dataFile: path.join(__dirname, "v2ex_ids.txt"),
        maxSave: 300,

        rss: [
            "https://www.v2ex.com/feed/remote.xml",
            "https://www.v2ex.com/feed/jobs.xml",
            "https://www.v2ex.com/feed/outsourcing.xml"
        ],

        async fetchList() {
            let all = [];
            for (const url of this.rss) {
                const feed = await parser.parseURL(url);
                all = all.concat(feed.items);
            }
            return all;
        },

        getId: x => x.id || x.link,
        getTitle: x => x.title,
        getLink: x => x.link,
        getBody: x => x.contentSnippet || ""
    },

    // ---------------------------
    // GitHub Issues
    // ---------------------------
    {
        name: "GitHub Issues",
        keywords: ["前端", "全栈"],
        dataFile: path.join(__dirname, "github_ids.txt"),
        maxSave: 300,
        repo: "rebase-network/who-is-hiring",

        async fetchList() {
            return await fetchJSON(
                `https://api.github.com/repos/${this.repo}/issues?state=open`
            );
        },

        getId: x => String(x.id),
        getTitle: x => x.title,
        getLink: x => x.html_url,
        getBody: x => (x.body || "")
    }
];

// ======================================================
// 启动调度
// ======================================================
async function runAll() {
    for (const t of tasks) {
        await processTask(t);
    }
}

console.log("🚀 监控系统已启动，每小时运行一次");
runAll();
setInterval(runAll, 60 * 60 * 1000);
