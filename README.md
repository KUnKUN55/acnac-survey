# แบบสอบถามความสนใจสาขา — โรงเรียนอัสสัมชัญนครราชสีมา

ระบบสำรวจความสนใจสาขาของนักเรียนชั้น ม.3 (คล้ายระบบ TCAS รอบ 3) ให้นักเรียน
จัดอันดับสาขาที่สนใจ **3 อันดับ** จากทั้งหมด **7 สาขา** พร้อม **Dashboard สำหรับครู**
ดูสรุปผลเป็นกราฟวงกลม ทั้งภาพรวมสายชั้นและรายห้อง รวมถึงดูข้อมูลรายบุคคล

**สถาปัตยกรรม:** หน้าเว็บ (HTML/CSS/JS) โฮสต์บน **Vercel** + **GitHub** → ส่งข้อมูลไปเก็บที่
**Google Sheet** ผ่าน **Google Apps Script (GAS)**

```
นักเรียน/ครู ──► เว็บ (Vercel) ──► Google Apps Script ──► Google Sheet
```

---

## 📁 โครงสร้างไฟล์

```
.
├── index.html            # หน้าแบบสอบถามสำหรับนักเรียน
├── dashboard.html        # หน้า Dashboard สำหรับครู (รหัสผ่าน ACNAC1967)
├── assets/
│   ├── css/style.css     # ดีไซน์ทั้งหมด (responsive มือถือ/ไอแพด/คอม)
│   ├── img/logo.jpg      # โลโก้โรงเรียน
│   └── js/
│       ├── config.js     # ⭐ ตั้งค่า URL ของ GAS + รายชื่อสาขา/ห้อง
│       ├── survey.js     # ตรรกะหน้าฟอร์ม
│       └── dashboard.js  # ตรรกะ Dashboard + กราฟ (Chart.js)
├── gas/Code.gs           # โค้ด Google Apps Script (วางใน script.google.com)
├── vercel.json
└── README.md
```

---

## 🚀 ขั้นตอนติดตั้ง (ทำครั้งเดียว)

### ส่วนที่ 1 — Google Sheet + Apps Script (หลังบ้าน)

1. ไปที่ [sheets.new](https://sheets.new) สร้าง Google Sheet ใหม่ ตั้งชื่ออะไรก็ได้
   (ระบบจะสร้างชีตชื่อ `Responses` ให้อัตโนมัติ ไม่ต้องทำเอง)
2. ที่เมนูด้านบนเลือก **ส่วนขยาย (Extensions) → Apps Script**
3. ลบโค้ดเดิมทั้งหมด แล้ว **คัดลอกเนื้อหาจากไฟล์ [`gas/Code.gs`](gas/Code.gs)** มาวาง → กด 💾 บันทึก
4. (แนะนำ) เลือกฟังก์ชัน `setupSheet` แล้วกด **Run** หนึ่งครั้ง เพื่อสร้างหัวตาราง
   — ครั้งแรกจะให้กด **Review permissions → เลือกบัญชี → Advanced → Go to project (unsafe) → Allow**
5. กดปุ่ม **Deploy → New deployment**
   - ไอคอนเฟือง ⚙️ เลือกชนิด = **Web app**
   - **Execute as:** `Me` (ตัวคุณเอง)
   - **Who has access:** `Anyone`  ← สำคัญ! ต้องเป็น Anyone เว็บจึงเรียกได้
   - กด **Deploy** → คัดลอก **Web app URL** (ลงท้ายด้วย `/exec`)

> 🔁 ทุกครั้งที่แก้โค้ด `Code.gs` ต้อง **Deploy → Manage deployments → ✏️ Edit → Version: New version → Deploy** ใหม่

### ส่วนที่ 2 — ใส่ URL ลงในเว็บ

เปิดไฟล์ [`assets/js/config.js`](assets/js/config.js) แก้บรรทัด `GAS_URL`:

```js
GAS_URL: "https://script.google.com/macros/s/XXXXXXXX/exec",
```

นำ URL ที่ได้จากขั้นตอนที่ 1 มาวางแทน แล้วบันทึก

### ส่วนที่ 3 — ขึ้น GitHub + Vercel (หน้าบ้าน)

**สร้าง Git และขึ้น GitHub:**
```bash
git init
git add .
git commit -m "เริ่มต้นระบบแบบสอบถามความสนใจสาขา"
gh repo create acnac-survey --public --source=. --push
# หรือสร้าง repo บน github.com เองแล้ว: git remote add origin <URL> ; git push -u origin main
```

**Deploy บน Vercel:**
1. ไปที่ [vercel.com](https://vercel.com) → **Add New → Project** → เลือก repo ที่เพิ่งสร้าง
2. Framework Preset = **Other** (เป็นเว็บ static ไม่ต้องตั้งค่าอะไร) → **Deploy**
3. เสร็จแล้วจะได้ลิงก์ เช่น `https://acnac-survey.vercel.app`
   - หน้านักเรียน: `https://acnac-survey.vercel.app/`
   - หน้าครู: `https://acnac-survey.vercel.app/dashboard`

---

## 🧑‍🎓 หน้าบ้าน (นักเรียน)

- กรอก **รหัสนักเรียน (5 หลัก)**, **ชื่อ-นามสกุล**, **เลขที่**, **ชั้น** (ม.3/1–3/5 และ 3/EP)
- เลือกสาขาที่สนใจ **3 อันดับ** จาก 7 สาขา (แตะการ์ดเพื่อจัดอันดับ แตะซ้ำเพื่อยกเลิก)
- ถ้านักเรียนส่งซ้ำด้วยรหัสเดิม ระบบจะ **อัปเดตคำตอบเดิม** (ไม่เกิดข้อมูลซ้ำ)

## 👩‍🏫 หลังบ้าน (ครู) — เข้าที่ `/dashboard`

รหัสผ่าน: **`ACNAC1967`**

1. **ภาพรวมสายชั้น** — กราฟวงกลม 3 วง (อันดับ 1 / 2 / 3) ดูว่าสาขาไหนคนเลือกมากสุด
2. **แยกรายห้อง** — เลือกห้อง แล้วดูกราฟอันดับ 1/2/3 ของห้องนั้น
3. **รายบุคคล** — ตารางนักเรียน **เรียงตามห้องและเลขที่** ค้นหาได้ คลิกเพื่อดูรายละเอียดครบทั้ง 3 อันดับ

---

## ⚙️ การปรับแต่ง

| ต้องการแก้ | ไปที่ |
|---|---|
| รายชื่อสาขา / ห้องเรียน | `assets/js/config.js` **และ** `gas/Code.gs` (ให้ตรงกัน) |
| รหัสผ่านครู | `assets/js/config.js` (`TEACHER_PASSCODE`) **และ** `gas/Code.gs` (`PASSCODE`) |
| สีธีม / ดีไซน์ | `assets/css/style.css` (ตัวแปร `:root`) |

> ⚠️ รหัสผ่านครูเป็นการป้องกันระดับพื้นฐาน (เหมาะกับใช้ภายในโรงเรียน) ไม่ใช่ระบบความปลอดภัยขั้นสูง

---

## ❓ แก้ปัญหาที่พบบ่อย

- **ส่งฟอร์มแล้วขึ้น "ยังไม่ได้ตั้งค่า URL"** → ยังไม่ได้ใส่ `GAS_URL` ใน `config.js`
- **ส่งแล้ว error / Dashboard โหลดไม่ขึ้น** → ตรวจว่า Deploy GAS แบบ **Who has access = Anyone** และใช้ URL ที่ลงท้าย `/exec`
- **แก้โค้ด GAS แล้วไม่อัปเดต** → ต้อง Deploy เวอร์ชันใหม่ (Manage deployments → Edit → New version)
- **Dashboard ขึ้น "รหัสผ่านไม่ถูกต้อง"** ทั้งที่ใส่ถูก → ตรวจว่า `PASSCODE` ใน `Code.gs` ตรงกับ `TEACHER_PASSCODE` ใน `config.js`
