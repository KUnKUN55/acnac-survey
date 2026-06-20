/* ============================================================
   Dashboard logic — หน้าครู
   ============================================================ */
(function () {
  "use strict";

  var CFG = window.APP_CONFIG;
  var COLORS = window.PROGRAM_COLORS;
  var SESSION_KEY = "acnac_dash_auth";

  var allData = [];          // ข้อมูลนักเรียนทั้งหมด
  var charts = {};           // เก็บอ้างอิง Chart instance
  var currentPass = "";

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

  // จำการล็อกอินไว้ในแท็บนี้
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
        // Chart.js ต้องการ resize เมื่อ panel ถูกแสดง
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

    var url = CFG.GAS_URL + "?action=list&passcode=" + encodeURIComponent(currentPass);
    fetch(url)
      .then(function (r) { return r.json(); })
      .then(function (res) {
        loading.style.display = "none";
        if (res && res.ok) {
          allData = res.data || [];
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

  /* ===================== คำนวณ & วาด ===================== */
  function renderAll() {
    renderStats();
    renderOverallCharts();
    setupRoomTab();
    setupIndividualTab();
  }

  // นับจำนวนแต่ละสาขาในคอลัมน์อันดับที่กำหนด
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
    CFG.PROGRAMS.forEach(function (p, i) {
      if (counts[p.id] > 0) {
        labels.push(p.th);
        data.push(counts[p.id]);
        colors.push(COLORS[i]);
      }
    });
    return { labels: labels, data: data, colors: colors };
  }

  function renderStats() {
    var total = allData.length;
    var perRoom = {};
    CFG.CLASSES.forEach(function (c) { perRoom[c] = 0; });
    allData.forEach(function (r) { if (perRoom.hasOwnProperty(r.classroom)) perRoom[r.classroom]++; });

    // สาขายอดนิยมอันดับ 1
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

  // วาดกราฟวงกลม + คำอธิบายใต้กราฟแบบจัดอันดับ (1-7 พร้อม %)
  function drawRankChart(canvasId, key, legendId, counts) {
    drawPie(canvasId, key, toChartData(counts));
    renderRankedLegend(legendId, counts);
  }

  // คำอธิบายใต้กราฟ: เรียงจากมากไปน้อย โชว์ครบทั้ง 7 สาขา + จำนวน + %
  function renderRankedLegend(legendId, counts) {
    var el = document.getElementById(legendId);
    if (!el) return;
    var total = 0;
    CFG.PROGRAMS.forEach(function (p) { total += counts[p.id] || 0; });

    var arr = CFG.PROGRAMS.map(function (p, i) {
      return { name: p.th, color: COLORS[i], n: counts[p.id] || 0 };
    });
    arr.sort(function (a, b) { return b.n - a.n; }); // มากไปน้อย

    el.innerHTML = arr.map(function (x, idx) {
      var pct = total ? Math.round((x.n / total) * 100) : 0;
      return '<div class="lg-row' + (x.n === 0 ? ' lg-zero' : '') + '">' +
        '<span class="lg-rank">' + (idx + 1) + '</span>' +
        '<span class="lg-dot" style="background:' + x.color + '"></span>' +
        '<span class="lg-name" title="' + x.name + '">' + x.name + '</span>' +
        '<span class="lg-val"><b>' + x.n + '</b> คน · ' + pct + '%</span>' +
        '</div>';
    }).join("");
  }

  function drawPie(canvasId, key, cd) {
    var canvas = document.getElementById(canvasId);
    var wrap = canvas.parentElement;

    // ลบ empty state เก่า
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
          legend: { display: false }, // ใช้คำอธิบายแบบจัดอันดับด้านล่างแทน
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
    if (!sel.dataset.init) {
      CFG.CLASSES.forEach(function (c) {
        var o = document.createElement("option");
        o.value = c; o.textContent = "ม." + c;
        sel.appendChild(o);
      });
      sel.addEventListener("change", function () { renderRoomCharts(sel.value); });
      sel.dataset.init = "1";
    }
    if (!sel.value) sel.value = CFG.CLASSES[0];
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
    if (!filterRoom.dataset.init) {
      CFG.CLASSES.forEach(function (c) {
        var o = document.createElement("option");
        o.value = c; o.textContent = "ม." + c;
        filterRoom.appendChild(o);
      });
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

    // จัดกลุ่มตามห้อง
    var groups = {};
    rows.forEach(function (r) { (groups[r.classroom] = groups[r.classroom] || []).push(r); });

    var html = "";
    CFG.CLASSES.forEach(function (room) {
      if (!groups[room]) return;
      html += '<div class="room-group-title"><span class="chip chip--room">ม.' + room +
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
          "<td>" + progName(r.choice1) + "</td>" +
          "<td>" + progName(r.choice2) + "</td>" +
          "<td>" + progName(r.choice3) + "</td>" +
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

  function progName(id) {
    var p = window.programById(id);
    return p ? '<span class="chip">' + p.th + "</span>" : '<span class="tap-hint">-</span>';
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
    var ranksHtml = ranks.map(function (x) {
      var p = window.programById(x.id);
      return '<div class="detail-rank">' +
        '<div class="num ' + x.cls + '">' + x.n + "</div>" +
        '<div class="txt">' + (p ? p.th : "-") +
        (p ? "<small>" + p.en + "</small>" : "") + "</div></div>";
    }).join("");

    document.getElementById("modalBody").innerHTML =
      '<div class="detail-row"><span>รหัสนักเรียน</span><span>' + esc(r.studentId) + "</span></div>" +
      '<div class="detail-row"><span>ชื่อ - นามสกุล</span><span>' + esc(r.fullname) + "</span></div>" +
      '<div class="detail-row"><span>เลขที่</span><span>' + esc(r.number) + "</span></div>" +
      '<div class="detail-row"><span>ชั้น</span><span>ม.' + esc(r.classroom) + "</span></div>" +
      (r.timestamp ? '<div class="detail-row"><span>ส่งเมื่อ</span><span>' + fmtTime(r.timestamp) + "</span></div>" : "") +
      '<div style="margin-top:16px;font-weight:800;color:#8a1c2b">สาขาที่สนใจ 3 อันดับ</div>' +
      '<div class="detail-ranks">' + ranksHtml + "</div>";

    backdrop.classList.add("show");
  }
  function closeModal() { backdrop.classList.remove("show"); }

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
