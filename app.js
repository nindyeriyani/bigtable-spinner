// app.js — module
// Event-driven, no inline handlers. Keep this file in same folder as index.html & style.css

const replicas = {
  Jakarta: {},
  Surabaya: {},
  Makassar: {},
};

const regionState = {
  Jakarta: { online: true },
  Surabaya: { online: true, delaySec: 0 },
  Makassar: { online: true },
};

const globalIndex = {};

// --- Helpers ---
const $ = (id) => document.getElementById(id);
const nowStr = () => new Date().toLocaleTimeString();

function trueTime(eps = 0.002) {
  const now = Date.now() / 1000;
  return { earliest: now - eps, latest: now + eps };
}

function logLine(msg) {
  const el = $("log");
  const line = document.createElement("div");
  line.className = "line";
  line.textContent = `[${nowStr()}] ${msg}`;
  el.prepend(line);
}

// === NEW: Auto-clean form ===
function clearForm() {
  $("nim").value = "";
  $("nama").value = "";
  $("kampus").value = "";
  $("prodi").value = "";
  $("nim").focus();
}

// --- Coordinator (Spanner-like) ---
function proposeTransaction(nim, data, originRegion) {
  const tt = trueTime(0.002 + Math.random() * 0.0008);
  const commit = tt.latest + 0.0001;

  if (globalIndex[nim]) {
    return {
      ok: false,
      reason: "duplicate",
      existing: globalIndex[nim],
      proposed: commit,
      tt,
    };
  }

  globalIndex[nim] = commit;
  writeToReplicas(nim, data, commit, originRegion);
  return { ok: true, commit, tt };
}

function writeToReplicas(nim, data, commitTime, originRegion) {
  // Jakarta
  if (regionState.Jakarta.online) {
    replicas.Jakarta[nim] = { data, commit: commitTime };
  }

  // Surabaya (may delay)
  if (regionState.Surabaya.online) {
    const delay = regionState.Surabaya.delaySec || 0;
    if (delay > 0) {
      showSurabayaSpinner(true);
      logLine(
        `(delayed) Surabaya akan menerima NIM ${nim} setelah ${delay}s (origin=${originRegion})`
      );
      setTimeout(() => {
        replicas.Surabaya[nim] = { data, commit: commitTime };
        refreshTables();
        logLine(
          `✔️ Surabaya menerima NIM ${nim} (commit=${commitTime}) setelah delay`
        );
        showSurabayaSpinner(false);
      }, delay * 1000);
    } else {
      replicas.Surabaya[nim] = { data, commit: commitTime };
    }
  } else {
    logLine(`ℹ️ Surabaya offline — tidak menerima NIM ${nim} sekarang`);
  }

  // Makassar
  if (regionState.Makassar.online) {
    replicas.Makassar[nim] = { data, commit: commitTime };
  } else {
    logLine(
      `ℹ️ Makassar offline — NIM ${nim} tidak disimpan ke Makassar saat ini`
    );
  }

  refreshTables();
  updateGlobalIndexView();
}

// --- UI Actions ---
function insertFrom(region) {
  const nim = $("nim").value.trim();
  const nama = $("nama").value.trim();
  const kampus = $("kampus").value.trim();
  const prodi = $("prodi").value.trim();

  if (!nim || !nama) {
    alert("Isi NIM dan Nama minimal.");
    return;
  }

  logLine(`→ ${region} mencoba insert NIM ${nim}`);
  const res = proposeTransaction(nim, { nama, kampus, prodi }, region);

  if (res.ok) {
    logLine(
      `✔️ Commit berhasil: NIM ${nim} | commit=${res.commit} | origin=${region}`
    );

    // === NEW: clear form only when success
    clearForm();
  } else {
    logLine(
      `❌ Commit ditolak: NIM ${nim} duplicate (existing=${res.existing}) | origin=${region}`
    );
  }
}

function syncAll() {
  const source = replicas.Jakarta;
  for (const r of ["Surabaya", "Makassar"]) {
    if (regionState[r].online) {
      for (const nim in source) {
        const srcRec = source[nim];
        const existing = replicas[r][nim];
        if (!existing || srcRec.commit > existing.commit) {
          replicas[r][nim] = JSON.parse(JSON.stringify(srcRec));
        }
      }
      logLine(`🔄 Sync: Jakarta -> ${r} (online)`);
    } else {
      logLine(`🔄 Skip sync -> ${r} (offline)`);
    }
  }
  refreshTables();
  updateGlobalIndexView();
}

function toggleMakassar() {
  regionState.Makassar.online = !regionState.Makassar.online;
  const btn = $("btnToggleMks");
  const dot = $("dotMks");
  if (!regionState.Makassar.online) {
    btn.textContent = "Reconnect Makassar";
    dot.classList.remove("online");
    dot.classList.add("offline");
    logLine("⛔ Makassar di-disconnect (offline)");
  } else {
    btn.textContent = "Disconnect Makassar";
    dot.classList.remove("offline");
    dot.classList.add("online");
    logLine("✅ Makassar direconnect (online). Menyinkronkan dari Jakarta...");
    const source = replicas.Jakarta;
    for (const nim in source) {
      const srcRec = source[nim];
      const existing = replicas.Makassar[nim];
      if (!existing || srcRec.commit > existing.commit) {
        replicas.Makassar[nim] = JSON.parse(JSON.stringify(srcRec));
      }
    }
    refreshTables();
    updateGlobalIndexView();
  }
}

function applyDelay() {
  let val = parseFloat($("delaySby").value);
  if (isNaN(val) || val < 0) val = 0;
  regionState.Surabaya.delaySec = val;
  $("sbyDelayLabel").textContent = ` (delay ${val}s)`;
  logLine(`⏱️ Delay Surabaya diatur ke ${val}s`);
}

function simulateConflict() {
  let nim = $("nim").value.trim();
  if (!nim) {
    nim = "CF" + Math.floor(Math.random() * 9000 + 1000);
    $("nim").value = nim;
  }
  const nama = $("nama").value.trim() || "Alice";
  const nama2 = $("nama").value.trim() ? $("nama").value.trim() + "_2" : "Bob";
  const kampus = $("kampus").value.trim() || "UnivA";
  const kampus2 = $("kampus").value.trim() || "UnivB";

  logLine(
    `⚔️ Simulasi konflik: Jakarta & Surabaya akan mengirim NIM ${nim} hampir bersamaan`
  );

  setTimeout(() => {
    logLine("→ Jakarta mengirim...");
    const resJ = proposeTransaction(
      nim,
      { nama, kampus, prodi: $("prodi").value || "S1" },
      "Jakarta"
    );
    if (resJ.ok)
      logLine(`✔️ Jakarta commit NIM ${nim} (commit=${resJ.commit})`);
    else logLine(`❌ Jakarta ditolak: duplicate`);
  }, Math.random() * 10);

  setTimeout(() => {
    logLine("→ Surabaya mengirim...");
    const resS = proposeTransaction(
      nim,
      { nama: nama2, kampus: kampus2, prodi: $("prodi").value || "S1" },
      "Surabaya"
    );
    if (resS.ok)
      logLine(`✔️ Surabaya commit NIM ${nim} (commit=${resS.commit})`);
    else logLine(`❌ Surabaya ditolak: duplicate`);
  }, Math.random() * 10 + 3);

  setTimeout(() => {
    refreshTables();
    updateGlobalIndexView();
  }, 220);
}

function clearLog() {
  $("log").innerHTML = "";
}

// --- UI rendering ---
function renderTable(region, containerId) {
  const data = replicas[region];
  const keys = Object.keys(data).sort();
  const wrap = $(containerId);
  let html =
    '<table class="region-table"><thead><tr><th>NIM</th><th>Nama</th><th>Kampus</th><th>Prodi</th><th>Commit</th></tr></thead><tbody>';
  if (keys.length === 0) {
    html += '<tr><td colspan="5" class="muted">-- kosong --</td></tr>';
  } else {
    for (const nim of keys) {
      const r = data[nim];
      html += `<tr><td>${escapeHtml(nim)}</td><td>${escapeHtml(
        r.data.nama || ""
      )}</td><td>${escapeHtml(r.data.kampus || "")}</td><td>${escapeHtml(
        r.data.prodi || ""
      )}</td><td>${Number(r.commit).toFixed(6)}</td></tr>`;
    }
  }
  html += "</tbody></table>";
  wrap.innerHTML = html;
}

function escapeHtml(s = "") {
  return String(s).replace(
    /[&<>"'`]/g,
    (ch) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
        "`": "&#96;",
      }[ch])
  );
}

function refreshTables() {
  renderTable("Jakarta", "jktTable");
  renderTable("Surabaya", "sbyTable");
  renderTable("Makassar", "mksTable");
}

function updateGlobalIndexView() {
  $("globalIndex").textContent = JSON.stringify(globalIndex, null, 2);
}

function showSurabayaSpinner(show) {
  const spinner = document.querySelector("#spinnerSby");
  if (show) spinner.classList.remove("hidden");
  else spinner.classList.add("hidden");
}

// --- wire events on DOMContentLoaded ---
document.addEventListener("DOMContentLoaded", () => {
  $("btnInsertJkt").addEventListener("click", () => insertFrom("Jakarta"));
  $("btnInsertSby").addEventListener("click", () => insertFrom("Surabaya"));
  $("btnInsertMks").addEventListener("click", () => insertFrom("Makassar"));

  $("btnSync").addEventListener("click", syncAll);
  $("btnToggleMks").addEventListener("click", toggleMakassar);
  $("btnSetDelay").addEventListener("click", applyDelay);
  $("btnConflict").addEventListener("click", simulateConflict);
  $("btnClearLog").addEventListener("click", clearLog);

  refreshTables();
  updateGlobalIndexView();
});