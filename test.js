
// --------------------------------------------
const { SMTP_USER, SMTP_PASS } = require('./env');
const nodemailer = require("nodemailer");

// 创建 nodemailer transporter
const transporter = nodemailer.createTransport({
    host: "smtp.qq.com",
    port: 465,
    secure: true,
    auth: { user: SMTP_USER, pass: SMTP_PASS },
});
console.log(SMTP_USER,SMTP_PASS,111);


async function sendMail(subject, text) {
    await transporter.sendMail({
        from: `"Monitor" <${SMTP_USER}>`,
        to: "857763541@qq.com",
        subject,
        text
    });
    console.log("📨 已发送邮件:", subject);
}
sendMail('xxxx','ccccccccc')