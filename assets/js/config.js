/* ============================================================
   ค่าตั้งค่ากลาง (Config)
   ------------------------------------------------------------
   ⬇️ สำคัญมาก: หลังจาก Deploy Google Apps Script เป็น Web App แล้ว
      ให้นำ URL ที่ได้ (ลงท้ายด้วย /exec) มาวางแทนค่าด้านล่างนี้

   หมายเหตุ: รายชื่อสาขา / ห้อง / คำถามเพิ่มเติม "ของจริง" ถูกเก็บไว้ใน
   Google Sheet และโหลดผ่าน GAS (action=config) — ค่าด้านล่างเป็นเพียง
   ค่าสำรอง (fallback) เผื่อโหลดจากเซิร์ฟเวอร์ไม่สำเร็จ ครูแก้ผ่านหน้า
   Dashboard ได้โดยไม่ต้องแก้ไฟล์นี้
   ============================================================ */
window.APP_CONFIG = {
  // วาง URL ของ Google Apps Script Web App ตรงนี้ (ลงท้าย .../exec)
  GAS_URL: "https://script.google.com/macros/s/AKfycbzjCZKGRu2x8gvWOSyiz5aCr1GGW7DWaqN_p3g26CPBT83h5DG3Yz1ak-GTTakrAroiAQ/exec",

  // รหัสผ่านสำหรับเข้าหน้า Dashboard ของครู
  TEACHER_PASSCODE: "ACNAC1967",

  // จำนวนอันดับที่ให้นักเรียนเลือก (ปรับได้จากหน้า Dashboard ครู)
  rankCount: 3,

  // สาขา (ค่าสำรอง — ของจริงโหลดจาก Sheet)
  PROGRAMS: [
    { id: "health",  th: "สาขาวิทยาศาสตร์สุขภาพและการแพทย์", en: "Health and Medical Science Program" },
    { id: "preeng",  th: "สาขาเตรียมวิศวกรรม",               en: "Pre-Engineering" },
    { id: "mgmtsci", th: "สาขาวิทยาศาสตร์การจัดการ",          en: "Management Science Program" },
    { id: "biz",     th: "สาขาบริหารธุรกิจ",                  en: "Business Administration" },
    { id: "digital", th: "สาขาสื่อดิจิทัลและนวัตกรรม",         en: "Innovation and Digital Media" },
    { id: "comm",    th: "สาขานิเทศศาสตร์",                   en: "Communication Arts" },
    { id: "ep",      th: "English Program",                  en: "English Program" }
  ],

  // ชั้น ม.3 (ค่าสำรอง — ของจริงโหลดจาก Sheet)
  CLASSES: ["3/1", "3/2", "3/3", "3/4", "3/5", "3/EP"],

  // คำถามเพิ่มเติม (โหลดจาก Sheet): { id, label, type:"rate"|"text", max?, required? }
  QUESTIONS: [],

  // ลิงก์ Google Sheet (เติมอัตโนมัติหลังโหลด config)
  SHEET_URL: ""
};

// จานสีสำหรับกราฟ (วนซ้ำได้ ถ้าสาขามากกว่าจำนวนสี)
window.PROGRAM_COLORS = [
  "#8a1c2b", "#1f3a6e", "#d4a32a", "#1f9d57", "#9b51e0", "#e67e22", "#16a3a3",
  "#c0392b", "#2e539b", "#b8860b", "#0e8a5f", "#7d3cb5", "#d35400", "#138a8a"
];

// helper: หาข้อมูลสาขาจาก id (อ่านจาก APP_CONFIG ปัจจุบันเสมอ)
window.programById = function (id) {
  return (window.APP_CONFIG.PROGRAMS.find(function (p) { return p.id === id; })) || null;
};

// helper: สีของสาขาตามลำดับใน PROGRAMS (วนจานสี)
window.programColor = function (id) {
  var list = window.APP_CONFIG.PROGRAMS;
  var idx = list.findIndex(function (p) { return p.id === id; });
  if (idx < 0) idx = 0;
  return window.PROGRAM_COLORS[idx % window.PROGRAM_COLORS.length];
};

/* ------------------------------------------------------------
   โหลด config ของจริงจาก Google Sheet ผ่าน GAS แล้วเขียนทับค่าสำรอง
   ใช้ได้ทั้งหน้าแบบสอบถามและหน้า Dashboard
   ------------------------------------------------------------ */
window.loadLiveConfig = function (cb) {
  var CFG = window.APP_CONFIG;
  if (!CFG.GAS_URL || CFG.GAS_URL.indexOf("PASTE_YOUR") === 0) {
    if (cb) cb(false);
    return;
  }
  fetch(CFG.GAS_URL + "?action=config&t=" + Date.now())
    .then(function (r) { return r.json(); })
    .then(function (res) {
      if (res && res.ok && res.config) {
        window.applyLiveConfig(res.config, res.sheetUrl);
        if (cb) cb(true);
      } else {
        if (cb) cb(false);
      }
    })
    .catch(function () { if (cb) cb(false); });
};

// เขียนค่าจาก server ทับ APP_CONFIG
window.applyLiveConfig = function (config, sheetUrl) {
  var CFG = window.APP_CONFIG;
  if (config.programs && config.programs.length) CFG.PROGRAMS = config.programs;
  if (config.classes && config.classes.length)   CFG.CLASSES = config.classes;
  CFG.QUESTIONS = Array.isArray(config.questions) ? config.questions : [];
  if (config.rankCount) CFG.rankCount = config.rankCount;
  if (sheetUrl) CFG.SHEET_URL = sheetUrl;
};
