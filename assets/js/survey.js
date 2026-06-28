/* ============================================================
   Survey logic — หน้าฟอร์มนักเรียน (เรนเดอร์ตามค่าตั้งค่าจาก Sheet)
   ============================================================ */
(function () {
  "use strict";

  var CFG = window.APP_CONFIG;
  var form = document.getElementById("surveyForm");
  var programsEl = document.getElementById("programs");
  var rankSummaryEl = document.getElementById("rankSummary");
  var rankSubtitleEl = document.getElementById("rankSubtitle");
  var extraEl = document.getElementById("extraQuestions");
  var classroomSel = document.getElementById("classroom");
  var alertEl = document.getElementById("alert");
  var submitBtn = document.getElementById("submitBtn");
  var successScreen = document.getElementById("successScreen");

  var picked = [];          // id สาขาตามลำดับที่เลือก
  var rankCount = 3;        // จำนวนอันดับที่ต้องเลือก (ตั้งจาก config)
  var answers = {};         // คำตอบคำถามเพิ่มเติม { questionId: value }

  // โหลดค่าตั้งค่าจริงจาก Sheet ก่อน แล้วค่อยสร้างฟอร์ม (มี fallback ในตัว)
  window.loadLiveConfig(function () { buildForm(); });

  function buildForm() {
    rankCount = Math.max(1, Math.min(CFG.rankCount || 3, CFG.PROGRAMS.length));
    picked = [];
    answers = {};

    buildClasses();
    buildPrograms();
    buildExtraQuestions();
    render();
  }

  /* ---------- ห้องเรียน ---------- */
  function buildClasses() {
    classroomSel.innerHTML = '<option value="" disabled selected>— เลือกห้องเรียน —</option>';
    CFG.CLASSES.forEach(function (c) {
      var opt = document.createElement("option");
      opt.value = c;
      opt.textContent = "ม." + c;
      classroomSel.appendChild(opt);
    });
  }

  /* ---------- การ์ดสาขา ---------- */
  function buildPrograms() {
    if (rankSubtitleEl) {
      rankSubtitleEl.innerHTML =
        "แตะเลือกสาขาที่สนใจ <b>" + rankCount + " อันดับ</b> ระบบจะใส่หมายเลขอันดับให้อัตโนมัติ (แตะซ้ำเพื่อยกเลิก)";
    }
    programsEl.innerHTML = "";
    CFG.PROGRAMS.forEach(function (p, i) {
      var div = document.createElement("div");
      div.className = "program";
      div.setAttribute("role", "button");
      div.setAttribute("tabindex", "0");
      div.dataset.id = p.id;
      div.innerHTML =
        '<div class="program__rank">' + (i + 1) + "</div>" +
        '<div class="program__body">' +
          '<div class="program__name">' + esc(p.th) + "</div>" +
          (p.en ? '<div class="program__en">' + esc(p.en) + "</div>" : "") +
        "</div>" +
        '<div class="program__hint">แตะเพื่อเลือก</div>';
      div.addEventListener("click", function () { toggle(p.id); });
      div.addEventListener("keydown", function (e) {
        if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggle(p.id); }
      });
      programsEl.appendChild(div);
    });
  }

  function toggle(id) {
    var idx = picked.indexOf(id);
    if (idx > -1) {
      picked.splice(idx, 1);
    } else {
      if (picked.length >= rankCount) {
        flash("เลือกได้สูงสุด " + rankCount + " อันดับ — แตะอันที่เลือกไว้เพื่อยกเลิกก่อน");
        return;
      }
      picked.push(id);
    }
    render();
  }

  function render() {
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

    rankSummaryEl.innerHTML = "";
    for (var i = 0; i < rankCount; i++) {
      var prog = picked[i] ? window.programById(picked[i]) : null;
      var row = document.createElement("div");
      row.className = "rank-summary__row";
      row.innerHTML = "<b>อันดับ " + (i + 1) + ":</b> " +
        (prog ? esc(prog.th) : '<span class="empty">ยังไม่ได้เลือก</span>');
      rankSummaryEl.appendChild(row);
    }
  }

  /* ---------- คำถามเพิ่มเติม (เรต / พิมพ์) ---------- */
  function buildExtraQuestions() {
    if (!extraEl) return;
    var qs = CFG.QUESTIONS || [];
    if (!qs.length) { extraEl.innerHTML = ""; return; }

    var html = '<section class="card">' +
      '<h2 class="card__title"><span class="step-badge">3</span> คำถามเพิ่มเติม</h2>' +
      '<p class="card__subtitle">ตอบคำถามจากคุณครู</p>';

    qs.forEach(function (q) {
      var req = q.required ? ' <span class="req">*</span>' : "";
      html += '<div class="field q-field" data-qid="' + esc(q.id) + '">';
      html += '<label>' + esc(q.label) + req + "</label>";
      if (q.type === "rate") {
        var max = q.max || 5;
        html += '<div class="rate" data-qid="' + esc(q.id) + '" data-max="' + max + '">';
        for (var s = 1; s <= max; s++) {
          html += '<button type="button" class="rate__star" data-val="' + s + '" aria-label="' + s + '">★</button>';
        }
        html += '<span class="rate__label" data-qid="' + esc(q.id) + '">ยังไม่ได้ให้คะแนน</span>';
        html += "</div>";
      } else {
        html += '<textarea class="input q-text" rows="3" data-qid="' + esc(q.id) +
          '" placeholder="พิมพ์คำตอบ..."></textarea>';
      }
      html += '<div class="field-error" data-for="q-' + esc(q.id) + '"></div>';
      html += "</div>";
    });

    html += "</section>";
    extraEl.innerHTML = html;

    // ผูก event ของ rate
    extraEl.querySelectorAll(".rate").forEach(function (rateEl) {
      var qid = rateEl.dataset.qid;
      rateEl.querySelectorAll(".rate__star").forEach(function (star) {
        star.addEventListener("click", function () {
          var val = +star.dataset.val;
          answers[qid] = val;
          paintRate(rateEl, val);
        });
      });
    });

    // ผูก event ของ textarea
    extraEl.querySelectorAll(".q-text").forEach(function (ta) {
      ta.addEventListener("input", function () { answers[ta.dataset.qid] = ta.value; });
    });
  }

  function paintRate(rateEl, val) {
    var qid = rateEl.dataset.qid;
    rateEl.querySelectorAll(".rate__star").forEach(function (st) {
      st.classList.toggle("on", +st.dataset.val <= val);
    });
    var lab = extraEl.querySelector('.rate__label[data-qid="' + qid + '"]');
    if (lab) lab.textContent = val + " / " + rateEl.dataset.max + " ★";
  }

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

  function setQError(qid, msg) {
    var box = document.querySelector('.field-error[data-for="q-' + qid + '"]');
    if (box) {
      box.textContent = msg || "";
      box.classList.toggle("show", !!msg);
    }
  }

  function clearErrors() {
    ["studentId", "number", "fullname", "classroom"].forEach(function (n) { setError(n, ""); });
    (CFG.QUESTIONS || []).forEach(function (q) { setQError(q.id, ""); });
  }

  function validate(data) {
    clearErrors();
    var ok = true;
    if (!/^\d{5}$/.test(data.studentId)) { setError("studentId", "กรุณากรอกรหัสนักเรียนเป็นตัวเลข 5 หลัก"); ok = false; }
    if (!/^\d{1,2}$/.test(data.number) || +data.number < 1) { setError("number", "กรุณากรอกเลขที่เป็นตัวเลข"); ok = false; }
    if (!data.fullname || data.fullname.trim().length < 3) { setError("fullname", "กรุณากรอกชื่อ-นามสกุล"); ok = false; }
    if (!data.classroom) { setError("classroom", "กรุณาเลือกห้องเรียน"); ok = false; }
    if (picked.length !== rankCount) { flash("กรุณาเลือกสาขาที่สนใจให้ครบ " + rankCount + " อันดับ"); ok = false; }

    (CFG.QUESTIONS || []).forEach(function (q) {
      if (!q.required) return;
      var a = answers[q.id];
      if (a === undefined || a === null || String(a).trim() === "") {
        setQError(q.id, "กรุณาตอบคำถามนี้");
        ok = false;
      }
    });
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
      choices: picked.slice(),
      choice1: picked[0] || "",
      choice2: picked[1] || "",
      choice3: picked[2] || "",
      answers: answers
    };

    if (!validate(data)) return;

    if (!CFG.GAS_URL || CFG.GAS_URL.indexOf("PASTE_YOUR") === 0) {
      flash("ระบบยังไม่ได้ตั้งค่า URL ของ Google Apps Script (ดูวิธีตั้งค่าใน README)");
      return;
    }

    setLoading(true);

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
    var ranks = picked.map(function (id) {
      var p = window.programById(id);
      return "<li>" + (p ? esc(p.th) : "-") + "</li>";
    }).join("");

    var extra = "";
    (CFG.QUESTIONS || []).forEach(function (q) {
      var a = answers[q.id];
      if (a === undefined || a === null || String(a).trim() === "") return;
      var val = q.type === "rate" ? (a + " / " + (q.max || 5) + " ★") : esc(String(a));
      extra += "<div style='margin-top:6px'><b>" + esc(q.label) + ":</b> " + val + "</div>";
    });

    detail.innerHTML =
      "<div><b>" + esc(data.fullname) + "</b> · เลขที่ " + esc(data.number) + " · ม." + esc(data.classroom) + "</div>" +
      "<div style='margin-top:8px'>สาขาที่เลือก:</div><ol>" + ranks + "</ol>" +
      extra +
      (updated ? "<div style='margin-top:8px;color:#1c7a44'>※ อัปเดตคำตอบเดิมของรหัสนักเรียนนี้แล้ว</div>" : "");
    successScreen.style.display = "block";
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  document.getElementById("againBtn").addEventListener("click", function () {
    form.reset();
    buildForm();
    successScreen.style.display = "none";
    form.style.display = "block";
    window.scrollTo({ top: 0, behavior: "smooth" });
  });

  /* ---------- utils ---------- */
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
    });
  }

})();
