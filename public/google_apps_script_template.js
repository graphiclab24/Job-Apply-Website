/**
 * BD Job Apply - Google Apps Script Webhook (Zero Cost, 1M+ Scale)
 * 
 * Instructions:
 * 1. Open Google Sheets (https://sheets.new)
 * 2. Create sheet tabs: "Applications" and "Settings"
 * 3. In the "Applications" tab, add header columns in Row 1:
 *    [Application ID, Submission Time, Applicant Name, Mobile, Job Title, Post Name, District, Education, Total Fee, TrxID, Sender Mobile, Status, Soft Copy Link, Paid Copy Link]
 * 4. Click "Extensions" -> "Apps Script"
 * 5. Paste this entire code into the editor
 * 6. Click "Deploy" -> "New deployment"
 * 7. Select type: "Web app"
 * 8. Configuration:
 *    - Description: BD Job Apply Webhook
 *    - Execute as: Me
 *    - Who has access: Anyone (Important: so your server can POST)
 * 9. Click "Deploy", copy the "Web app URL" (e.g., https://script.google.com/macros/s/.../exec)
 * 10. Paste this URL in your BDJobApply Admin Panel under "Google Sheets Webhook Settings"!
 */

function doPost(e) {
  try {
    var rawData = e.postData.contents;
    var data = JSON.parse(rawData);
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getSheetByName("Applications");
    
    if (!sheet) {
      sheet = ss.insertSheet("Applications");
      sheet.appendRow([
        "Application ID", 
        "Submission Time", 
        "Applicant Name", 
        "Mobile", 
        "Job Title", 
        "Post Name", 
        "District", 
        "Education", 
        "Total Fee", 
        "TrxID", 
        "Sender Mobile", 
        "Status", 
        "Soft Copy Link", 
        "Paid Copy Link"
      ]);
    }
    
    // Check if it's a status update
    if (data.action === "update_status" && data.id) {
      var rows = sheet.getDataRange().getValues();
      for (var i = 1; i < rows.length; i++) {
        if (rows[i][0] == data.id) {
          if (data.status) sheet.getRange(i + 1, 12).setValue(data.status);
          if (data.softCopyUrl) sheet.getRange(i + 1, 13).setValue(data.softCopyUrl);
          if (data.paidCopyUrl) sheet.getRange(i + 1, 14).setValue(data.paidCopyUrl);
          return ContentService.createTextOutput(JSON.stringify({ success: true, message: "Status updated" }))
            .setMimeType(ContentService.MimeType.JSON);
        }
      }
    }
    
    // Append new application row
    var row = [
      data.id || ("APL-" + Utilities.formatDate(new Date(), "GMT+6", "yyMMdd") + "-" + Math.floor(1000 + Math.random() * 9000)),
      Utilities.formatDate(new Date(), "GMT+6", "yyyy-MM-dd HH:mm:ss"),
      data.fullName || "",
      data.smsNumber || data.mobile || "",
      data.jobTitle || "",
      data.postName || "",
      data.district || "",
      data.educationLevel || "",
      (data.fee ? data.fee.total : 0),
      (data.payment ? data.payment.trxId : ""),
      (data.payment ? data.payment.senderNumber : ""),
      data.status || "waiting",
      data.softCopyUrl || "",
      data.paidCopyUrl || ""
    ];
    
    sheet.appendRow(row);
    
    return ContentService.createTextOutput(JSON.stringify({ 
      success: true, 
      id: row[0],
      message: "Application recorded successfully in Google Sheet" 
    })).setMimeType(ContentService.MimeType.JSON);
    
  } catch (error) {
    return ContentService.createTextOutput(JSON.stringify({ 
      success: false, 
      error: error.toString() 
    })).setMimeType(ContentService.MimeType.JSON);
  }
}

function doGet(e) {
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getSheetByName("Applications");
    if (!sheet) {
      return ContentService.createTextOutput(JSON.stringify({ applications: [] }))
        .setMimeType(ContentService.MimeType.JSON);
    }
    
    var rows = sheet.getDataRange().getValues();
    var applications = [];
    
    // Skip header row
    for (var i = 1; i < rows.length; i++) {
      var r = rows[i];
      if (!r[0]) continue;
      applications.push({
        id: r[0],
        createdAt: r[1],
        fullName: r[2],
        mobile: r[3],
        smsNumber: r[3],
        jobTitle: r[4],
        postName: r[5],
        district: r[6],
        educationLevel: r[7],
        fee: { total: r[8] },
        payment: { trxId: r[9], senderNumber: r[10] },
        status: r[11] || "waiting",
        softCopyUrl: r[12] || "",
        paidCopyUrl: r[13] || ""
      });
    }
    
    return ContentService.createTextOutput(JSON.stringify({ 
      success: true, 
      applications: applications 
    })).setMimeType(ContentService.MimeType.JSON);
    
  } catch (error) {
    return ContentService.createTextOutput(JSON.stringify({ 
      success: false, 
      error: error.toString() 
    })).setMimeType(ContentService.MimeType.JSON);
  }
}
