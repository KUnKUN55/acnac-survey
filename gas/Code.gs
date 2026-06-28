/* ============================================================
 *  Google Apps Script — Backend ของแบบสอบถามความสนใจสาขา
 *  โรงเรียนอัสสัมชัญนครราชสีมา
 * ------------------------------------------------------------
 *  หน้าที่:
 *   - doGet(action="config")    : ส่งค่าตั้งค่า (สาขา/ห้อง/คำถามเพิ่มเติม) ให้หน้าเว็บ + ลิงก์ Sheet
 *   - doPost(action="submit")   : บันทึก/อัปเดตคำตอบนักเรียนลง Sheet (รวมคำถามเพิ่มเติม)
 *   - doGet(action="list")      : ส่งข้อมูลทั้งหมดให้ Dashboard (ต้องมีรหัสผ่าน)
 *   - doPost(action="saveConfig"): ครูบันทึกค่าตั้งค่าใหม่ (ต้องมีรหัสผ่าน)
 *
 *  ⚠️ ทุกครั้งที่แก้ไฟล์นี้ ต้อง Deploy > Manage deployments > แก้ไข (ดินสอ) >
 *     New version > Deploy เพื่อให้เว็บใช้โค้ดล่าสุด
 *
 *  วิธีติดตั้งอยู่ในไฟล์ README.md (หัวข้อ "ตั้งค่า Google Apps Script")
 * ============================================================ */

// ===== ตั้งค่า =====
var PASSCODE    = "ACNAC1967";       // ต้องตรงกับ TEACHER_PASSCODE ใน config.js
var SHEET_NAME  = "Responses";        // ชื่อชีตที่ใช้เก็บข้อมูล
var CONFIG_NAME = "_Config";          // ชีตเก็บค่าตั้งค่า (JSON) — ครูไม่ต้องแก้เอง
var EXTRA_NAME  = "📝 คำถามเพิ่มเติม"; // ชีตสรุปคำตอบคำถามเพิ่มเติม (อ่านง่าย)

// หัวคอลัมน์พื้นฐานของชีต Responses (ลำดับสำคัญ — index 0..8)
var HEADERS = [
  "Timestamp", "รหัสนักเรียน", "ชื่อ-นามสกุล", "เลขที่", "ชั้น",
  "อันดับ1", "อันดับ2", "อันดับ3",
  "คำตอบเพิ่มเติม(ระบบ)"   // index 8 = JSON {questionId: value}
];
var EXTRA_COL = 9; // คอลัมน์ที่ 9 (index 8) เก็บ JSON คำถามเพิ่มเติม

// ---------- ค่าตั้งค่าเริ่มต้น (ใช้ครั้งแรก / ถ้ายังไม่เคยบันทึก) ----------
var DEFAULT_CONFIG = {
  programs: [
    { id: "health",  th: "สาขาวิทยาศาสตร์สุขภาพและการแพทย์", en: "Health and Medical Science Program" },
    { id: "preeng",  th: "สาขาเตรียมวิศวกรรม",               en: "Pre-Engineering" },
    { id: "mgmtsci", th: "สาขาวิทยาศาสตร์การจัดการ",          en: "Management Science Program" },
    { id: "biz",     th: "สาขาบริหารธุรกิจ",                  en: "Business Administration" },
    { id: "digital", th: "สาขาสื่อดิจิทัลและนวัตกรรม",         en: "Innovation and Digital Media" },
    { id: "comm",    th: "สาขานิเทศศาสตร์",                   en: "Communication Arts" },
    { id: "ep",      th: "English Program",                  en: "English Program" }
  ],
  classes: ["3/1", "3/2", "3/3", "3/4", "3/5", "3/EP"],
  rankCount: 3,
  askReason: false,  // ถามเหตุผลของแต่ละอันดับ (บังคับตอบ)
  questions: []      // คำถามเพิ่มเติม: { id, label, type: "rate"|"text", max?, required? }
};

/* ============================================================
 *  ROUTER
 * ============================================================ */
function doGet(e) {
  var params = (e && e.parameter) || {};
  var action = params.action;

  if (action === "config") {
    return json({ ok: true, config: getConfig(), sheetUrl: getSheetUrl() });
  }
  if (action === "list") {
    if (params.passcode !== PASSCODE) return json({ ok: false, error: "รหัสผ่านไม่ถูกต้อง" });
    return json(listData());
  }
  return json({ ok: false, error: "unknown action" });
}

function doPost(e) {
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(20000); // กันเขียนชนกัน
    var body = JSON.parse(e.postData.contents);

    if (body.action === "submit")     return handleSubmit(body.payload || {});
    if (body.action === "saveConfig") return handleSaveConfig(body);

    return json({ ok: false, error: "unknown action" });
  } catch (err) {
    return json({ ok: false, error: String(err) });
  } finally {
    try { lock.releaseLock(); } catch (ignore) {}
  }
}

/* ============================================================
 *  บันทึกคำตอบนักเรียน
 * ============================================================ */
function handleSubmit(p) {
  var cfg = getConfig();
  var classes = cfg.classes || [];
  var rankCount = Math.min(cfg.rankCount || 3, (cfg.programs || []).length);

  // ตรวจข้อมูลพื้นฐาน
  if (!/^\d{5}$/.test(String(p.studentId || ""))) return json({ ok: false, error: "รหัสนักเรียนไม่ถูกต้อง" });
  if (!p.fullname || !p.classroom) return json({ ok: false, error: "ข้อมูลไม่ครบถ้วน" });
  if (classes.indexOf(p.classroom) === -1) return json({ ok: false, error: "ห้องเรียนไม่ถูกต้อง" });

  // ตรวจการเลือกสาขาให้ครบตามจำนวนอันดับ
  var choices = Array.isArray(p.choices) ? p.choices : [p.choice1, p.choice2, p.choice3];
  for (var c = 0; c < rankCount; c++) {
    if (!choices[c]) return json({ ok: false, error: "เลือกสาขาไม่ครบ " + rankCount + " อันดับ" });
  }

  // ตรวจคำถามเพิ่มเติมที่บังคับตอบ
  var answers = p.answers || {};
  var qs = cfg.questions || [];
  for (var i = 0; i < qs.length; i++) {
    var q = qs[i];
    if (q.required) {
      var a = answers[q.id];
      if (a === undefined || a === null || String(a).trim() === "") {
        return json({ ok: false, error: "กรุณาตอบคำถาม: " + q.label });
      }
    }
  }

  // เหตุผลของแต่ละอันดับ (ถ้าครูเปิดใช้ — บังคับตอบทุกช่อง) เก็บลง answers: reason1..reasonN
  if (cfg.askReason) {
    var reasons = Array.isArray(p.reasons) ? p.reasons : [];
    for (var rr = 0; rr < rankCount; rr++) {
      var rv = reasons[rr];
      if (rv === undefined || rv === null || String(rv).trim() === "") {
        return json({ ok: false, error: "กรุณาพิมพ์เหตุผลของอันดับ " + (rr + 1) });
      }
      answers["reason" + (rr + 1)] = String(rv);
    }
  }

  var sheet = getSheet();

  var row = [
    new Date(),
    String(p.studentId),
    String(p.fullname),
    String(p.number),
    String(p.classroom),
    progName(cfg, choices[0]),
    progName(cfg, choices[1]),
    progName(cfg, choices[2]),
    JSON.stringify(answers)
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

  // อัปเดตแท็บแยกรายห้อง + อันดับ 1 แยกสาขา + คำถามเพิ่มเติม — ไม่ให้ error มากระทบการบันทึก
  try {
    rebuildAllClassSheets(sheet.getParent(), cfg);
    rebuildChoice1Sheets(sheet.getParent(), cfg);
    rebuildExtraSheet(sheet.getParent(), cfg);
  } catch (ignore2) {}

  return json({ ok: true, updated: updated });
}

/* ============================================================
 *  อ่านข้อมูลทั้งหมด (Dashboard)
 * ============================================================ */
function listData() {
  var cfg = getConfig();
  var sheet = getSheet();
  var values = sheet.getDataRange().getValues();
  var data = [];

  for (var i = 1; i < values.length; i++) {
    var v = values[i];
    if (!v[1]) continue; // ไม่มีรหัสนักเรียน -> ข้าม
    var answers = {};
    try { answers = v[8] ? JSON.parse(v[8]) : {}; } catch (e) { answers = {}; }
    data.push({
      timestamp: v[0] ? new Date(v[0]).toISOString() : "",
      studentId: String(v[1]),
      fullname:  String(v[2]),
      number:    String(v[3]),
      classroom: String(v[4]),
      choice1:   progCode(cfg, v[5]),
      choice2:   progCode(cfg, v[6]),
      choice3:   progCode(cfg, v[7]),
      answers:   answers
    });
  }

  // เรียงตามห้อง แล้วตามเลขที่
  var classes = cfg.classes || [];
  data.sort(function (a, b) {
    var ca = classes.indexOf(a.classroom), cb = classes.indexOf(b.classroom);
    if (ca !== cb) return ca - cb;
    return (parseInt(a.number, 10) || 0) - (parseInt(b.number, 10) || 0);
  });

  return { ok: true, count: data.length, data: data, config: cfg, sheetUrl: getSheetUrl() };
}

/* ============================================================
 *  ค่าตั้งค่า (Config) — เก็บเป็น JSON ในชีต _Config (A1)
 * ============================================================ */
function getConfigSheet() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(CONFIG_NAME);
  if (!sh) {
    sh = ss.insertSheet(CONFIG_NAME);
    sh.getRange("A1").setValue(JSON.stringify(DEFAULT_CONFIG));
    sh.getRange("B1").setValue("⚠️ ห้ามแก้ไขช่อง A1 ด้วยมือ — ระบบจัดการอัตโนมัติจากหน้า Dashboard ครู");
    sh.hideSheet();
  }
  return sh;
}

function getConfig() {
  try {
    var raw = getConfigSheet().getRange("A1").getValue();
    var cfg = raw ? JSON.parse(raw) : DEFAULT_CONFIG;
    // เติมค่าที่ขาดให้ครบ (กันเวอร์ชันเก่า)
    if (!cfg.programs || !cfg.programs.length) cfg.programs = DEFAULT_CONFIG.programs;
    if (!cfg.classes  || !cfg.classes.length)  cfg.classes  = DEFAULT_CONFIG.classes;
    if (!cfg.rankCount) cfg.rankCount = DEFAULT_CONFIG.rankCount;
    if (!cfg.questions) cfg.questions = [];
    return cfg;
  } catch (e) {
    return JSON.parse(JSON.stringify(DEFAULT_CONFIG));
  }
}

function handleSaveConfig(body) {
  if (body.passcode !== PASSCODE) return json({ ok: false, error: "รหัสผ่านไม่ถูกต้อง" });
  var cfg = body.config || {};

  // ตรวจ/ทำความสะอาดข้อมูล
  if (!Array.isArray(cfg.programs) || cfg.programs.length < 1)
    return json({ ok: false, error: "ต้องมีอย่างน้อย 1 สาขา" });
  if (!Array.isArray(cfg.classes) || cfg.classes.length < 1)
    return json({ ok: false, error: "ต้องมีอย่างน้อย 1 ห้องเรียน" });

  cfg.rankCount = Math.max(1, Math.min(parseInt(cfg.rankCount, 10) || 3, cfg.programs.length));
  cfg.questions = Array.isArray(cfg.questions) ? cfg.questions : [];
  cfg.askReason = !!cfg.askReason;

  getConfigSheet().getRange("A1").setValue(JSON.stringify(cfg));

  // จัดเรียงชีตใหม่ให้ตรงกับ config ล่าสุด
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    rebuildAllClassSheets(ss, cfg);
    rebuildChoice1Sheets(ss, cfg);
    rebuildExtraSheet(ss, cfg);
  } catch (ignore) {}

  return json({ ok: true, config: cfg });
}

function getSheetUrl() {
  try { return SpreadsheetApp.getActiveSpreadsheet().getUrl(); } catch (e) { return ""; }
}

/* ============================================================
 *  helpers — ชีต Responses
 * ============================================================ */
function getSheet() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) sheet = ss.insertSheet(SHEET_NAME);

  // ใส่หัวคอลัมน์ถ้ายังว่าง
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(HEADERS);
    sheet.getRange(1, 1, 1, HEADERS.length).setFontWeight("bold").setBackground("#8a1c2b").setFontColor("#ffffff");
    sheet.setFrozenRows(1);
  } else if (sheet.getLastColumn() < EXTRA_COL) {
    // อัปเกรดชีตเก่า (เพิ่มคอลัมน์ JSON คำถามเพิ่มเติม)
    sheet.getRange(1, EXTRA_COL).setValue(HEADERS[EXTRA_COL - 1])
      .setFontWeight("bold").setBackground("#8a1c2b").setFontColor("#ffffff");
  }

  // บังคับคอลัมน์ รหัสนักเรียน(B) / เลขที่(D) / ชั้น(E) ให้เป็น "ข้อความล้วน"
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
function progName(cfg, code) {
  if (!code) return "";
  var list = (cfg && cfg.programs) || [];
  for (var i = 0; i < list.length; i++) if (list[i].id === code) return list[i].th;
  return code;
}

// แปลงชื่อไทยในชีต -> code (ส่งกลับให้ frontend)
function progCode(cfg, name) {
  name = String(name || "").trim();
  if (!name) return "";
  var list = (cfg && cfg.programs) || [];
  for (var i = 0; i < list.length; i++) if (list[i].th === name) return list[i].id;
  return name; // เผื่อกรณีเก็บเป็น code อยู่แล้ว / สาขาถูกลบไปแล้ว
}

function json(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

/* ============================================================
 *  แท็บแยกรายห้อง — ดูแยกชั้นได้ เรียงตามเลขที่ (สวยงาม)
 * ============================================================ */
function classSheetName(c) { return "ม." + String(c).replace("/", "-"); }

function rebuildAllClassSheets(ss, cfg) {
  ss = ss || SpreadsheetApp.getActiveSpreadsheet();
  cfg = cfg || getConfig();
  var classOrder = cfg.classes || [];
  var resp = ss.getSheetByName(SHEET_NAME);
  var values = resp ? resp.getDataRange().getValues() : [];

  var byRoom = {};
  classOrder.forEach(function (c) { byRoom[c] = []; });
  for (var i = 1; i < values.length; i++) {
    var v = values[i];
    var room = String(v[4]);
    if (byRoom.hasOwnProperty(room)) byRoom[room].push(v);
  }

  classOrder.forEach(function (room, idx) {
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

  sh.getRangeList(["A:A", "B:B"]).setNumberFormat("@");
  sh.getRange(1, 1, out.length, header.length).setValues(out);

  sh.getRange(1, 1, 1, header.length)
    .setFontWeight("bold").setBackground("#8a1c2b").setFontColor("#ffffff")
    .setHorizontalAlignment("center").setVerticalAlignment("middle");
  sh.setFrozenRows(1);
  sh.setRowHeight(1, 34);

  if (out.length > 1) {
    var n = out.length - 1;
    sh.getRange(1, 1, out.length, header.length)
      .setBorder(true, true, true, true, true, true, "#e6ddcf", SpreadsheetApp.BorderStyle.SOLID);
    sh.getRange(2, 1, n, 2).setHorizontalAlignment("center");
    var bg = [];
    for (var r = 0; r < n; r++) {
      var c = (r % 2 === 0) ? "#ffffff" : "#faf7f1";
      bg.push([c, c, c, c, c, c]);
    }
    sh.getRange(2, 1, n, header.length).setBackgrounds(bg);
  } else {
    sh.getRange(2, 1).setValue("— ยังไม่มีนักเรียนในห้องนี้ —").setFontColor("#999999");
  }

  sh.setColumnWidth(1, 60);
  sh.setColumnWidth(2, 115);
  sh.setColumnWidth(3, 210);
  sh.setColumnWidth(4, 235);
  sh.setColumnWidth(5, 235);
  sh.setColumnWidth(6, 235);
  return sh;
}

/* ============================================================
 *  แท็บ "อันดับ 1 แยกสาขา" — 1 สาขา/ชีต
 * ============================================================ */
function shortName(th) {
  // ตัดคำว่า "สาขา" ออก + จำกัดความยาวชื่อแท็บ
  var s = String(th || "").replace(/^สาขา/, "").trim();
  return s.length > 24 ? s.substring(0, 24) : s;
}
function choice1SheetName(th) { return "① " + shortName(th); }

function rebuildChoice1Sheets(ss, cfg) {
  ss = ss || SpreadsheetApp.getActiveSpreadsheet();
  cfg = cfg || getConfig();
  var programs = cfg.programs || [];
  var classOrder = cfg.classes || [];
  var resp = ss.getSheetByName(SHEET_NAME);
  var values = resp ? resp.getDataRange().getValues() : [];

  // ลบชีต ① เก่าที่ไม่ตรงกับสาขาปัจจุบันแล้ว (กรณีลบ/เปลี่ยนชื่อสาขา)
  var wanted = {};
  programs.forEach(function (p) { wanted[choice1SheetName(p.th)] = true; });
  ss.getSheets().forEach(function (s) {
    var nm = s.getName();
    if (nm.indexOf("① ") === 0 && !wanted[nm]) ss.deleteSheet(s);
  });

  programs.forEach(function (p, idx) {
    var thName = p.th;
    var rows = [];
    for (var i = 1; i < values.length; i++) {
      if (String(values[i][5]) === thName) rows.push(values[i]); // คอลัมน์ F = อันดับ1
    }
    rows.sort(function (a, b) {
      var ca = classOrder.indexOf(String(a[4])), cb = classOrder.indexOf(String(b[4]));
      if (ca !== cb) return ca - cb;
      return (parseInt(a[3], 10) || 0) - (parseInt(b[3], 10) || 0);
    });
    var sh = writeChoice1Sheet(ss, thName, rows);
    ss.setActiveSheet(sh);
    ss.moveActiveSheet(1 + classOrder.length + 1 + idx);
  });

  if (resp) ss.setActiveSheet(resp);
}

function writeChoice1Sheet(ss, thName, rows) {
  var name = choice1SheetName(thName);
  var sh = ss.getSheetByName(name) || ss.insertSheet(name);
  sh.clear();
  sh.getRange(1, 1, 1, 6).breakApart();

  var header = ["ห้อง", "เลขที่", "รหัสนักเรียน", "ชื่อ-นามสกุล", "อันดับ 2", "อันดับ 3"];
  var title = "นักเรียนที่เลือก “" + thName + "” เป็นอันดับ 1   ·   รวม " + rows.length + " คน";

  sh.getRangeList(["B:B", "C:C"]).setNumberFormat("@");

  sh.getRange(1, 1, 1, header.length).merge().setValue(title)
    .setFontWeight("bold").setFontColor("#ffffff").setBackground("#6d1422")
    .setHorizontalAlignment("center").setVerticalAlignment("middle");
  sh.setRowHeight(1, 38);

  sh.getRange(2, 1, 1, header.length).setValues([header])
    .setFontWeight("bold").setBackground("#8a1c2b").setFontColor("#ffffff")
    .setHorizontalAlignment("center").setVerticalAlignment("middle");
  sh.setFrozenRows(2);

  if (rows.length) {
    var out = rows.map(function (v) {
      return ["ม." + String(v[4]), String(v[3]), String(v[1]), String(v[2]), v[6], v[7]];
    });
    sh.getRange(3, 1, out.length, header.length).setValues(out);
    sh.getRange(2, 1, out.length + 1, header.length)
      .setBorder(true, true, true, true, true, true, "#e6ddcf", SpreadsheetApp.BorderStyle.SOLID);
    sh.getRange(3, 1, out.length, 3).setHorizontalAlignment("center");
    var bg = [];
    for (var r = 0; r < out.length; r++) {
      var c = (r % 2 === 0) ? "#ffffff" : "#faf7f1";
      bg.push([c, c, c, c, c, c]);
    }
    sh.getRange(3, 1, out.length, header.length).setBackgrounds(bg);
  } else {
    sh.getRange(3, 1).setValue("— ยังไม่มีนักเรียนเลือกสาขานี้เป็นอันดับ 1 —").setFontColor("#999999");
  }

  sh.setColumnWidth(1, 70);
  sh.setColumnWidth(2, 60);
  sh.setColumnWidth(3, 115);
  sh.setColumnWidth(4, 210);
  sh.setColumnWidth(5, 235);
  sh.setColumnWidth(6, 235);
  return sh;
}

/* ============================================================
 *  แท็บ "คำถามเพิ่มเติม" — รวมคำตอบของคำถามที่ครูเพิ่มเอง (อ่านง่าย)
 * ============================================================ */
function rebuildExtraSheet(ss, cfg) {
  ss = ss || SpreadsheetApp.getActiveSpreadsheet();
  cfg = cfg || getConfig();
  var questions = cfg.questions || [];
  var classOrder = cfg.classes || [];
  var askReason = !!cfg.askReason;
  var rankCount = Math.min(cfg.rankCount || 3, (cfg.programs || []).length) || 0;

  var existing = ss.getSheetByName(EXTRA_NAME);

  // ไม่มีคำถามเพิ่มเติมและไม่ได้ถามเหตุผล -> ลบชีตทิ้งถ้ามี
  if (!questions.length && !askReason) {
    if (existing) ss.deleteSheet(existing);
    return;
  }

  var sh = existing || ss.insertSheet(EXTRA_NAME);
  sh.clear();

  var resp = ss.getSheetByName(SHEET_NAME);
  var values = resp ? resp.getDataRange().getValues() : [];

  var rows = [];
  for (var i = 1; i < values.length; i++) {
    if (!values[i][1]) continue;
    rows.push(values[i]);
  }
  rows.sort(function (a, b) {
    var ca = classOrder.indexOf(String(a[4])), cb = classOrder.indexOf(String(b[4]));
    if (ca !== cb) return ca - cb;
    return (parseInt(a[3], 10) || 0) - (parseInt(b[3], 10) || 0);
  });

  var header = ["ห้อง", "เลขที่", "รหัสนักเรียน", "ชื่อ-นามสกุล"];
  if (askReason) {
    for (var rh = 0; rh < rankCount; rh++) header.push("เหตุผลอันดับ " + (rh + 1));
  }
  questions.forEach(function (q) {
    header.push(q.label + (q.type === "rate" ? " (เรต)" : ""));
  });

  var out = [header];
  rows.forEach(function (v) {
    var answers = {};
    try { answers = v[8] ? JSON.parse(v[8]) : {}; } catch (e) { answers = {}; }
    var line = ["ม." + String(v[4]), String(v[3]), String(v[1]), String(v[2])];
    if (askReason) {
      for (var rc = 0; rc < rankCount; rc++) {
        var rv = answers["reason" + (rc + 1)];
        line.push(rv === undefined || rv === null ? "" : String(rv));
      }
    }
    questions.forEach(function (q) {
      var a = answers[q.id];
      line.push(a === undefined || a === null ? "" : String(a));
    });
    out.push(line);
  });

  sh.getRangeList(["B:B", "C:C"]).setNumberFormat("@");
  sh.getRange(1, 1, out.length, header.length).setValues(out);

  sh.getRange(1, 1, 1, header.length)
    .setFontWeight("bold").setBackground("#8a1c2b").setFontColor("#ffffff")
    .setHorizontalAlignment("center").setVerticalAlignment("middle").setWrap(true);
  sh.setFrozenRows(1);
  sh.setFrozenColumns(4);
  sh.setRowHeight(1, 42);

  if (out.length > 1) {
    sh.getRange(1, 1, out.length, header.length)
      .setBorder(true, true, true, true, true, true, "#e6ddcf", SpreadsheetApp.BorderStyle.SOLID);
    sh.getRange(2, 1, out.length - 1, 3).setHorizontalAlignment("center");
  } else {
    sh.getRange(2, 1).setValue("— ยังไม่มีข้อมูล —").setFontColor("#999999");
  }

  sh.setColumnWidth(1, 70);
  sh.setColumnWidth(2, 60);
  sh.setColumnWidth(3, 115);
  sh.setColumnWidth(4, 200);
  var col = 5;
  if (askReason) {
    for (var rw = 0; rw < rankCount; rw++) sh.setColumnWidth(col++, 240);
  }
  for (var c = 0; c < questions.length; c++) {
    sh.setColumnWidth(col++, questions[c].type === "rate" ? 130 : 260);
  }

  ss.setActiveSheet(sh);
  ss.moveActiveSheet(ss.getNumSheets());
  if (resp) ss.setActiveSheet(resp);
}

/* ============================================================
 *  เมนูในตัว Google Sheet + ติดตั้ง
 * ============================================================ */
function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu("📋 แบบสอบถามสาขา")
    .addItem("🔄 จัดเรียงข้อมูลทุกแท็บใหม่", "menuRebuild")
    .addToUi();
}

function menuRebuild() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var cfg = getConfig();
  rebuildAllClassSheets(ss, cfg);
  rebuildChoice1Sheets(ss, cfg);
  rebuildExtraSheet(ss, cfg);
  SpreadsheetApp.getActive().toast("จัดเรียงทุกแท็บเรียบร้อยแล้ว", "✅ สำเร็จ", 4);
}

function setupSheet() {
  getSheet();
  getConfigSheet();
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var cfg = getConfig();
  rebuildAllClassSheets(ss, cfg);
  rebuildChoice1Sheets(ss, cfg);
  rebuildExtraSheet(ss, cfg);
  Logger.log("ติดตั้ง/ตรวจสอบชีตทั้งหมดเรียบร้อย");
}
