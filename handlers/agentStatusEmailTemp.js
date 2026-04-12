function generateAgentStatusEmail(name, statusText, invalidDocs = []) {
  const safeName = name || "Agent";

  const invalidListHtml =
    Array.isArray(invalidDocs) && invalidDocs.length > 0
      ? invalidDocs
          .map(
            (d) =>
              `<li><strong>${d.label}</strong>${d.reason ? ` - ${d.reason}` : ""}</li>`
          )
          .join("")
      : "<li>All submitted documents are verified.</li>";

  return `
    <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; background-color: #f4f7fc; margin: 0; padding: 0; }
          .container { max-width: 600px; margin: 30px auto; background-color: #ffffff; padding: 20px; border-radius: 8px; box-shadow: 0 4px 6px rgba(0,0,0,0.1); }
          .header { text-align: center; font-size: 22px; color: #333; margin-bottom: 10px; }
          .status { font-weight: bold; }
          ul { padding-left: 20px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">Agent KYC Update</div>
          <p>Dear ${safeName},</p>
          <p>Your KYC status has been updated to <span class="status">${statusText}</span>.</p>
          <p>The following documents are not valid or require attention:</p>
          <ul>
            ${invalidListHtml}
          </ul>
          <p>Please log in to your dashboard to view details and re-upload the required documents.</p>
          <p>Thank you.</p>
        </div>
      </body>
    </html>
  `;
}

module.exports = generateAgentStatusEmail;