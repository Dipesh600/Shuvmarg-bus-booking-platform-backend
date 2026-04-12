const nodemailer = require("nodemailer");

const emailManager = async (to, subject, text) => {
    try {
        var transporter = nodemailer.createTransport({
            service: process.env.EMAIL_SERVICES,
            host: process.env.HOST,
            port: process.env.EMAIL_PORT,
            secure: true,
            auth: {
                user: process.env.USER_EMAIL,
                pass: process.env.USER_PASSWORD,
            },
        });

        await transporter.sendMail({
            from: "sumarg.com <otp@sumarg.com>",
            to: to,
            subject: subject,
            html: text,
        });
        console.log("Email sent successfully!");
    } catch (error) {
        console.error("Error while sending email:", error.message);
    }
};

module.exports = emailManager;