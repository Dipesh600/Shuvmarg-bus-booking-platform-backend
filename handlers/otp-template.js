function generateOtpEmailContent(resetCode, name) {
  return `
      <html>
        <head>
          <style>
            body {
              font-family: Arial, sans-serif;
              margin: 0;
              padding: 0;
              background-color: #f4f7fc;
            }
            .container {
              max-width: 600px;
              margin: 30px auto;
              background-color: #ffffff;
              padding: 20px;
              border-radius: 8px;
              box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
            }
            .header {
              text-align: center;
              font-size: 24px;
              color: #333;
            }
            .content {
              font-size: 16px;
              color: #555;
              line-height: 1.5;
            }
            .otp-code {
              font-size: 32px;
              font-weight: bold;
              color: #4CAF50;
              text-align: center;
              margin-top: 20px;
            }
            .footer {
              text-align: center;
              font-size: 14px;
              color: #777;
              margin-top: 40px;
            }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              Email Verification Code
            </div>
            <div class="content">
              <p>Hello, ${name}</p>
              <p>We received a request to verify your email address. Please use the following OTP to complete the process:</p>
              <div class="otp-code">
                ${resetCode}
              </div>
              <p>If you didn't request this, please ignore this email.</p>
            </div>
            <div class="footer">
              <p>Thank you for using our service!</p>
            </div>
          </div>
        </body>
      </html>
    `;
}

module.exports = generateOtpEmailContent;