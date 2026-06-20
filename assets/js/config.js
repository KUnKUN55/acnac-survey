/* ============================================================
   ค่าตั้งค่ากลาง (Config)
   ------------------------------------------------------------
   ⬇️ สำคัญมาก: หลังจาก Deploy Google Apps Script เป็น Web App แล้ว
      ให้นำ URL ที่ได้ (ลงท้ายด้วย /exec) มาวางแทนค่าด้านล่างนี้
   ============================================================ */
window.APP_CONFIG = {
  // วาง URL ของ Google Apps Script Web App ตรงนี้ (ลงท้าย .../exec)
  GAS_URL: "PASTE_YOUR_GAS_WEB_APP_URL_HERE",

  // รหัสผ่านสำหรับเข้าหน้า Dashboard ของครู
  TEACHER_PASSCODE: "ACNAC1967",

  // 7 สาขา (โชว์ทุกสาขา ให้นักเรียนเลือก 3 อันดับ)
  PROGRAMS: [
    { id: "health",  th: "สาขาวิทยาศาสตร์สุขภาพและการแพทย์", en: "Health and Medical Science Program" },
    { id: "preeng",  th: "สาขาเตรียมวิศวกรรม",               en: "Pre-Engineering" },
    { id: "mgmtsci", th: "สาขาวิทยาศาสตร์การจัดการ",          en: "Management Science Program" },
    { id: "biz",     th: "สาขาบริหารธุรกิจ",                  en: "Business Administration" },
    { id: "digital", th: "สาขาสื่อดิจิทัลและนวัตกรรม",         en: "Innovation and Digital Media" },
    { id: "comm",    th: "สาขานิเทศศาสตร์",                   en: "Communication Arts" },
    { id: "ep",      th: "English Program",                  en: "English Program" }
  ],

  // ชั้น ม.3 เท่านั้น
  CLASSES: ["3/1", "3/2", "3/3", "3/4", "3/5", "3/EP"]
};

// ชุดสีสำหรับกราฟ (เรียงตามลำดับสาขา)
window.PROGRAM_COLORS = [
  "#8a1c2b", // health  - แดงเลือดหมู
  "#1f3a6e", // preeng  - น้ำเงิน
  "#d4a32a", // mgmtsci - ทอง
  "#1f9d57", // biz     - เขียว
  "#9b51e0", // digital - ม่วง
  "#e67e22", // comm    - ส้ม
  "#16a3a3"  // ep      - ฟ้าอมเขียว
];

// helper: หาชื่อสาขาจาก id
window.programById = function (id) {
  return (window.APP_CONFIG.PROGRAMS.find(function (p) { return p.id === id; })) || null;
};
