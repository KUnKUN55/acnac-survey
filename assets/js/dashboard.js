/* ============================================================
   Dashboard logic — หน้าครู
   ============================================================ */
(function () {
  "use strict";

  var CFG = window.APP_CONFIG;
  var SESSION_KEY = "acnac_dash_auth";

  var allData = [];          // ข้อมูลนักเรียนทั้งหมด
  var charts = {};           // เก็บอ้างอิง Chart instance
  var currentPass = "";
  var draft = null;          // สำเนาค่าตั้งค่าที่ครูกำลังแก้ไข

  /* ===================== ประตูรหัสผ่าน ===================== */
  var gateWrap = document.getElementById("gateWrap");
  var dashWrap = document.getElementById("dashWrap");
  var gateForm = document.getElementById("gateForm");
  var gateAlert = document.getElementById("gateAlert");

  gateForm.addEventListener("submit", function (e) {
    e.preventDefault();
    var val = document.getElementById("passcode").value.trim();
    if (val === CFG.TEACHER_PASSCODE) {
      sessionStorage.setItem(SESSION_KEY, val);
      enterDashboard(val);
    } else {
      gateAlert.textContent = "รหัสผ่านไม่ถูกต้อง กรุณาลองใหม่";
      gateAlert.className = "alert show alert--error";
    }
  });

  var saved = sessionStorage.getItem(SESSION_KEY);
  if (saved === CFG.TEACHER_PASSCODE) enterDashboard(saved);

  document.getElementById("logoutBtn").addEventListener("click", function () {
    sessionStorage.removeItem(SESSION_KEY);
    location.reload();
  });

  function enterDashboard(pass) {
    currentPass = pass;
    gateWrap.style.display = "none";
    dashWrap.style.display = "block";
    initTabs();
    initManage();
    loadData();
  }

  /* ===================== แท็บ ===================== */
  function initTabs() {
    document.querySelectorAll(".tab").forEach(function (tab) {
      tab.addEventListener("click", function () {
        document.querySelectorAll(".tab").forEach(function (t) { t.classList.remove("active"); });
        tab.classList.add("active");
        var name = tab.dataset.tab;
        document.querySelectorAll(".tab-panel").forEach(function (p) {
          p.classList.toggle("active", p.dataset.panel === name);
        });
        Object.keys(charts).forEach(function (k) { if (charts[k]) charts[k].resize(); });
      });
    });
  }

  /* ===================== โหลดข้อมูล ===================== */
  document.getElementById("refreshBtn").addEventListener("click", loadData);

  function loadData() {
    var loading = document.getElementById("loadingBlock");
    loading.style.display = "block";

    if (!CFG.GAS_URL || CFG.GAS_URL.indexOf("PASTE_YOUR") === 0) {
      loading.innerHTML = "⚠️ ยังไม่ได้ตั้งค่า URL ของ Google Apps Script<br><span class='tap-hint'>โปรดดูวิธีตั้งค่าใน README.md</span>";
      return;
    }

    var url = CFG.GAS_URL + "?action=list&passcode=" + encodeURIComponent(currentPass) + "&t=" + Date.now();
    fetch(url)
      .then(function (r) { return r.json(); })
      .then(function (res) {
        loading.style.display = "none";
        if (res && res.ok) {
          allData = res.data || [];
          if (res.config) window.applyLiveConfig(res.config, res.sheetUrl);
          setupSheetLink(res.sheetUrl || CFG.SHEET_URL);
          draft = null;        // โหลดค่าล่าสุดจากเซิร์ฟเวอร์ -> รีเซ็ตฉบับร่าง
          renderManage();      // อัปเดตหน้าจัดการให้ตรงค่าล่าสุด
          renderAll();
        } else {
          loading.style.display = "block";
          loading.innerHTML = "เกิดข้อผิดพลาด: " + ((res && res.error) || "ไม่ทราบสาเหตุ");
        }
      })
      .catch(function () {
        loading.style.display = "block";
        loading.innerHTML = "เชื่อมต่อไม่สำเร็จ กรุณาตรวจสอบ URL ของ GAS และอินเทอร์เน็ต";
      });
  }

  function setupSheetLink(url) {
    var a = document.getElementById("sheetLink");
    if (a && url) { a.href = url; a.style.display = ""; }
  }

  /* ===================== คำนวณ & วาด ===================== */
  function renderAll() {
    renderStats();
    renderOverallCharts();
    setupRoomTab();
    setupIndividualTab();
  }

  function countByChoice(rows, choiceKey) {
    var counts = {};
    CFG.PROGRAMS.forEach(function (p) { counts[p.id] = 0; });
    rows.forEach(function (r) {
      var id = r[choiceKey];
      if (id && counts.hasOwnProperty(id)) counts[id]++;
    });
    return counts;
  }

  function toChartData(counts) {
    var labels = [], data = [], colors = [];
    CFG.PROGRAMS.forEach(function (p) {
      if (counts[p.id] > 0) {
        labels.push(p.th);
        data.push(counts[p.id]);
        colors.push(window.programColor(p.id));
      }
    });
    return { labels: labels, data: data, colors: colors };
  }

  function renderStats() {
    var total = allData.length;
    var perRoom = {};
    CFG.CLASSES.forEach(function (c) { perRoom[c] = 0; });
    allData.forEach(function (r) { if (perRoom.hasOwnProperty(r.classroom)) perRoom[r.classroom]++; });

    var c1 = countByChoice(allData, "choice1");
    var topId = null, topN = -1;
    Object.keys(c1).forEach(function (id) { if (c1[id] > topN) { topN = c1[id]; topId = id; } });
    var topProg = topN > 0 ? window.programById(topId) : null;

    var html = "";
    html += statCard(total, "ผู้ตอบทั้งหมด (คน)");
    html += statCard(topProg ? topProg.th : "—", "สาขายอดนิยม (อันดับ 1)", true);
    CFG.CLASSES.forEach(function (c) {
      html += statCard(perRoom[c], "ม." + c);
    });
    document.getElementById("statsRow").innerHTML = html;
  }

  function statCard(num, label, small) {
    return '<div class="stat"><div class="stat__num"' +
      (small ? ' style="font-size:1.05rem;line-height:1.3"' : "") +
      '>' + num + '</div><div class="stat__label">' + label + "</div></div>";
  }

  function renderOverallCharts() {
    drawRankChart("chartOverall1", "overall1", "legendOverall1", countByChoice(allData, "choice1"));
    drawRankChart("chartOverall2", "overall2", "legendOverall2", countByChoice(allData, "choice2"));
    drawRankChart("chartOverall3", "overall3", "legendOverall3", countByChoice(allData, "choice3"));
  }

  function drawRankChart(canvasId, key, legendId, counts) {
    drawPie(canvasId, key, toChartData(counts));
    renderRankedLegend(legendId, counts);
  }

  function renderRankedLegend(legendId, counts) {
    var el = document.getElementById(legendId);
    if (!el) return;
    var total = 0;
    CFG.PROGRAMS.forEach(function (p) { total += counts[p.id] || 0; });

    var arr = CFG.PROGRAMS.map(function (p) {
      return { name: p.th, color: window.programColor(p.id), n: counts[p.id] || 0 };
    });
    arr.sort(function (a, b) { return b.n - a.n; });

    el.innerHTML = arr.map(function (x, idx) {
      var pct = total ? Math.round((x.n / total) * 100) : 0;
      return '<div class="lg-row' + (x.n === 0 ? ' lg-zero' : '') + '">' +
        '<span class="lg-rank">' + (idx + 1) + '</span>' +
        '<span class="lg-dot" style="background:' + x.color + '"></span>' +
        '<span class="lg-name" title="' + esc(x.name) + ' — ' + x.n + ' คน">' + esc(x.name) + '</span>' +
        '<span class="lg-val"><b>' + pct + '%</b></span>' +
        '</div>';
    }).join("");
  }

  function drawPie(canvasId, key, cd) {
    var canvas = document.getElementById(canvasId);
    var wrap = canvas.parentElement;

    var oldEmpty = wrap.querySelector(".chart-empty");
    if (oldEmpty) oldEmpty.remove();

    if (charts[key]) { charts[key].destroy(); charts[key] = null; }

    if (!cd.data.length) {
      canvas.style.display = "none";
      var e = document.createElement("div");
      e.className = "chart-empty";
      e.textContent = "ยังไม่มีข้อมูล";
      wrap.appendChild(e);
      return;
    }
    canvas.style.display = "block";

    var total = cd.data.reduce(function (a, b) { return a + b; }, 0);
    charts[key] = new Chart(canvas, {
      type: "doughnut",
      data: {
        labels: cd.labels,
        datasets: [{
          data: cd.data,
          backgroundColor: cd.colors,
          borderColor: "#fff",
          borderWidth: 2,
          hoverOffset: 8
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: "55%",
        plugins: {
          legend: { display: false },
          tooltip: {
            bodyFont: { family: "'Noto Sans Thai', sans-serif" },
            titleFont: { family: "'Noto Sans Thai', sans-serif" },
            callbacks: {
              label: function (ctx) {
                var v = ctx.parsed;
                var pct = total ? Math.round((v / total) * 100) : 0;
                return "  " + v + " คน (" + pct + "%)";
              }
            }
          }
        }
      }
    });
  }

  /* ===================== แท็บรายห้อง ===================== */
  function setupRoomTab() {
    var sel = document.getElementById("roomSelect");
    sel.innerHTML = "";
    CFG.CLASSES.forEach(function (c) {
      var o = document.createElement("option");
      o.value = c; o.textContent = "ม." + c;
      sel.appendChild(o);
    });
    if (!sel.dataset.init) {
      sel.addEventListener("change", function () { renderRoomCharts(sel.value); });
      sel.dataset.init = "1";
    }
    sel.value = CFG.CLASSES[0];
    renderRoomCharts(sel.value);
  }

  function renderRoomCharts(room) {
    var rows = allData.filter(function (r) { return r.classroom === room; });
    document.getElementById("roomCount").textContent = "(" + rows.length + " คนในห้องนี้)";
    drawRankChart("chartRoom1", "room1", "legendRoom1", countByChoice(rows, "choice1"));
    drawRankChart("chartRoom2", "room2", "legendRoom2", countByChoice(rows, "choice2"));
    drawRankChart("chartRoom3", "room3", "legendRoom3", countByChoice(rows, "choice3"));
  }

  /* ===================== แท็บรายบุคคล ===================== */
  function setupIndividualTab() {
    var filterRoom = document.getElementById("filterRoom");
    var cur = filterRoom.value;
    filterRoom.innerHTML = '<option value="">ทุกห้อง</option>';
    CFG.CLASSES.forEach(function (c) {
      var o = document.createElement("option");
      o.value = c; o.textContent = "ม." + c;
      filterRoom.appendChild(o);
    });
    filterRoom.value = cur || "";
    if (!filterRoom.dataset.init) {
      filterRoom.addEventListener("change", renderIndividual);
      document.getElementById("searchInput").addEventListener("input", renderIndividual);
      filterRoom.dataset.init = "1";
    }
    renderIndividual();
  }

  function sortRows(rows) {
    return rows.slice().sort(function (a, b) {
      if (a.classroom !== b.classroom) {
        return CFG.CLASSES.indexOf(a.classroom) - CFG.CLASSES.indexOf(b.classroom);
      }
      return (parseInt(a.number, 10) || 0) - (parseInt(b.number, 10) || 0);
    });
  }

  function renderIndividual() {
    var q = document.getElementById("searchInput").value.trim().toLowerCase();
    var roomF = document.getElementById("filterRoom").value;
    var container = document.getElementById("individualList");

    var rows = allData.filter(function (r) {
      if (roomF && r.classroom !== roomF) return false;
      if (!q) return true;
      return (r.fullname || "").toLowerCase().indexOf(q) > -1 ||
             String(r.studentId || "").indexOf(q) > -1 ||
             String(r.number || "").indexOf(q) > -1;
    });
    rows = sortRows(rows);

    if (!rows.length) {
      container.innerHTML = '<div class="chart-empty" style="padding:50px 0">ไม่พบข้อมูลนักเรียน</div>';
      return;
    }

    var groups = {};
    rows.forEach(function (r) { (groups[r.classroom] = groups[r.classroom] || []).push(r); });

    var html = "";
    CFG.CLASSES.forEach(function (room) {
      if (!groups[room]) return;
      html += '<div class="room-group-title"><span class="chip chip--room">ม.' + esc(room) +
        '</span> <span class="count">' + groups[room].length + " คน</span></div>";
      html += '<div class="table-wrap"><div class="table-scroll"><table class="data"><thead><tr>' +
        "<th>เลขที่</th><th>รหัสนักเรียน</th><th>ชื่อ - นามสกุล</th>" +
        "<th>อันดับ 1</th><th>อันดับ 2</th><th>อันดับ 3</th><th></th>" +
        "</tr></thead><tbody>";
      groups[room].forEach(function (r) {
        var idx = allData.indexOf(r);
        html += '<tr data-idx="' + idx + '">' +
          "<td><b>" + esc(r.number) + "</b></td>" +
          "<td>" + esc(r.studentId) + "</td>" +
          "<td>" + esc(r.fullname) + "</td>" +
          "<td>" + progChip(r.choice1) + "</td>" +
          "<td>" + progChip(r.choice2) + "</td>" +
          "<td>" + progChip(r.choice3) + "</td>" +
          '<td class="tap-hint">ดู ›</td>' +
          "</tr>";
      });
      html += "</tbody></table></div></div>";
    });
    container.innerHTML = html;

    container.querySelectorAll("tr[data-idx]").forEach(function (tr) {
      tr.addEventListener("click", function () { openModal(allData[+tr.dataset.idx]); });
    });
  }

  function progChip(id) {
    var p = window.programById(id);
    return p ? '<span class="chip">' + esc(p.th) + "</span>" : '<span class="tap-hint">-</span>';
  }

  /* ===================== Modal ===================== */
  var backdrop = document.getElementById("modalBackdrop");
  document.getElementById("modalClose").addEventListener("click", closeModal);
  backdrop.addEventListener("click", function (e) { if (e.target === backdrop) closeModal(); });
  document.addEventListener("keydown", function (e) { if (e.key === "Escape") closeModal(); });

  function openModal(r) {
    if (!r) return;
    document.getElementById("modalName").textContent = r.fullname || "—";
    document.getElementById("modalMeta").textContent =
      "ม." + r.classroom + " · เลขที่ " + r.number + " · รหัส " + r.studentId;

    var ranks = [
      { n: 1, id: r.choice1, cls: "r1" },
      { n: 2, id: r.choice2, cls: "r2" },
      { n: 3, id: r.choice3, cls: "r3" }
    ];
    var ans = r.answers || {};
    var ranksHtml = ranks.map(function (x) {
      if (!x.id) return "";
      var p = window.programById(x.id);
      var reason = ans["reason" + x.n];
      var reasonHtml = (reason && String(reason).trim())
        ? '<div class="detail-reason"><b>เหตุผล:</b> ' + esc(String(reason)) + "</div>"
        : "";
      return '<div class="detail-rank">' +
        '<div class="num ' + x.cls + '">' + x.n + "</div>" +
        '<div class="txt">' + (p ? esc(p.th) : "-") +
        (p && p.en ? "<small>" + esc(p.en) + "</small>" : "") + reasonHtml + "</div></div>";
    }).join("");

    // คำตอบคำถามเพิ่มเติม
    var extraHtml = "";
    var qs = CFG.QUESTIONS || [];
    if (qs.length) {
      var rows = qs.map(function (q) {
        var a = ans[q.id];
        var val;
        if (a === undefined || a === null || String(a).trim() === "") val = '<span class="tap-hint">— ไม่ได้ตอบ —</span>';
        else if (q.type === "rate") val = esc(String(a)) + " / " + (q.max || 5) + " ★";
        else val = esc(String(a));
        return '<div class="detail-row"><span>' + esc(q.label) + "</span><span>" + val + "</span></div>";
      }).join("");
      extraHtml =
        '<div style="margin-top:16px;font-weight:800;color:#8a1c2b">คำถามเพิ่มเติม</div>' + rows;
    }

    document.getElementById("modalBody").innerHTML =
      '<div class="detail-row"><span>รหัสนักเรียน</span><span>' + esc(r.studentId) + "</span></div>" +
      '<div class="detail-row"><span>ชื่อ - นามสกุล</span><span>' + esc(r.fullname) + "</span></div>" +
      '<div class="detail-row"><span>เลขที่</span><span>' + esc(r.number) + "</span></div>" +
      '<div class="detail-row"><span>ชั้น</span><span>ม.' + esc(r.classroom) + "</span></div>" +
      (r.timestamp ? '<div class="detail-row"><span>ส่งเมื่อ</span><span>' + fmtTime(r.timestamp) + "</span></div>" : "") +
      '<div style="margin-top:16px;font-weight:800;color:#8a1c2b">สาขาที่สนใจ</div>' +
      '<div class="detail-ranks">' + ranksHtml + "</div>" +
      extraHtml;

    backdrop.classList.add("show");
  }
  function closeModal() { backdrop.classList.remove("show"); }

  /* ============================================================
   *  แท็บจัดการแบบสอบถาม
   * ============================================================ */
  function initManage() {
    document.getElementById("addProgBtn").addEventListener("click", addProgram);
    document.getElementById("addClassBtn").addEventListener("click", addClass);
    document.getElementById("addQBtn").addEventListener("click", addQuestion);
    document.getElementById("saveCfgBtn").addEventListener("click", saveConfig);

    // ซ่อน/แสดงช่องจำนวนดาวตามชนิดคำถาม
    document.getElementById("newQType").addEventListener("change", function () {
      document.getElementById("newQMax").style.display =
        this.value === "rate" ? "" : "none";
    });

    document.getElementById("rankCountInput").addEventListener("change", function () {
      if (draft) draft.rankCount = Math.max(1, Math.min(parseInt(this.value, 10) || 1, draft.programs.length));
      this.value = draft ? draft.rankCount : this.value;
    });

    document.getElementById("askReasonInput").addEventListener("change", function () {
      if (draft) draft.askReason = this.checked;
    });
  }

  function ensureDraft() {
    if (draft) return;     // มีฉบับร่างที่ครูกำลังแก้อยู่แล้ว — ไม่ทับ
    resetDraft();
  }

  function resetDraft() {
    draft = {
      programs: (CFG.PROGRAMS || []).map(function (p) { return { id: p.id, th: p.th, en: p.en || "" }; }),
      classes: (CFG.CLASSES || []).slice(),
      rankCount: CFG.rankCount || 3,
      askReason: !!CFG.askReason,
      questions: (CFG.QUESTIONS || []).map(function (q) {
        return { id: q.id, label: q.label, type: q.type, max: q.max, required: !!q.required };
      })
    };
  }

  function renderManage() {
    ensureDraft();

    // สาขา
    var pl = document.getElementById("progList");
    pl.innerHTML = draft.programs.map(function (p, i) {
      return '<div class="edit-item">' +
        '<span class="edit-item__idx">' + (i + 1) + "</span>" +
        '<span class="edit-item__main"><b>' + esc(p.th) + "</b>" +
        (p.en ? '<small>' + esc(p.en) + "</small>" : "") + "</span>" +
        '<button class="del-btn" data-type="prog" data-i="' + i + '" type="button">ลบ</button>' +
        "</div>";
    }).join("") || '<div class="tap-hint">ยังไม่มีสาขา</div>';

    document.getElementById("rankCountInput").value = draft.rankCount;
    document.getElementById("rankCountInput").max = draft.programs.length;
    document.getElementById("askReasonInput").checked = !!draft.askReason;

    // ห้องเรียน
    var cl = document.getElementById("classList");
    cl.innerHTML = draft.classes.map(function (c, i) {
      return '<div class="edit-item edit-item--chip">' +
        '<span class="edit-item__main">ม.' + esc(c) + "</span>" +
        '<button class="del-btn" data-type="class" data-i="' + i + '" type="button">ลบ</button>' +
        "</div>";
    }).join("") || '<div class="tap-hint">ยังไม่มีห้องเรียน</div>';

    // คำถาม
    var ql = document.getElementById("qList");
    ql.innerHTML = draft.questions.map(function (q, i) {
      var badge = q.type === "rate"
        ? '<span class="q-badge q-badge--rate">เรต ' + (q.max || 5) + "★</span>"
        : '<span class="q-badge q-badge--text">พิมพ์</span>';
      var req = q.required ? '<span class="q-badge q-badge--req">บังคับ</span>' : "";
      return '<div class="edit-item">' +
        '<span class="edit-item__idx">' + (i + 1) + "</span>" +
        '<span class="edit-item__main"><b>' + esc(q.label) + "</b></span>" +
        badge + req +
        '<button class="del-btn" data-type="q" data-i="' + i + '" type="button">ลบ</button>' +
        "</div>";
    }).join("") || '<div class="tap-hint">ยังไม่มีคำถามเพิ่มเติม</div>';

    // ผูกปุ่มลบ
    document.querySelectorAll(".manage-grid .del-btn").forEach(function (b) {
      b.onclick = function () {
        var t = b.dataset.type, i = +b.dataset.i;
        if (t === "prog") draft.programs.splice(i, 1);
        else if (t === "class") draft.classes.splice(i, 1);
        else if (t === "q") draft.questions.splice(i, 1);
        if (draft.rankCount > draft.programs.length) draft.rankCount = Math.max(1, draft.programs.length);
        renderManage();
      };
    });
  }

  function addProgram() {
    var th = document.getElementById("newProgTh").value.trim();
    var en = document.getElementById("newProgEn").value.trim();
    if (!th) { manageAlert("กรุณากรอกชื่อสาขา (ภาษาไทย)", "error"); return; }
    draft.programs.push({ id: genId("p"), th: th, en: en });
    document.getElementById("newProgTh").value = "";
    document.getElementById("newProgEn").value = "";
    renderManage();
  }

  function addClass() {
    var c = document.getElementById("newClass").value.trim();
    if (!c) { manageAlert("กรุณากรอกชื่อห้องเรียน", "error"); return; }
    if (draft.classes.indexOf(c) > -1) { manageAlert("มีห้องนี้อยู่แล้ว", "error"); return; }
    draft.classes.push(c);
    document.getElementById("newClass").value = "";
    renderManage();
  }

  function addQuestion() {
    var label = document.getElementById("newQLabel").value.trim();
    var type = document.getElementById("newQType").value;
    var max = parseInt(document.getElementById("newQMax").value, 10) || 5;
    var required = document.getElementById("newQReq").checked;
    if (!label) { manageAlert("กรุณากรอกข้อความคำถาม", "error"); return; }
    var q = { id: genId("q"), label: label, type: type, required: required };
    if (type === "rate") q.max = Math.max(2, Math.min(max, 10));
    draft.questions.push(q);
    document.getElementById("newQLabel").value = "";
    document.getElementById("newQReq").checked = false;
    renderManage();
  }

  function saveConfig() {
    var btn = document.getElementById("saveCfgBtn");
    if (draft.programs.length < 1) { manageAlert("ต้องมีอย่างน้อย 1 สาขา", "error"); return; }
    if (draft.classes.length < 1) { manageAlert("ต้องมีอย่างน้อย 1 ห้องเรียน", "error"); return; }

    btn.disabled = true;
    btn.innerHTML = '<span class="spinner"></span> กำลังบันทึก...';

    fetch(CFG.GAS_URL, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({ action: "saveConfig", passcode: currentPass, config: draft })
    })
      .then(function (r) { return r.json(); })
      .then(function (res) {
        btn.disabled = false;
        btn.innerHTML = "💾 บันทึกการตั้งค่า";
        if (res && res.ok) {
          if (res.config) window.applyLiveConfig(res.config, CFG.SHEET_URL);
          manageAlert("บันทึกเรียบร้อยแล้ว ✓ ระบบอัปเดตแบบสอบถามและ Google Sheet ให้แล้ว", "ok");
          draft = null;        // ซิงก์กับค่าที่เซิร์ฟเวอร์ตอบกลับ
          renderManage();
          renderAll();
        } else {
          manageAlert((res && res.error) || "บันทึกไม่สำเร็จ", "error");
        }
      })
      .catch(function () {
        btn.disabled = false;
        btn.innerHTML = "💾 บันทึกการตั้งค่า";
        manageAlert("เชื่อมต่อไม่สำเร็จ กรุณาลองใหม่", "error");
      });
  }

  function manageAlert(msg, type) {
    var el = document.getElementById("manageAlert");
    el.textContent = msg;
    el.className = "alert show alert--" + (type === "ok" ? "ok" : "error");
    el.scrollIntoView({ behavior: "smooth", block: "nearest" });
    if (type === "ok") setTimeout(function () { el.className = "alert"; }, 4000);
  }

  function genId(prefix) {
    return prefix + Date.now().toString(36) + Math.floor(Math.random() * 1000).toString(36);
  }

  /* ===================== utils ===================== */
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
    });
  }
  function fmtTime(t) {
    try {
      var d = new Date(t);
      if (isNaN(d)) return esc(t);
      return d.toLocaleString("th-TH", { dateStyle: "medium", timeStyle: "short" });
    } catch (e) { return esc(t); }
  }

})();
