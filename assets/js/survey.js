/* ============================================================
   Survey logic — หน้าฟอร์มนักเรียน
   ============================================================ */
(function () {
  "use strict";

  var CFG = window.APP_CONFIG;
  var form = document.getElementById("surveyForm");
  var programsEl = document.getElementById("programs");
  var rankSummaryEl = document.getElementById("rankSummary");
  var classroomSel = document.getElementById("classroom");
  var alertEl = document.getElementById("alert");
  var submitBtn = document.getElementById("submitBtn");
  var successScreen = document.getElementById("successScreen");

  // อันดับที่เลือก: เก็บ id สาขาตามลำดับ (สูงสุด 3)
  var picked = [];

  /* ---------- สร้างตัวเลือกห้องเรียน ---------- */
  CFG.CLASSES.forEach(function (c) {
    var opt = document.createElement("option");
    opt.value = c;
    opt.textContent = "ม." + c;
    classroomSel.appendChild(opt);
  });

  /* ---------- สร้างการ์ดสาขา ---------- */
  CFG.PROGRAMS.forEach(function (p, i) {
    var div = document.createElement("div");
    div.className = "program";
    div.setAttribute("role", "button");
    div.setAttribute("tabindex", "0");
    div.dataset.id = p.id;
    div.innerHTML =
      '<div class="program__rank">' + (i + 1) + "</div>" +
      '<div class="program__body">' +
        '<div class="program__name">' + p.th + "</div>" +
        '<div class="program__en">' + p.en + "</div>" +
      "</div>" +
      '<div class="program__hint">แตะเพื่อเลือก</div>';
    div.addEventListener("click", function () { toggle(p.id); });
    div.addEventListener("keydown", function (e) {
      if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggle(p.id); }
    });
    programsEl.appendChild(div);
  });

  function toggle(id) {
    var idx = picked.indexOf(id);
    if (idx > -1) {
      picked.splice(idx, 1);            // ยกเลิกการเลือก
    } else {
      if (picked.length >= 3) {
        flash("เลือกได้สูงสุด 3 อันดับ — แตะอันที่เลือกไว้เพื่อยกเลิกก่อน");
        return;
      }
      picked.push(id);
    }
    render();
  }

  function render() {
    // อัปเดตการ์ด
    Array.prototype.forEach.call(programsEl.children, function (card) {
      var id = card.dataset.id;
      var rank = picked.indexOf(id);
      var rankEl = card.querySelector(".program__rank");
      var origIndex = CFG.PROGRAMS.findIndex(function (p) { return p.id === id; }) + 1;
      if (rank > -1) {
        card.classList.add("selected");
        card.setAttribute("data-rank", rank + 1);
        rankEl.textContent = rank + 1;
      } else {
        card.classList.remove("selected");
        card.removeAttribute("data-rank");
        rankEl.textContent = origIndex;
      }
    });

    // อัปเดตสรุปอันดับ
    var labels = ["อันดับ 1", "อันดับ 2", "อันดับ 3"];
    rankSummaryEl.innerHTML = labels.map(function (lab, i) {
      var prog = picked[i] ? window.programById(picked[i]) : null;
      return '<div class="rank-summary__row"><b>' + lab + ":</b> " +
        (prog ? prog.th : '<span class="empty">ยังไม่ได้เลือก</span>') + "</div>";
    }).join("");
  }

  render();

  /* ---------- Validation ---------- */
  function setError(name, msg) {
    var input = document.querySelector('[name="' + name + '"]');
    var box = document.querySelector('.field-error[data-for="' + name + '"]');
    if (input) input.classList.toggle("invalid", !!msg);
    if (box) {
      box.textContent = msg || "";
      box.classList.toggle("show", !!msg);
    }
  }

  function clearErrors() {
    ["studentId", "number", "fullname", "classroom"].forEach(function (n) { setError(n, ""); });
  }

  function validate(data) {
    clearErrors();
    var ok = true;
    if (!/^\d{5}$/.test(data.studentId)) { setError("studentId", "กรุณากรอกรหัสนักเรียนเป็นตัวเลข 5 หลัก"); ok = false; }
    if (!/^\d{1,2}$/.test(data.number) || +data.number < 1) { setError("number", "กรุณากรอกเลขที่เป็นตัวเลข"); ok = false; }
    if (!data.fullname || data.fullname.trim().length < 3) { setError("fullname", "กรุณากรอกชื่อ-นามสกุล"); ok = false; }
    if (!data.classroom) { setError("classroom", "กรุณาเลือกห้องเรียน"); ok = false; }
    if (picked.length !== 3) { flash("กรุณาเลือกสาขาที่สนใจให้ครบ 3 อันดับ"); ok = false; }
    return ok;
  }

  /* ---------- Alert ---------- */
  var flashTimer;
  function flash(msg, type) {
    alertEl.textContent = msg;
    alertEl.className = "alert show alert--" + (type === "ok" ? "ok" : "error");
    clearTimeout(flashTimer);
    flashTimer = setTimeout(function () { alertEl.className = "alert"; }, 4500);
    alertEl.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }

  /* ---------- ส่งฟอร์ม ---------- */
  form.addEventListener("submit", function (e) {
    e.preventDefault();

    var data = {
      studentId: form.studentId.value.trim(),
      number: form.number.value.trim(),
      fullname: form.fullname.value.trim(),
      classroom: form.classroom.value,
      choice1: picked[0] || "",
      choice2: picked[1] || "",
      choice3: picked[2] || ""
    };

    if (!validate(data)) return;

    if (!CFG.GAS_URL || CFG.GAS_URL.indexOf("PASTE_YOUR") === 0) {
      flash("ระบบยังไม่ได้ตั้งค่า URL ของ Google Apps Script (ดูวิธีตั้งค่าใน README)");
      return;
    }

    setLoading(true);

    // ใช้ text/plain เพื่อเลี่ยง CORS preflight ของ GAS
    fetch(CFG.GAS_URL, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({ action: "submit", payload: data })
    })
      .then(function (r) { return r.json(); })
      .then(function (res) {
        setLoading(false);
        if (res && res.ok) {
          showSuccess(data, res.updated);
        } else {
          flash((res && res.error) || "เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง");
        }
      })
      .catch(function () {
        setLoading(false);
        flash("เชื่อมต่อไม่สำเร็จ กรุณาตรวจสอบอินเทอร์เน็ตแล้วลองใหม่");
      });
  });

  function setLoading(on) {
    submitBtn.disabled = on;
    submitBtn.innerHTML = on
      ? '<span class="spinner"></span> กำลังส่ง...'
      : '<span class="btn-label">ส่งแบบสอบถาม</span>';
  }

  function showSuccess(data, updated) {
    form.style.display = "none";
    alertEl.className = "alert";
    var detail = document.getElementById("successDetail");
    var ranks = [data.choice1, data.choice2, data.choice3].map(function (id, i) {
      var p = window.programById(id);
      return "<li>" + (p ? p.th : "-") + "</li>";
    }).join("");
    detail.innerHTML =
      "<div><b>" + data.fullname + "</b> · เลขที่ " + data.number + " · ม." + data.classroom + "</div>" +
      "<div style='margin-top:8px'>สาขาที่เลือก:</div><ol>" + ranks + "</ol>" +
      (updated ? "<div style='margin-top:8px;color:#1c7a44'>※ อัปเดตคำตอบเดิมของรหัสนักเรียนนี้แล้ว</div>" : "");
    successScreen.style.display = "block";
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  document.getElementById("againBtn").addEventListener("click", function () {
    form.reset();
    picked = [];
    render();
    classroomSel.value = "";
    successScreen.style.display = "none";
    form.style.display = "block";
    window.scrollTo({ top: 0, behavior: "smooth" });
  });

})();
