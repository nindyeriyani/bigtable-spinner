/* Distributed Student Data System (Makassar Region)
   app.js — simulates Spanner-like coordinator + BigTable-like replicas
   Replika: UNM (leader), UNHAS, UIN, PNUP, POLTEKPAR
   Login: admin / admin123
*/

// -------------------- Utilities --------------------
const $ = (id) => document.getElementById(id);
const nowStr = () => new Date().toLocaleTimeString();

function addLog(msg) {
  const el = $("logArea");
  el.textContent = `[${nowStr()}] ${msg}\n` + el.textContent;
}

// simple TrueTime-like generator
function trueTime(eps = 0.002) {
  const now = Date.now() / 1000;
  return { earliest: now - eps, latest: now + eps };
}

// -------------------- State --------------------
const replicas = {
  UNM: {},
  UNHAS: {},
  UIN: {},
  PNUP: {},
  POLTEKPAR: {},
};

const campusState = {
  UNM: { online: true },
  UNHAS: { online: true, delaySec: 0 },
  UIN: { online: true },
  PNUP: { online: true },
  POLTEKPAR: { online: true },
};

// global index to prevent duplicate NIM
const globalIndex = {}; // nim -> commitTime

// -------------------- Render helpers --------------------
function renderReplica(campus, targetId) {
  const data = replicas[campus];
  const keys = Object.keys(data).sort();
  const wrap = $(targetId);

  let html =
    "<table><thead><tr><th>NIM</th><th>Nama</th><th>Prodi</th><th>Commit</th></tr></thead><tbody>";
  if (keys.length === 0) {
    html += '<tr><td colspan="4" style="color:#666">-- kosong --</td></tr>';
  } else {
    for (const nim of keys) {
      const r = data[nim];
      html += `<tr><td>${escapeHtml(nim)}</td><td>${escapeHtml(
        r.nama
      )}</td><td>${escapeHtml(r.prodi)}</td><td>${Number(r.commit).toFixed(
        6
      )}</td></tr>`;
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

function refreshAllTables() {
  renderReplica("UNM", "tableUNM");
  renderReplica("UNHAS", "tableUNHAS");
  renderReplica("UIN", "tableUIN");
  renderReplica("PNUP", "tablePNUP");
  renderReplica("POLTEKPAR", "tablePOLTEKPAR");
}

function updateStatusDisplays() {
  $("statusUNM").textContent = campusState.UNM.online ? "ONLINE" : "OFFLINE";
  $("statusUNM").className = campusState.UNM.online ? "online" : "offline";

  $("statusUNHAS").textContent = campusState.UNHAS.online
    ? "ONLINE"
    : "OFFLINE";
  $("statusUNHAS").className = campusState.UNHAS.online ? "online" : "offline";
  $("labelDelayUNHAS").textContent = `${campusState.UNHAS.delaySec || 0}s`;

  $("statusUIN").textContent = campusState.UIN.online ? "ONLINE" : "OFFLINE";
  $("statusUIN").className = campusState.UIN.online ? "online" : "offline";

  $("statusPNUP").textContent = campusState.PNUP.online ? "ONLINE" : "OFFLINE";
  $("statusPNUP").className = campusState.PNUP.online ? "online" : "offline";

  $("statusPOLTEKPAR").textContent = campusState.POLTEKPAR.online
    ? "ONLINE"
    : "OFFLINE";
  $("statusPOLTEKPAR").className = campusState.POLTEKPAR.online
    ? "online"
    : "offline";
}

// -------------------- Coordinator (propose + write) --------------------
function proposeTransaction(nim, record, originCampus) {
  // TrueTime-like timestamp
  const tt = trueTime(0.002 + Math.random() * 0.0008);
  const commit = tt.latest + 0.0001;

  // check duplicate
  if (globalIndex[nim]) {
    return {
      ok: false,
      reason: "duplicate",
      existing: globalIndex[nim],
      proposed: commit,
    };
  }

  // accept: set globalIndex and write to replicas according to state
  globalIndex[nim] = commit;
  writeToReplicas(nim, record, commit, originCampus);

  return { ok: true, commit };
}

function writeToReplicas(nim, record, commitTime, originCampus) {
  // UNM (leader) – if online
  if (campusState.UNM.online) {
    replicas.UNM[nim] = { ...record, commit: commitTime };
  } else {
    addLog("⚠ UNM offline — leader tidak tersedia (simulasi).");
  }

  // other campuses
  for (const c of ["UNHAS", "UIN", "PNUP", "POLTEKPAR"]) {
    if (!campusState[c].online) {
      addLog(`ℹ️ ${c} offline — tidak menerima NIM ${nim} saat ini.`);
      continue;
    }

    if (c === "UNHAS" && (campusState.UNHAS.delaySec || 0) > 0) {
      const delay = campusState.UNHAS.delaySec * 1000;
      addLog(
        `⏳ ${c} akan menerima NIM ${nim} setelah ${campusState.UNHAS.delaySec}s`
      );
      setTimeout(() => {
        replicas[c][nim] = { ...record, commit: commitTime };
        refreshAllTables();
        addLog(`✔️ ${c} menerima NIM ${nim} (commit=${commitTime.toFixed(6)})`);
      }, delay);
    } else {
      replicas[c][nim] = { ...record, commit: commitTime };
    }
  }

  refreshAllTables();
}

// -------------------- UI interactions --------------------
document.addEventListener("DOMContentLoaded", () => {
  // Login handling
  const loginPage = $("loginPage");
  const mainPage = $("mainPage");
  const btnLogin = $("btnLogin");
  const loginUser = $("loginUser");
  const loginPass = $("loginPass");
  const btnLogout = $("btnLogout");

  btnLogin.addEventListener("click", () => {
    const u = loginUser.value.trim();
    const p = loginPass.value.trim();
    if (u === "admin" && p === "admin123") {
      loginPage.classList.add("hidden");
      mainPage.classList.remove("hidden");
      addLog("Login berhasil — Admin masuk.");
    } else {
      alert("Username atau password salah.");
    }
  });

  btnLogout.addEventListener("click", () => {
    // simple logout
    loginUser.value = "";
    loginPass.value = "";
    mainPage.classList.add("hidden");
    loginPage.classList.remove("hidden");
  });

  // Send data
  $("btnSend").addEventListener("click", () => {
    const nim = $("nim").value.trim();
    const nama = $("nama").value.trim();
    const kampus = $("kampus").value;
    const prodi = $("prodi").value.trim();

    if (!nim || !nama || !prodi) {
      alert("Isi NIM, Nama, dan Prodi minimal.");
      return;
    }

    addLog(`→ ${kampus} mencoba insert NIM ${nim}`);
    const res = proposeTransaction(nim, { nama, kampus, prodi }, kampus);
    if (res.ok) {
      addLog(
        `✔️ Commit berhasil: NIM ${nim} | commit=${res.commit.toFixed(
          6
        )} | origin=${kampus}`
      );
      // clear form
      $("nim").value = "";
      $("nama").value = "";
      $("prodi").value = "";
    } else {
      addLog(
        `❌ Commit ditolak: NIM ${nim} duplicate (existing=${res.existing})`
      );
      alert("NIM sudah ada (duplicate).");
    }
  });

  // Set Delay UNHAS
  $("btnSetDelay").addEventListener("click", () => {
    let val = parseFloat($("delayUnhas").value);
    if (isNaN(val) || val < 0) val = 0;
    campusState.UNHAS.delaySec = val;
    $("labelDelayUNHAS").textContent = `${val}s`;
    addLog(`⏱️ Delay UNHAS diset ke ${val}s`);
    updateStatusDisplays();
  });

  // Toggle UIN offline/online
  $("btnToggleUIN").addEventListener("click", () => {
    campusState.UIN.online = !campusState.UIN.online;
    if (!campusState.UIN.online) {
      addLog("⛔ UIN Alauddin di-disconnect (offline).");
      $("btnToggleUIN").textContent = "Reconnect UIN";
    } else {
      addLog("🔌 UIN direconnect (online). Menyinkronkan dari UNM...");
      // sync newer from UNM
      for (const nim in replicas.UNM) {
        const src = replicas.UNM[nim];
        const existing = replicas.UIN[nim];
        if (!existing || src.commit > existing.commit) {
          replicas.UIN[nim] = JSON.parse(JSON.stringify(src));
        }
      }
      addLog("🔄 Sinkronisasi UIN selesai.");
      $("btnToggleUIN").textContent = "Disconnect UIN";
    }
    updateStatusDisplays();
    refreshAllTables();
  });

  // Conflict simulation UNM vs UNHAS
  $("btnConflict").addEventListener("click", () => {
    let nim = "CF" + Math.floor(Math.random() * 9000 + 1000);
    addLog(`⚔️ Simulasi konflik: UNM & UNHAS akan mengirim NIM ${nim}`);

    setTimeout(() => {
      const res1 = proposeTransaction(
        nim,
        { nama: "Alice", kampus: "UNM", prodi: "S1" },
        "UNM"
      );
      if (res1.ok)
        addLog(`✔️ UNM commit ${nim} (commit=${res1.commit.toFixed(6)})`);
      else addLog(`❌ UNM ditolak`);
    }, Math.random() * 10);

    setTimeout(() => {
      const res2 = proposeTransaction(
        nim,
        { nama: "Bob", kampus: "UNHAS", prodi: "S1" },
        "UNHAS"
      );
      if (res2.ok)
        addLog(`✔️ UNHAS commit ${nim} (commit=${res2.commit.toFixed(6)})`);
      else addLog(`❌ UNHAS ditolak (duplicate)`);
    }, Math.random() * 10 + 3);

    setTimeout(() => refreshAllTables(), 300);
  });

  // Sync all manual (UNM -> others)
  $("btnSync").addEventListener("click", () => {
    addLog("🔄 Sync manual: UNM → semua (online)");

    const source = replicas.UNM;
    for (const c of ["UNHAS", "UIN", "PNUP", "POLTEKPAR"]) {
      if (!campusState[c].online) {
        addLog(`Skip sync -> ${c} (offline)`);
        continue;
      }
      for (const nim in source) {
        const srcRec = source[nim];
        const existing = replicas[c][nim];
        if (!existing || srcRec.commit > existing.commit) {
          replicas[c][nim] = JSON.parse(JSON.stringify(srcRec));
        }
      }
      addLog(`🔁 ${c} sinkronisasi selesai.`);
    }

    refreshAllTables();
  });

  // Clear log & export
  $("btnClearLog").addEventListener("click", () => {
    $("logArea").textContent = "";
  });
  $("btnExportLog").addEventListener("click", () => {
    const data = $("logArea").textContent;
    const blob = new Blob([data], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "log.txt";
    a.click();
    URL.revokeObjectURL(url);
  });

  // allow double click on log to clear
  $("logArea").addEventListener("dblclick", () => {
    if (confirm("Bersihkan log?")) $("logArea").textContent = "";
  });

  // initial render
  updateStatusDisplays();
  refreshAllTables();
});