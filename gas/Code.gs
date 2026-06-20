/* ============================================================
 *  Google Apps Script — Backend ของแบบสอบถามความสนใจสาขา
 *  โรงเรียนอัสสัมชัญนครราชสีมา
 * ------------------------------------------------------------
 *  หน้าที่:
 *   - doPost(action="submit")  : บันทึก/อัปเดตคำตอบนักเรียนลง Sheet
 *   - doGet(action="list")     : ส่งข้อมูลทั้งหมดให้ Dashboard (ต้องมีรหัสผ่าน)
 *
 *  วิธีติดตั้งอยู่ในไฟล์ README.md (หัวข้อ "ตั้งค่า Google Apps Script")
 * ============================================================ */

// ===== ตั้งค่า =====
var PASSCODE   = "ACNAC1967";      // ต้องตรงกับ TEACHER_PASSCODE ใน config.js
var SHEET_NAME = "Responses";       // ชื่อชีตที่ใช้เก็บข้อมูล

// หัวคอลัมน์ของชีต (ลำดับสำคัญ)
var HEADERS = [
  "Timestamp", "รหัสนักเรียน", "ชื่อ-นามสกุล", "เลขที่", "ชั้น",
  "อันดับ1", "อันดับ2", "อันดับ3"
];

// 7 สาขา: code -> ชื่อภาษาไทย (ต้องตรงกับ config.js)
var PROGRAMS = {
  "health":  "สาขาวิทยาศาสตร์สุขภาพและการแพทย์",
  "preeng":  "สาขาเตรียมวิศวกรรม",
  "mgmtsci": "สาขาวิทยาศาสตร์การจัดการ",
  "biz":     "สาขาบริหารธุรกิจ",
  "digital": "สาขาสื่อดิจิทัลและนวัตกรรม",
  "comm":    "สาขานิเทศศาสตร์",
  "ep":      "English Program"
};

var CLASS_ORDER = ["3/1", "3/2", "3/3", "3/4", "3/5", "3/EP"];

/* ---------------- จุดรับ POST (บันทึกคำตอบ) ---------------- */
function doPost(e) {
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(20000); // กันเขียนชนกัน
    var body = JSON.parse(e.postData.contents);
    if (body.action !== "submit") return json({ ok: false, error: "unknown action" });

    var p = body.payload || {};

    // ตรวจข้อมูลพื้นฐาน
    if (!/^\d{5}$/.test(String(p.studentId || ""))) return json({ ok: false, error: "รหัสนักเรียนไม่ถูกต้อง" });
    if (!p.fullname || !p.classroom) return json({ ok: false, error: "ข้อมูลไม่ครบถ้วน" });
    if (CLASS_ORDER.indexOf(p.classroom) === -1) return json({ ok: false, error: "ห้องเรียนไม่ถูกต้อง" });
    if (!p.choice1 || !p.choice2 || !p.choice3) return json({ ok: false, error: "เลือกสาขาไม่ครบ 3 อันดับ" });

    var sheet = getSheet();
    var row = [
      new Date(),
      String(p.studentId),
      String(p.fullname),
      String(p.number),
      String(p.classroom),
      progName(p.choice1),
      progName(p.choice2),
      progName(p.choice3)
    ];

    // ถ้ามีรหัสนักเรียนนี้แล้ว -> อัปเดตแถวเดิม (กันซ้ำ)
    var existingRow = findRowByStudentId(sheet, String(p.studentId));
    var updated = false;
    if (existingRow > 0) {
      sheet.getRange(existingRow, 1, 1, row.length).setValues([row]);
      updated = true;
    } else {
      sheet.appendRow(row);
    }

    // อัปเดตแท็บแยกรายห้อง (เรียงเลขที่) อัตโนมัติ — ไม่ให้ error มากระทบการบันทึก
    try { rebuildAllClassSheets(sheet.getParent()); } catch (ignore2) {}

    return json({ ok: true, updated: updated });
  } catch (err) {
    return json({ ok: false, error: String(err) });
  } finally {
    try { lock.releaseLock(); } catch (ignore) {}
  }
}

/* ---------------- จุดรับ GET (อ่านข้อมูล Dashboard) ---------------- */
function doGet(e) {
  var params = (e && e.parameter) || {};
  if (params.action !== "list") return json({ ok: false, error: "unknown action" });
  if (params.passcode !== PASSCODE) return json({ ok: false, error: "รหัสผ่านไม่ถูกต้อง" });

  var sheet = getSheet();
  var values = sheet.getDataRange().getValues();
  var data = [];
  // ข้ามแถวหัวตาราง (แถวแรก)
  for (var i = 1; i < values.length; i++) {
    var v = values[i];
    if (!v[1]) continue; // ไม่มีรหัสนักเรียน -> ข้าม
    data.push({
      timestamp: v[0] ? new Date(v[0]).toISOString() : "",
      studentId: String(v[1]),
      fullname:  String(v[2]),
      number:    String(v[3]),
      classroom: String(v[4]),
      choice1:   progCode(v[5]),
      choice2:   progCode(v[6]),
      choice3:   progCode(v[7])
    });
  }

  // เรียงตามห้อง แล้วตามเลขที่
  data.sort(function (a, b) {
    var ca = CLASS_ORDER.indexOf(a.classroom), cb = CLASS_ORDER.indexOf(b.classroom);
    if (ca !== cb) return ca - cb;
    return (parseInt(a.number, 10) || 0) - (parseInt(b.number, 10) || 0);
  });

  return json({ ok: true, count: data.length, data: data });
}

/* ---------------- helpers ---------------- */
function getSheet() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME);
  }
  // ใส่หัวคอลัมน์ถ้ายังว่าง
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(HEADERS);
    sheet.getRange(1, 1, 1, HEADERS.length).setFontWeight("bold").setBackground("#8a1c2b").setFontColor("#ffffff");
    sheet.setFrozenRows(1);
  }

  // บังคับคอลัมน์ รหัสนักเรียน(B) / เลขที่(D) / ชั้น(E) ให้เป็น "ข้อความล้วน"
  // กัน Google Sheets แปลง "3/1" เป็นวันที่ และกันรหัสนักเรียนเลข 0 นำหน้าหาย
  sheet.getRangeList(["B2:B", "D2:D", "E2:E"]).setNumberFormat("@");

  return sheet;
}

function findRowByStudentId(sheet, studentId) {
  var last = sheet.getLastRow();
  if (last < 2) return -1;
  var ids = sheet.getRange(2, 2, last - 1, 1).getValues(); // คอลัมน์ B = รหัสนักเรียน
  for (var i = 0; i < ids.length; i++) {
    if (String(ids[i][0]) === studentId) return i + 2;
  }
  return -1;
}

// แปลง code -> ชื่อไทย (เก็บในชีตเป็นชื่อไทยให้อ่านง่าย)
function progName(code) { return PROGRAMS[code] || code || ""; }

// แปลงชื่อไทยในชีต -> code (ส่งกลับให้ frontend)
function progCode(name) {
  name = String(name || "").trim();
  for (var code in PROGRAMS) {
    if (PROGRAMS[code] === name) return code;
  }
  return name; // เผื่อกรณีเก็บเป็น code อยู่แล้ว
}

function json(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

/* ============================================================
 *  แท็บแยกรายห้อง — ดูแยกชั้นได้ เรียงตามเลขที่ (สวยงาม)
 *  สร้าง/อัปเดตอัตโนมัติทุกครั้งที่มีการบันทึก และสั่งเองได้จากเมนู
 * ============================================================ */

// ชื่อแท็บของแต่ละห้อง (Sheet name ห้ามมี "/" จึงใช้ "-")
function classSheetName(c) { return "ม." + String(c).replace("/", "-"); }

function rebuildAllClassSheets(ss) {
  ss = ss || SpreadsheetApp.getActiveSpreadsheet();
  var resp = ss.getSheetByName(SHEET_NAME);
  var values = resp ? resp.getDataRange().getValues() : [];

  // จัดกลุ่มตามห้อง
  var byRoom = {};
  CLASS_ORDER.forEach(function (c) { byRoom[c] = []; });
  for (var i = 1; i < values.length; i++) {
    var v = values[i];
    var room = String(v[4]);
    if (byRoom.hasOwnProperty(room)) byRoom[room].push(v);
  }

  CLASS_ORDER.forEach(function (room, idx) {
    var rows = byRoom[room];
    rows.sort(function (a, b) { return (parseInt(a[3], 10) || 0) - (parseInt(b[3], 10) || 0); });
    var sh = writeClassSheet(ss, room, rows);
    ss.setActiveSheet(sh);
    ss.moveActiveSheet(idx + 2); // ให้เรียงต่อจากแท็บ Responses
  });

  if (resp) ss.setActiveSheet(resp);
}

function writeClassSheet(ss, room, rows) {
  var name = classSheetName(room);
  var sh = ss.getSheetByName(name) || ss.insertSheet(name);
  sh.clear();

  var header = ["เลขที่", "รหัสนักเรียน", "ชื่อ-นามสกุล", "อันดับ 1", "อันดับ 2", "อันดับ 3"];
  var out = [header];
  rows.forEach(function (v) {
    out.push([String(v[3]), String(v[1]), String(v[2]), v[5], v[6], v[7]]);
  });

  // คอลัมน์ เลขที่/รหัส เป็นข้อความล้วน (กันเพี้ยน)
  sh.getRangeList(["A:A", "B:B"]).setNumberFormat("@");
  sh.getRange(1, 1, out.length, header.length).setValues(out);

  // หัวตาราง
  sh.getRange(1, 1, 1, header.length)
    .setFontWeight("bold").setBackground("#8a1c2b").setFontColor("#ffffff")
    .setHorizontalAlignment("center").setVerticalAlignment("middle");
  sh.setFrozenRows(1);
  sh.setRowHeight(1, 34);

  if (out.length > 1) {
    var n = out.length - 1;
    sh.getRange(1, 1, out.length, header.length)
      .setBorder(true, true, true, true, true, true, "#e6ddcf", SpreadsheetApp.BorderStyle.SOLID);
    sh.getRange(2, 1, n, 2).setHorizontalAlignment("center"); // เลขที่ + รหัส
    // แถบสลับสีอ่านง่าย (เรียกครั้งเดียว)
    var bg = [];
    for (var r = 0; r < n; r++) {
      var c = (r % 2 === 0) ? "#ffffff" : "#faf7f1";
      bg.push([c, c, c, c, c, c]);
    }
    sh.getRange(2, 1, n, header.length).setBackgrounds(bg);
  } else {
    sh.getRange(2, 1).setValue("— ยังไม่มีนักเรียนในห้องนี้ —").setFontColor("#999999");
  }

  // ความกว้างคอลัมน์
  sh.setColumnWidth(1, 60);
  sh.setColumnWidth(2, 115);
  sh.setColumnWidth(3, 210);
  sh.setColumnWidth(4, 235);
  sh.setColumnWidth(5, 235);
  sh.setColumnWidth(6, 235);
  return sh;
}

/* ---------------- เมนูในตัว Google Sheet ---------------- */
function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu("📋 แบบสอบถามสาขา")
    .addItem("🔄 จัดเรียงข้อมูลแยกห้องใหม่", "menuRebuild")
    .addToUi();
}

function menuRebuild() {
  rebuildAllClassSheets(SpreadsheetApp.getActiveSpreadsheet());
  SpreadsheetApp.getActive().toast("จัดเรียงข้อมูลแยกห้องเรียบร้อยแล้ว", "✅ สำเร็จ", 4);
}

/* ---------------- ทดสอบ/ติดตั้งจากในตัวแก้ไข ---------------- */
function setupSheet() {
  getSheet();
  rebuildAllClassSheets(SpreadsheetApp.getActiveSpreadsheet());
  Logger.log("สร้าง/ตรวจสอบชีต + แท็บแยกห้องเรียบร้อย");
}
