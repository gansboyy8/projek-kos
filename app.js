const STORAGE_KEY = "ruangkos-data-v1";
const SESSION_KEY = "ruangkos-session-v1";
const apiBaseUrl = String(window.RUANGKOS_API_URL || "").replace(/\/+$/, "");
const pageContent = document.getElementById("pageContent");
const modalBackdrop = document.getElementById("modalBackdrop");
const modalForm = document.getElementById("modalForm");
const modalFields = document.getElementById("modalFields");
const toastRegion = document.getElementById("toastRegion");
const currentMonth = () => new Date().toISOString().slice(0, 7);
const today = () => new Date().toISOString().slice(0, 10);
const monthOffset = (offset) => {
  const date = new Date();
  date.setMonth(date.getMonth() + offset);
  return date.toISOString().slice(0, 7);
};

function makeInitialData() {
  const rooms = [
    { id: "room-101", name: "101", type: "Standard", price: 850000 },
    { id: "room-102", name: "102", type: "Standard", price: 850000 },
    { id: "room-103", name: "103", type: "Deluxe", price: 1100000 },
    { id: "room-201", name: "201", type: "Standard", price: 900000 },
    { id: "room-202", name: "202", type: "Deluxe", price: 1200000 },
    { id: "room-203", name: "203", type: "Standard", price: 900000 },
    { id: "room-301", name: "301", type: "Deluxe", price: 1250000 },
    { id: "room-302", name: "302", type: "Standard", price: 950000 }
  ];
  const residents = [
    { id: "resident-1", name: "Nadia Putri", phone: "0812-3456-7890", roomId: "room-101", startDate: "2026-03-01" },
    { id: "resident-2", name: "Fajar Ramadhan", phone: "0813-2233-4455", roomId: "room-103", startDate: "2026-05-15" },
    { id: "resident-3", name: "Siti Rahma", phone: "0857-1234-5678", roomId: "room-201", startDate: "2026-01-10" },
    { id: "resident-4", name: "Rizky Pratama", phone: "0821-9087-6543", roomId: "room-202", startDate: "2026-08-01" },
    { id: "resident-5", name: "Dewi Anggraini", phone: "0819-8877-6655", roomId: "room-301", startDate: "2026-06-20" }
  ];
  const payments = [
    { id: "payment-1", residentId: "resident-1", amount: 850000, month: currentMonth(), date: today(), method: "Transfer bank", status: "Lunas" },
    { id: "payment-2", residentId: "resident-2", amount: 1100000, month: currentMonth(), date: today(), method: "Transfer bank", status: "Lunas" },
    { id: "payment-3", residentId: "resident-3", amount: 900000, month: currentMonth(), date: today(), method: "Tunai", status: "Menunggu" },
    { id: "payment-4", residentId: "resident-4", amount: 1200000, month: currentMonth(), date: today(), method: "Transfer bank", status: "Lunas" },
    { id: "payment-5", residentId: "resident-5", amount: 1250000, month: monthOffset(-1), date: today(), method: "Transfer bank", status: "Lunas" },
    { id: "payment-6", residentId: "resident-1", amount: 850000, month: monthOffset(-1), date: today(), method: "Tunai", status: "Lunas" }
  ];
  const expenses = [
    { id: "expense-1", title: "Tagihan listrik", category: "Utilitas", amount: 485000, date: today(), method: "Transfer bank" },
    { id: "expense-2", title: "Perbaikan pompa air", category: "Perawatan", amount: 275000, date: today(), method: "Tunai" },
    { id: "expense-3", title: "Internet bulanan", category: "Utilitas", amount: 350000, date: today(), method: "Transfer bank" }
  ];
  return { rooms, residents, payments, expenses, bills: [], owner: null };
}

function loadData() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (!saved) return makeInitialData();
    const parsed = JSON.parse(saved);
    if (["rooms", "residents", "payments", "expenses"].every((key) => Array.isArray(parsed[key]))) {
      parsed.bills = Array.isArray(parsed.bills) ? parsed.bills : [];
      parsed.maintenanceReports = Array.isArray(parsed.maintenanceReports) ? parsed.maintenanceReports : [];
      parsed.residents = parsed.residents.map(({ loginId, passwordHash, passwordSalt, password, ...resident }) => resident);
      parsed.owner = null;
      return parsed;
    }
  } catch (error) {
    console.error("Data RuangKos gagal dibaca dari penyimpanan lokal.", error);
    queueMicrotask(() => toast("Data lokal tidak dapat dibaca. Data contoh ditampilkan."));
  }
  return makeInitialData();
}

let data = loadData();
let activePage = "dashboard";
let editing = null;
let reportMonth = currentMonth();
let currentUser = null;
let loginRole = "owner";
let ownerExists = false;
let pendingProfilePhoto = null;

async function apiRequest(url, options = {}) {
  if (!apiBaseUrl && window.location.hostname.endsWith(".github.io")) {
    throw new Error("Backend belum dikonfigurasi untuk GitHub Pages. Atur variabel RUANGKOS_API_URL di GitHub Actions setelah backend Render aktif.");
  }
  if (apiBaseUrl && window.location.protocol === "https:" && new URL(apiBaseUrl).protocol !== "https:") {
    throw new Error("GitHub Pages hanya dapat terhubung ke backend dengan HTTPS.");
  }
  const headers = { "Content-Type": "application/json", ...options.headers };
  const token = sessionStorage.getItem(SESSION_KEY);
  if (token) headers.Authorization = `Bearer ${token}`;
  const response = await fetch(`${apiBaseUrl}${url}`, {
    ...options,
    credentials: "same-origin",
    headers
  });
  const contentType = response.headers.get("content-type") || "";
  if (response.status !== 204 && !contentType.includes("application/json")) {
    throw new Error("Server API tidak mengirim respons JSON. Periksa URL backend RuangKos.");
  }
  const result = response.status === 204 ? null : await response.json();
  if (!response.ok) throw new Error(result?.error || `Permintaan gagal (${response.status}).`);
  return result;
}

function normalizedLogin(value) {
  return String(value || "").trim().toLowerCase();
}

function daysOverdue(dueDate) {
  if (!dueDate || dueDate >= today()) return 0;
  const due = new Date(`${dueDate}T00:00:00Z`);
  const now = new Date(`${today()}T00:00:00Z`);
  return Math.floor((now - due) / 86400000);
}

function billStatus(bill) {
  if (bill.status === "Lunas") return "Lunas";
  if (bill.status === "Menunggu konfirmasi") return "Menunggu konfirmasi";
  return daysOverdue(bill.dueDate) > 0 ? "Terlambat" : "Belum dibayar";
}

function overdueLabel(bill) {
  const days = daysOverdue(bill.dueDate);
  if (billStatus(bill) !== "Terlambat") return "";
  return `${days} hari terlambat`;
}

function saveData() {
  return apiRequest("/api/state", { method: "PUT", body: JSON.stringify(data) })
    .then((result) => { data = result.data; return true; })
    .catch((error) => {
      console.error("Data RuangKos gagal disimpan di server.", error);
      return apiRequest("/api/state").then((result) => { data = result.data; }).catch((refreshError) => {
        console.error("Data terbaru gagal dimuat kembali.", refreshError);
      }).then(() => {
      toast(error.message || "Perubahan belum tersimpan di server.");
      return false;
      });
    });
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[char]));
}

function money(value) {
  return new Intl.NumberFormat("id-ID", {
    style: "currency", currency: "IDR", maximumFractionDigits: 0
  }).format(Number(value) || 0);
}

function shortMoney(value) {
  const amount = Number(value) || 0;
  if (amount >= 1000000) return `Rp ${(amount / 1000000).toLocaleString("id-ID", { maximumFractionDigits: 1 })} jt`;
  return `Rp ${Math.round(amount / 1000).toLocaleString("id-ID")} rb`;
}

function formatDate(value) {
  if (!value) return "—";
  const parsed = new Date(`${value}T00:00:00`);
  return Number.isNaN(parsed.getTime()) ? "—" : new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short", year: "numeric" }).format(parsed);
}

function formatMonth(value) {
  if (!value) return "—";
  const [year, month] = value.split("-").map(Number);
  return new Intl.DateTimeFormat("id-ID", { month: "long", year: "numeric" }).format(new Date(year, month - 1, 1));
}

function getRoom(roomId) {
  return data.rooms.find((room) => room.id === roomId);
}

function getResident(residentId) {
  return data.residents.find((resident) => resident.id === residentId);
}

function residentForRoom(roomId) {
  return data.residents.find((resident) => resident.roomId === roomId);
}

function occupiedRooms() {
  return data.rooms.filter((room) => residentForRoom(room.id)).length;
}

function statusClass(status) {
  if (status === "Lunas" || status === "Terisi") return "";
  if (status === "Menunggu" || status === "Menunggu konfirmasi" || status === "Belum dibayar") return "pending";
  if (status === "Terlambat") return "overdue";
  return "vacant";
}

function statusPill(status) {
  return `<span class="status-pill ${statusClass(status)}">${escapeHtml(status)}</span>`;
}

function avatar(name) {
  const initials = String(name || "?").trim().split(/\s+/).slice(0, 2).map((part) => part[0] || "").join("").toUpperCase();
  return `<span class="avatar">${escapeHtml(initials)}</span>`;
}

function toast(message) {
  const item = document.createElement("div");
  item.className = "toast";
  item.textContent = message;
  toastRegion.append(item);
  window.setTimeout(() => item.remove(), 3200);
}

function renderAuth(message = "") {
  const isSetup = !ownerExists;
  document.getElementById("appShell").hidden = true;
  const authScreen = document.getElementById("authScreen");
  authScreen.hidden = false;
  authScreen.innerHTML = `<section class="auth-card">
    <a class="brand auth-brand" href="#" aria-label="RuangKos"><span class="brand-mark"><span></span><span></span><span></span><span></span></span><span class="brand-copy"><strong>ruang<span>kos</span></strong><small>PROPERTY MANAGER</small></span></a>
    <span class="eyebrow">${isSetup ? "MULAI KELOLA KOS" : "SELAMAT DATANG KEMBALI"}</span>
    <h1>${isSetup ? "Buat akun owner" : "Masuk ke RuangKos"}</h1>
    <p class="auth-description">${isSetup ? "Buat akun owner terlebih dahulu. Setelah masuk, tambahkan akun untuk setiap penghuni dari menu Penghuni." : "Pilih jenis akun untuk melanjutkan ke ruang kos Anda."}</p>
    ${isSetup ? `<form id="ownerSetupForm" class="auth-form">
      <label class="field"><span>Nama kos</span><input name="propertyName" type="text" placeholder="Contoh: Kos Melati" required maxlength="60"></label>
      <label class="field"><span>Nama owner</span><input name="ownerName" type="text" placeholder="Nama Anda" required maxlength="60"></label>
      <label class="field"><span>ID login owner</span><input name="loginId" type="text" inputmode="numeric" autocomplete="username" placeholder="8 digit angka" pattern="[0-9]{8}" required minlength="8" maxlength="8"><small class="field-hint">ID harus tepat 8 digit angka.</small></label>
      <label class="field"><span>Password</span><input name="password" type="password" autocomplete="new-password" required minlength="8"><small class="field-hint">Minimal 8 karakter.</small></label>
      <button class="button button-primary auth-submit" type="submit">Buat akun owner <span>→</span></button>
    </form>` : `<div class="auth-tabs"><button type="button" class="${loginRole === "owner" ? "selected" : ""}" data-login-role="owner">Owner kos</button><button type="button" class="${loginRole === "resident" ? "selected" : ""}" data-login-role="resident">Penghuni kos</button></div>
      <form id="loginForm" class="auth-form">
        <label class="field"><span>${loginRole === "owner" ? "ID login owner" : "ID login dari owner"}</span><input name="loginId" type="text" inputmode="numeric" autocomplete="username" placeholder="8 digit angka" pattern="[0-9]{8}" required minlength="8" maxlength="8"><small class="field-hint">Masukkan ID yang terdiri dari tepat 8 digit angka.</small></label>
        <label class="field"><span>Password</span><input name="password" type="password" autocomplete="current-password" required></label>
        ${message ? `<p class="auth-error">${escapeHtml(message)}</p>` : ""}
        <button class="button button-primary auth-submit" type="submit">Masuk sebagai ${loginRole === "owner" ? "owner" : "penghuni"} <span>→</span></button>
      </form>
      <p class="auth-footnote">Belum punya ID penghuni? Minta owner kos membuatkan akun untuk Anda.</p>`}
    <p class="auth-local-note"><i></i> Akun dan data tersimpan di server kos.</p>
  </section>`;
  const loginInput = authScreen.querySelector('[name="loginId"]');
  loginInput?.addEventListener("input", () => {
    loginInput.value = loginInput.value.replace(/\D/g, "").slice(0, 8);
  });
}

function showApp() {
  document.getElementById("authScreen").hidden = true;
  const appShell = document.getElementById("appShell");
  appShell.hidden = false;
  appShell.classList.toggle("resident-mode", currentUser?.role === "resident");
  document.getElementById("logoutButton").hidden = currentUser?.role !== "resident";
  document.querySelectorAll(".owner-only").forEach((element) => { element.hidden = currentUser?.role !== "owner"; });
  document.querySelectorAll(".resident-only").forEach((element) => { element.hidden = currentUser?.role !== "resident"; });
  if (currentUser?.role === "owner") {
    document.querySelector(".profile-button").hidden = false;
    document.querySelector(".sidebar-bottom .help-card").hidden = false;
    const ownerName = data.owner?.name || "Owner";
    document.querySelector(".profile-info strong").textContent = ownerName;
    document.querySelector(".profile-info small").textContent = data.owner?.propertyName || "Pengelola";
    document.querySelector(".owner-avatar").textContent = ownerName.trim().charAt(0).toUpperCase();
    document.querySelector(".top-avatar").textContent = ownerName.trim().charAt(0).toUpperCase();
    setPage(activePage === "resident-home" ? "dashboard" : activePage);
  } else {
    document.querySelectorAll(".owner-only").forEach((element) => { element.hidden = true; });
    document.querySelectorAll(".resident-only").forEach((element) => { element.hidden = false; });
    document.querySelector(".profile-button").hidden = true;
    document.querySelector(".sidebar-bottom .help-card").hidden = true;
    setPage(activePage.startsWith("resident-") ? activePage : "resident-home");
  }
}

function setPage(page) {
  activePage = page;
  document.querySelectorAll(".nav-link").forEach((button) => button.classList.toggle("active", button.dataset.page === page));
  const labels = { dashboard: "Dashboard", rooms: "Kamar", residents: "Penghuni", bills: "Tagihan", maintenance: "Laporan gangguan", payments: "Pembayaran", expenses: "Pengeluaran", reports: "Laporan", "resident-home": "Beranda", "resident-bills": "Tagihan saya", "resident-maintenance": "Laporan gangguan", "resident-history": "Riwayat pembayaran", "resident-profile": "Profil saya" };
  document.getElementById("breadcrumbCurrent").textContent = labels[page] || labels.dashboard;
  document.getElementById("sidebar").classList.remove("open");
  if (currentUser?.role === "resident") {
    pageContent.innerHTML = renderResidentPage(page);
    updateResidentAvatar();
  } else renderPage();
}

function updateResidentAvatar() {
  const resident = getResident(currentUser?.residentId);
  const avatarElement = document.querySelector(".top-avatar");
  if (!avatarElement || currentUser?.role !== "resident") return;
  avatarElement.innerHTML = resident?.profilePhoto ? `<img src="${resident.profilePhoto}" alt="">` : escapeHtml(resident?.name?.trim().charAt(0).toUpperCase() || "P");
  avatarElement.title = resident?.name || "Penghuni";
}

function pageHeading(eyebrow, title, description, actionLabel, actionKind) {
  return `<div class="page-heading"><div><span class="eyebrow">${eyebrow}</span><h1>${title}</h1><p>${description}</p></div>${actionLabel ? `<button class="button button-primary" data-action="${actionKind}"><span>＋</span>${actionLabel}</button>` : ""}</div>`;
}

function renderDashboard() {
  const totalRooms = data.rooms.length;
  const occupied = occupiedRooms();
  const vacant = totalRooms - occupied;
  const currentPayments = data.payments.filter((payment) => payment.month === currentMonth());
  const paidIncome = currentPayments.filter((payment) => payment.status === "Lunas").reduce((sum, payment) => sum + Number(payment.amount), 0);
  const pendingCount = currentPayments.filter((payment) => payment.status !== "Lunas").length
    + data.bills.filter((bill) => bill.month === currentMonth() && billStatus(bill) !== "Lunas").length;
  const currentExpenses = data.expenses.filter((expense) => expense.date.slice(0, 7) === currentMonth()).reduce((sum, expense) => sum + Number(expense.amount), 0);
  const occupancyPercent = totalRooms ? Math.round((occupied / totalRooms) * 100) : 0;
  const recentPayments = [...data.payments].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 4);
  const activity = [
    ...data.payments.map((item) => ({ ...item, kind: "payment" })),
    ...data.expenses.map((item) => ({ ...item, kind: "expense", date: item.date })),
    ...data.bills.filter((item) => billStatus(item) !== "Lunas").map((item) => ({
      ...item,
      kind: "bill",
      date: item.requestedAt || item.dueDate
    }))
  ].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 5);

  return `${pageHeading("RINGKASAN", "Dashboard", "Pantau operasional kos Anda dalam satu tampilan.", "", "")}
    <section class="welcome-banner">
      <div class="welcome-copy"><span>${new Intl.DateTimeFormat("id-ID", { weekday: "long", day: "numeric", month: "long" }).format(new Date())}</span><h2>Halo, Pengelola Kos 👋</h2><p>Ini ringkasan kondisi kos Anda bulan ${escapeHtml(formatMonth(currentMonth()))}.</p></div>
      <div class="welcome-illustration" aria-hidden="true"><div class="house-roof"></div><div class="house-front"><span class="house-door"></span><span class="house-window"></span></div><i class="house-leaf one"></i><i class="house-leaf two"></i></div>
    </section>
    <section class="stat-grid" aria-label="Ringkasan kos">
      <article class="stat-card"><div class="stat-top"><span>Total kamar</span><span class="stat-icon">▦</span></div><div class="stat-value">${totalRooms}<span style="font:400 10px 'DM Sans';color:#90978f">kamar</span></div><div class="stat-note">${occupied} terisi · ${vacant} tersedia</div></article>
      <article class="stat-card"><div class="stat-top"><span>Penghuni aktif</span><span class="stat-icon blue">♙</span></div><div class="stat-value">${data.residents.length}<span style="font:400 10px 'DM Sans';color:#90978f">orang</span></div><div class="stat-note">Penghuni yang tercatat saat ini</div></article>
      <article class="stat-card"><div class="stat-top"><span>Pemasukan bulan ini</span><span class="stat-icon">↗</span></div><div class="stat-value">${shortMoney(paidIncome)}</div><div class="stat-note">${currentPayments.filter((p) => p.status === "Lunas").length} pembayaran diterima</div></article>
      <article class="stat-card"><div class="stat-top"><span>Perlu ditindaklanjuti</span><span class="stat-icon amber">◷</span></div><div class="stat-value">${pendingCount}<span style="font:400 10px 'DM Sans';color:#90978f">tagihan</span></div><div class="stat-note">Belum lunas bulan ini · biaya ${shortMoney(currentExpenses)}</div></article>
    </section>
    <section class="dashboard-grid">
      <article class="panel">
        <div class="panel-header"><div><h2 class="panel-title">Status kamar</h2><p class="panel-subtitle">Ringkasan ketersediaan kamar kos</p></div><button class="text-link" data-page="rooms">Lihat kamar →</button></div>
        <div class="occupancy-summary"><div class="donut" style="--occupancy:${occupancyPercent}%"><div class="donut-label"><strong>${occupancyPercent}%</strong><small>TERISI</small></div></div><div class="occupancy-legend"><div class="legend-item"><span class="legend-name"><i class="legend-dot"></i>Kamar terisi</span><strong class="legend-count">${occupied}</strong></div><div class="legend-item"><span class="legend-name"><i class="legend-dot vacant"></i>Kamar tersedia</span><strong class="legend-count">${vacant}</strong></div></div></div>
        <div class="occupancy-footer"><span>Total kamar terdaftar</span><strong>${totalRooms} kamar</strong></div>
      </article>
      <article class="panel">
        <div class="panel-header"><div><h2 class="panel-title">Pembayaran terbaru</h2><p class="panel-subtitle">Transaksi sewa terakhir</p></div><button class="text-link" data-page="payments">Semua →</button></div>
        ${recentPayments.length ? `<div class="table-wrap"><table class="mini-table"><thead><tr><th>PENGHUNI</th><th>JUMLAH</th><th>STATUS</th></tr></thead><tbody>${recentPayments.map((payment) => {
          const resident = getResident(payment.residentId);
          const room = resident && getRoom(resident.roomId);
          return `<tr><td><div class="resident-cell">${avatar(resident?.name)}<span><strong>${escapeHtml(resident?.name || "Penghuni dihapus")}</strong><small>Kamar ${escapeHtml(room?.name || "—")}</small></span></div></td><td class="amount-cell">${shortMoney(payment.amount)}</td><td>${statusPill(payment.status)}</td></tr>`;
        }).join("")}</tbody></table></div>` : `<div class="empty-state">Belum ada pembayaran.</div>`}
      </article>
    </section>
    <section class="activity-layout">
      <article class="panel"><div class="panel-header"><div><h2 class="panel-title">Aktivitas terakhir</h2><p class="panel-subtitle">Catatan pemasukan dan pengeluaran</p></div><button class="text-link" data-page="reports">Lihat laporan →</button></div>
        ${activity.length ? `<div class="activity-list">${activity.map((item) => {
          const isExpense = item.kind === "expense";
          const isBill = item.kind === "bill";
          const isPending = !isExpense && (isBill ? billStatus(item) !== "Lunas" : item.status !== "Lunas");
          const resident = !isExpense && getResident(item.residentId);
          const activityTitle = isExpense ? item.title : isBill
            ? `${billStatus(item) === "Menunggu konfirmasi" ? "Konfirmasi bayar" : "Tagihan"} — ${resident?.name || "Penghuni"}`
            : `${isPending ? "Tagihan" : "Sewa"} — ${resident?.name || "Penghuni"}`;
          return `<div class="activity-row"><span class="activity-icon ${isExpense ? "expense" : isPending ? "pending" : ""}">${isExpense ? "↙" : isPending ? "◷" : "↗"}</span><span class="activity-copy"><strong>${escapeHtml(activityTitle)}</strong><small>${formatDate(item.date)}${!isExpense ? ` · ${escapeHtml(formatMonth(item.month))}${isPending ? ` · ${isBill ? escapeHtml(billStatus(item)) : "Menunggu"}` : ""}` : ` · ${escapeHtml(item.category)}`}</small></span><strong class="activity-amount ${isExpense ? "expense" : ""}">${isExpense ? "−" : isPending ? "" : "+"}${shortMoney(item.amount)}</strong></div>`;
        }).join("")}</div>` : `<div class="empty-state">Aktivitas akan muncul di sini setelah ada transaksi.</div>`}
      </article>
      <article class="panel"><div class="panel-header"><div><h2 class="panel-title">Akses cepat</h2><p class="panel-subtitle">Catat kegiatan kos</p></div></div><div style="display:grid;gap:8px"><button class="button button-quiet" style="justify-content:flex-start" data-action="add-payment">＋ &nbsp; Catat pembayaran sewa</button><button class="button button-quiet" style="justify-content:flex-start" data-action="add-expense">＋ &nbsp; Tambah pengeluaran</button><button class="button button-quiet" style="justify-content:flex-start" data-action="add-resident">＋ &nbsp; Daftarkan penghuni</button></div></article>
    </section>`;
}

function renderRooms() {
  const filter = document.getElementById("roomFilter")?.value || "Semua";
  const query = (document.getElementById("roomSearch")?.value || "").trim().toLowerCase();
  const rooms = data.rooms.filter((room) => {
    const resident = residentForRoom(room.id);
    const status = resident ? "Terisi" : "Tersedia";
    return (filter === "Semua" || filter === status) && `${room.name} ${room.type} ${resident?.name || ""}`.toLowerCase().includes(query);
  });
  return `${pageHeading("INVENTARIS", "Daftar kamar", `${data.rooms.length} kamar · ${occupiedRooms()} terisi · ${data.rooms.length - occupiedRooms()} tersedia`, "Tambah kamar", "add-room")}
    <div class="toolbar"><div class="toolbar-left"><label class="search-field"><span>⌕</span><input id="roomSearch" type="search" placeholder="Cari kamar atau penghuni..." value="${escapeHtml(query)}"></label><select class="control" id="roomFilter"><option ${filter === "Semua" ? "selected" : ""}>Semua</option><option ${filter === "Terisi" ? "selected" : ""}>Terisi</option><option ${filter === "Tersedia" ? "selected" : ""}>Tersedia</option></select></div><span class="table-footer" style="padding:0;border:0">${rooms.length} kamar ditampilkan</span></div>
    ${rooms.length ? `<div class="room-grid">${rooms.map((room) => {
      const resident = residentForRoom(room.id);
      return `<article class="room-card"><div class="room-card-top"><div class="room-number"><span class="room-icon">▦</span><span><strong>Kamar ${escapeHtml(room.name)}</strong><small>${escapeHtml(room.type)}</small></span></div>${statusPill(resident ? "Terisi" : "Tersedia")}</div><div class="room-card-price">${money(room.price)} <small>/ bulan</small></div><div class="room-occupant"><span>${resident ? `Penghuni: ${escapeHtml(resident.name)}` : "Belum ada penghuni"}</span><div class="room-card-actions"><button class="row-action" data-action="edit-room" data-id="${escapeHtml(room.id)}">Edit</button><button class="row-action delete" data-action="delete-room" data-id="${escapeHtml(room.id)}">Hapus</button></div></div></article>`;
    }).join("")}</div>` : `<div class="panel empty-state"><strong>Tidak ada kamar ditemukan</strong>Coba ubah kata pencarian atau filter Anda.</div>`}`;
}

function renderResidents() {
  const query = (document.getElementById("residentSearch")?.value || "").trim().toLowerCase();
  const residents = data.residents.filter((resident) => `${resident.name} ${resident.phone} ${resident.loginId || ""} ${getRoom(resident.roomId)?.name || ""}`.toLowerCase().includes(query));
  return `${pageHeading("DATA PENGHUNI", "Penghuni kos", "Kelola data penghuni dan buat ID login untuk portal mereka.", "Tambah penghuni", "add-resident")}
    <div class="toolbar"><div class="toolbar-left"><label class="search-field"><span>⌕</span><input id="residentSearch" type="search" placeholder="Cari nama, nomor telepon, kamar..." value="${escapeHtml(query)}"></label></div><span class="table-footer" style="padding:0;border:0">${residents.length} penghuni</span></div>
    <section class="panel data-panel"><div class="table-wrap"><table class="data-table"><thead><tr><th>NAMA PENGHUNI</th><th>NO. TELEPON</th><th>ID LOGIN</th><th>KAMAR</th><th>MULAI TINGGAL</th><th>SEWA / BULAN</th><th></th></tr></thead><tbody>${residents.length ? residents.map((resident) => {
      const room = getRoom(resident.roomId);
      return `<tr><td><div class="resident-cell">${avatar(resident.name)}<span><strong>${escapeHtml(resident.name)}</strong><small>Penghuni aktif</small></span></div></td><td>${escapeHtml(resident.phone)}</td><td>${resident.loginId ? `<span class="credential-tag">${escapeHtml(resident.loginId)}</span>` : `<span class="status-pill pending">Belum ada akun</span>`}</td><td><span class="room-tag">Kamar ${escapeHtml(room?.name || "—")}</span></td><td>${formatDate(resident.startDate)}</td><td class="cell-primary">${money(room?.price || 0)}</td><td><div class="row-actions"><button class="row-action" data-action="edit-resident" data-id="${escapeHtml(resident.id)}">${resident.loginId ? "Edit / reset akun" : "Buat akun"}</button><button class="row-action delete" data-action="delete-resident" data-id="${escapeHtml(resident.id)}">Hapus</button></div></td></tr>`;
    }).join("") : `<tr><td colspan="7"><div class="empty-state"><strong>Belum ada data penghuni</strong>Tambahkan penghuni untuk mulai mengelola sewa.</div></td></tr>`}</tbody></table></div><div class="table-footer"><span>Password tidak ditampilkan kembali setelah disimpan.</span><strong>${residents.length} penghuni</strong></div></section>`;
}

function renderBills() {
  const filter = document.getElementById("billFilter")?.value || "Semua status";
  const query = (document.getElementById("billSearch")?.value || "").trim().toLowerCase();
  const bills = [...data.bills].sort((a, b) => b.dueDate.localeCompare(a.dueDate)).filter((bill) => {
    const resident = getResident(bill.residentId);
    const status = billStatus(bill);
    return `${resident?.name || ""} ${bill.title} ${bill.category}`.toLowerCase().includes(query) && (filter === "Semua status" || status === filter);
  });
  const waiting = data.bills.filter((bill) => billStatus(bill) === "Menunggu konfirmasi").length;
  return `${pageHeading("TAGIHAN PENGHUNI", "Tagihan", "Buat tagihan sewa, listrik, air, Wi-Fi, dan konfirmasi pembayaran penghuni.", "Buat tagihan", "add-bill")}
    <div class="toolbar"><div class="toolbar-left"><label class="search-field"><span>⌕</span><input id="billSearch" type="search" placeholder="Cari penghuni atau tagihan..." value="${escapeHtml(query)}"></label><select class="control" id="billFilter">${["Semua status", "Belum dibayar", "Terlambat", "Menunggu konfirmasi", "Lunas"].map((status) => `<option ${filter === status ? "selected" : ""}>${status}</option>`).join("")}</select></div><span class="table-footer" style="padding:0;border:0">${waiting} menunggu konfirmasi</span></div>
    <section class="panel data-panel"><div class="table-wrap"><table class="data-table"><thead><tr><th>PENGHUNI</th><th>TAGIHAN</th><th>PERIODE</th><th>JATUH TEMPO</th><th>JUMLAH</th><th>STATUS</th><th></th></tr></thead><tbody>${bills.length ? bills.map((bill) => {
      const resident = getResident(bill.residentId);
      const status = billStatus(bill);
      const late = overdueLabel(bill);
      return `<tr><td class="cell-primary">${escapeHtml(resident?.name || "Penghuni dihapus")}<span class="cell-secondary">Kamar ${escapeHtml(getRoom(resident?.roomId)?.name || "—")}</span></td><td class="cell-primary">${escapeHtml(bill.title)}<span class="cell-secondary">${escapeHtml(bill.category)}</span></td><td>${escapeHtml(formatMonth(bill.month))}</td><td>${formatDate(bill.dueDate)}${late ? `<span class="cell-secondary" style="color:#ba6257">${late}</span>` : ""}</td><td class="cell-primary">${money(bill.amount)}</td><td>${statusPill(status)}</td><td><div class="row-actions">${status === "Menunggu konfirmasi" ? `<button class="row-action" data-action="confirm-bill" data-id="${escapeHtml(bill.id)}">Konfirmasi lunas</button>` : ""}<button class="row-action" data-action="edit-bill" data-id="${escapeHtml(bill.id)}">Edit</button><button class="row-action delete" data-action="delete-bill" data-id="${escapeHtml(bill.id)}">Hapus</button></div></td></tr>`;
    }).join("") : `<tr><td colspan="7"><div class="empty-state"><strong>Belum ada tagihan</strong>Buat tagihan untuk mengirim rincian biaya ke akun penghuni.</div></td></tr>`}</tbody></table></div><div class="table-footer"><span>Tagihan terlambat dihitung otomatis dari tanggal jatuh tempo.</span><strong>${bills.length} tagihan</strong></div></section>`;
}

function renderResidentPortal() {
  const resident = getResident(currentUser?.residentId);
  if (!resident) return `<div class="panel empty-state"><strong>Akun penghuni tidak ditemukan</strong>Silakan hubungi owner kos.</div>`;
  const room = getRoom(resident.roomId);
  const bills = [...data.bills].filter((bill) => bill.residentId === resident.id).sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  const unpaid = bills.filter((bill) => !["Lunas", "Menunggu konfirmasi"].includes(billStatus(bill)));
  const overdue = unpaid.filter((bill) => billStatus(bill) === "Terlambat");
  const unpaidTotal = unpaid.reduce((sum, bill) => sum + Number(bill.amount), 0);
  const myReports = data.maintenanceReports.filter((report) => report.residentId === resident.id);
  const openReports = myReports.filter((report) => !["Selesai", "Ditolak"].includes(report.status)).length;
  const recentBills = bills.slice(0, 3);
  return `${pageHeading("PORTAL PENGHUNI", `Halo, ${escapeHtml(resident.name.split(" ")[0])} 👋`, `Kamar ${escapeHtml(room?.name || "—")} · ${escapeHtml(data.owner?.propertyName || "Kos Anda")}`, "", "")}
    <section class="welcome-banner resident-banner"><div class="resident-welcome-copy"><span>RINGKASAN KOS · ${new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "long" }).format(new Date())}</span><h2>${overdue.length ? "Yuk, cek tagihan yang tertunda." : unpaid.length ? "Semua kebutuhan kos, dalam satu tempat." : "Selamat datang di rumah."}</h2><p>${overdue.length ? `${overdue.length} tagihan melewati jatuh tempo. Cek rinciannya agar tetap nyaman.` : "Cek pembayaran, pantau laporan, dan kabari owner jika ada kendala."}</p><button class="button resident-banner-button" data-page="resident-bills">Lihat tagihan <span>→</span></button></div><div class="resident-welcome-art" aria-hidden="true"><div class="art-sun"></div><div class="art-building"><i></i><i></i><i></i><b></b></div><div class="art-plant"></div></div></section>
    <section class="stat-grid resident-stats"><button class="stat-card resident-stat-action" data-page="resident-bills"><div class="stat-top"><span>Tagihan belum dibayar</span><span class="stat-icon amber">◷</span></div><div class="stat-value">${shortMoney(unpaidTotal)}</div><div class="stat-note">${unpaid.length} tagihan · ${overdue.length} terlambat</div></button><button class="stat-card resident-stat-action" data-page="resident-maintenance"><div class="stat-top"><span>Laporan gangguan</span><span class="stat-icon blue">⚒</span></div><div class="stat-value">${openReports}<span style="font:400 10px 'DM Sans';color:#90978f">aktif</span></div><div class="stat-note">${myReports.length} laporan dikirim</div></button><button class="stat-card resident-stat-action" data-page="resident-history"><div class="stat-top"><span>Pembayaran lunas</span><span class="stat-icon">✓</span></div><div class="stat-value">${data.payments.filter((payment) => payment.status === "Lunas").length}</div><div class="stat-note">Lihat riwayat pembayaran</div></button><button class="stat-card resident-stat-action" data-page="resident-profile"><div class="stat-top"><span>Kamar saya</span><span class="stat-icon blue">⌂</span></div><div class="stat-value">${escapeHtml(room?.name || "—")}</div><div class="stat-note">${escapeHtml(room?.type || "Penghuni kos")} · ${money(room?.price || 0)}/bln</div></button></section>
    <section class="resident-home-grid"><article class="panel"><div class="panel-header"><div><h2 class="panel-title">Tagihan terbaru</h2><p class="panel-subtitle">Pantau jatuh tempo dan status pembayaran</p></div><button class="text-link" data-page="resident-bills">Semua tagihan →</button></div>${recentBills.length ? `<div class="bill-list">${recentBills.map((bill) => residentBillCard(bill)).join("")}</div>` : `<div class="empty-state"><strong>Belum ada tagihan</strong>Tagihan dari owner akan muncul di sini.</div>`}</article><article class="panel resident-quick-panel"><div class="panel-header"><div><h2 class="panel-title">Butuh bantuan?</h2><p class="panel-subtitle">Sampaikan kendala di kos kepada owner</p></div></div><div class="quick-report-art">⚡ <span>Gangguan listrik, air, Wi-Fi, atau kamar?</span></div><button class="button button-primary quick-report-button" data-page="resident-maintenance">Buat laporan gangguan <span>→</span></button><button class="text-link quick-profile-link" data-page="resident-profile">Perbarui foto profil atau password →</button></article></section>
    <section class="panel resident-recent-issues"><div class="panel-header"><div><h2 class="panel-title">Laporan gangguan saya</h2><p class="panel-subtitle">Lihat perkembangan laporan yang sudah dikirim</p></div><button class="text-link" data-page="resident-maintenance">Lihat semua →</button></div>${myReports.length ? myReports.slice(0, 2).map((report) => residentReportCard(report)).join("") : `<div class="resident-no-issues"><span>✦</span><div><strong>Semua berjalan lancar?</strong><p>Kalau ada gangguan fasilitas, kirim laporan supaya owner bisa segera membantu.</p></div><button class="button button-quiet" data-page="resident-maintenance">Buat laporan</button></div>`}</section>`;
}

function residentBillCard(bill) {
  const status = billStatus(bill);
  const late = overdueLabel(bill);
  const icon = bill.category === "Sewa" ? "⌂" : bill.category === "Listrik" ? "ϟ" : bill.category === "Air" ? "♧" : bill.category === "Wi-Fi" ? "⌁" : "▤";
  return `<article class="bill-card"><div class="bill-card-main"><span class="bill-symbol ${status === "Terlambat" ? "late" : ""}">${icon}</span><div class="bill-description"><strong>${escapeHtml(bill.title)}</strong><small>${escapeHtml(formatMonth(bill.month))} · Jatuh tempo ${formatDate(bill.dueDate)}${late ? ` · <b>${late}</b>` : ""}${status === "Menunggu konfirmasi" ? " · Menunggu konfirmasi owner" : ""}</small></div></div><div class="bill-card-end"><strong>${money(bill.amount)}</strong>${statusPill(status)}${status !== "Lunas" && status !== "Menunggu konfirmasi" ? `<button class="button button-primary bill-pay-button" data-action="pay-bill" data-id="${escapeHtml(bill.id)}">Bayar sekarang <span>→</span></button>` : ""}</div></article>`;
}

function residentReportCard(report) {
  const urgency = report.urgency === "Mendesak" ? "urgent" : "";
  const statusClassName = report.status === "Selesai" ? "done" : report.status === "Dalam penanganan" || report.status === "Terjadwal" ? "working" : report.status === "Ditolak" ? "declined" : "";
  return `<article class="resident-report-card"><span class="report-category-icon">${report.category === "Listrik" ? "ϟ" : report.category === "Air" ? "♧" : report.category === "Wi-Fi" ? "⌁" : "⚒"}</span><div class="resident-report-copy"><div><strong>${escapeHtml(report.title)}</strong><span class="report-meta">${escapeHtml(report.category)} · ${formatDate(report.createdAt?.slice(0, 10))} · <i class="urgency-dot ${urgency}"></i>${escapeHtml(report.urgency)}</span></div><p>${escapeHtml(report.description)}</p>${report.ownerNote ? `<div class="owner-response"><b>Catatan owner</b><span>${escapeHtml(report.ownerNote)}</span></div>` : ""}</div><span class="report-status ${statusClassName}">${escapeHtml(report.status)}</span></article>`;
}

function renderResidentBills() {
  const resident = getResident(currentUser.residentId);
  const bills = data.bills.filter((bill) => bill.residentId === resident?.id).sort((a, b) => b.dueDate.localeCompare(a.dueDate));
  const open = bills.filter((bill) => !["Lunas", "Menunggu konfirmasi"].includes(billStatus(bill)));
  return `${pageHeading("PEMBAYARAN KOS", "Tagihan saya", "Rincian sewa dan kebutuhan bulanan kamar Anda.", "", "")}<section class="stat-grid resident-bill-stats"><article class="report-card"><span>Total belum dibayar</span><strong>${money(open.reduce((sum, bill) => sum + Number(bill.amount), 0))}</strong><small>${open.length} tagihan terbuka</small></article><article class="report-card"><span>Menunggu konfirmasi</span><strong>${bills.filter((bill) => billStatus(bill) === "Menunggu konfirmasi").length}</strong><small>Owner sedang memeriksa pembayaran</small></article><article class="report-card"><span>Sudah lunas</span><strong>${bills.filter((bill) => billStatus(bill) === "Lunas").length}</strong><small>Tagihan yang dikonfirmasi owner</small></article></section><section class="panel"><div class="panel-header"><div><h2 class="panel-title">Semua tagihan</h2><p class="panel-subtitle">Tagihan baru dibuat dan dikelola oleh owner kos</p></div></div>${bills.length ? `<div class="bill-list">${bills.map((bill) => residentBillCard(bill)).join("")}</div>` : `<div class="empty-state"><strong>Belum ada tagihan</strong>Tagihan dari owner akan muncul di halaman ini.</div>`}</section><section class="panel resident-note"><span class="stat-icon">ⓘ</span><p><strong>Pembayaran dikonfirmasi owner.</strong> Setelah mengirim bukti atau catatan pembayaran, status menjadi “Menunggu konfirmasi”. Status berubah lunas setelah owner memverifikasi penerimaan.</p></section>`;
}

function renderResidentMaintenance() {
  const resident = getResident(currentUser.residentId);
  const reports = data.maintenanceReports.filter((report) => report.residentId === resident?.id).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return `${pageHeading("BANTUAN & PERAWATAN", "Laporan gangguan", "Laporkan kendala fasilitas agar owner dapat menindaklanjuti.", "", "")}<section class="resident-report-intro"><span class="intro-icon">⚒</span><div><strong>Ada yang perlu diperbaiki?</strong><p>Pilih jenis kendala, ceritakan detailnya, dan kami akan meneruskan laporan ini kepada owner kos.</p></div><span class="response-chip">Laporan diteruskan ke owner</span></section><section class="panel report-form-panel"><div class="panel-header"><div><h2 class="panel-title">Buat laporan baru</h2><p class="panel-subtitle">Jelaskan gangguan sejelas mungkin supaya bisa segera ditangani.</p></div></div><form id="residentReportForm" class="resident-report-form"><label class="field"><span>Kategori gangguan</span><select name="category" required><option value="">Pilih kategori</option>${["Listrik", "Air", "Wi-Fi", "Kebersihan", "Keamanan", "Fasilitas kamar", "Lainnya"].map((item) => `<option>${item}</option>`).join("")}</select></label><label class="field"><span>Prioritas</span><select name="urgency" required><option>Normal</option><option>Rendah</option><option>Mendesak</option></select></label><label class="field full"><span>Judul laporan</span><input name="title" maxlength="100" placeholder="Contoh: Lampu kamar mati" required></label><label class="field full"><span>Detail gangguan</span><textarea name="description" minlength="10" maxlength="2000" rows="4" placeholder="Kapan mulai terjadi? Bagian mana yang terdampak? Tambahkan informasi yang membantu owner." required></textarea><small class="field-hint">Minimal 10 karakter. Jangan sertakan data pribadi sensitif.</small></label><div class="report-form-footer"><span>Nomor kamar ${escapeHtml(getRoom(resident?.roomId)?.name || "—")} akan disertakan otomatis.</span><button class="button button-primary" type="submit">Kirim laporan <span>→</span></button></div></form></section><section class="panel"><div class="panel-header"><div><h2 class="panel-title">Perkembangan laporan</h2><p class="panel-subtitle">${reports.length} laporan dikirim dari akun Anda</p></div></div>${reports.length ? `<div class="resident-report-list">${reports.map((report) => residentReportCard(report)).join("")}</div>` : `<div class="empty-state"><strong>Belum ada laporan gangguan</strong>Laporan yang Anda kirim akan tampil di sini beserta status tindak lanjutnya.</div>`}</section>`;
}

function renderResidentHistory() {
  const resident = getResident(currentUser.residentId);
  const payments = data.payments.filter((payment) => payment.residentId === resident?.id).sort((a, b) => b.date.localeCompare(a.date));
  const paid = payments.filter((payment) => payment.status === "Lunas").reduce((sum, payment) => sum + Number(payment.amount), 0);
  return `${pageHeading("CATATAN PEMBAYARAN", "Riwayat pembayaran", "Simpan dan cek kembali pembayaran yang pernah Anda lakukan.", "", "")}<div class="toolbar"><span class="panel-subtitle">Riwayat ini hanya terlihat oleh Anda dan owner.</span><button class="button button-quiet" data-action="export-resident-history">↓ &nbsp; Unduh CSV</button></div><section class="report-grid resident-history-stats"><article class="report-card"><span>Total pembayaran tercatat</span><strong>${money(paid)}</strong><small>${payments.filter((payment) => payment.status === "Lunas").length} transaksi lunas</small></article><article class="report-card"><span>Transaksi tercatat</span><strong>${payments.length}</strong><small>Semua periode</small></article><article class="report-card"><span>Nama penghuni</span><strong>${escapeHtml(resident?.name || "—")}</strong><small>Kamar ${escapeHtml(getRoom(resident?.roomId)?.name || "—")}</small></article></section><section class="panel data-panel"><div class="table-wrap"><table class="data-table"><thead><tr><th>PERIODE</th><th>TANGGAL</th><th>JUMLAH</th><th>METODE</th><th>STATUS</th></tr></thead><tbody>${payments.length ? payments.map((payment) => `<tr><td class="cell-primary">${escapeHtml(formatMonth(payment.month))}<span class="cell-secondary">${escapeHtml(data.bills.find((bill) => bill.id === payment.billId)?.title || "Pembayaran sewa")}</span></td><td>${formatDate(payment.date)}</td><td class="cell-primary">${money(payment.amount)}</td><td>${escapeHtml(payment.method)}</td><td>${statusPill(payment.status)}</td></tr>`).join("") : `<tr><td colspan="5"><div class="empty-state"><strong>Belum ada riwayat</strong>Catatan pembayaran yang dikonfirmasi owner akan tampil di sini.</div></td></tr>`}</tbody></table></div><div class="table-footer"><span>Riwayat hanya dapat dilihat oleh Anda dan owner kos.</span><strong>${payments.length} transaksi</strong></div></section>`;
}

function renderResidentProfile() {
  const resident = getResident(currentUser.residentId);
  const room = getRoom(resident?.roomId);
  const avatarHtml = resident?.profilePhoto ? `<img src="${resident.profilePhoto}" alt="Foto profil ${escapeHtml(resident.name)}">` : `<span>${escapeHtml(resident?.name?.trim().charAt(0).toUpperCase() || "P")}</span>`;
  return `${pageHeading("PENGATURAN AKUN", "Profil saya", "Atur foto profil dan password akun penghuni.", "", "")}<section class="profile-page-grid"><article class="panel profile-main-card"><div class="panel-header"><div><h2 class="panel-title">Foto profil</h2><p class="panel-subtitle">Gunakan foto JPG, PNG, atau WebP (maks. 1 MB).</p></div></div><div class="profile-photo-editor"><div class="profile-photo-preview" id="profilePhotoPreview">${avatarHtml}</div><div class="profile-photo-controls"><strong>${escapeHtml(resident?.name || "")}</strong><span>Foto hanya dapat diubah oleh Anda.</span><input id="profilePhotoInput" type="file" accept="image/png,image/jpeg,image/webp" hidden><div class="profile-photo-actions"><button class="button button-primary" data-action="choose-profile-photo" type="button">Pilih foto</button>${resident?.profilePhoto ? `<button class="button button-quiet" data-action="remove-profile-photo" type="button">Hapus foto</button>` : ""}<button class="button button-quiet" id="saveProfilePhoto" type="button" disabled>Simpan foto</button></div><small id="profilePhotoHint" class="field-hint">Foto ini akan terlihat di profil akun Anda.</small></div></div></article><article class="panel profile-info-card"><div class="panel-header"><div><h2 class="panel-title">Informasi penghuni</h2><p class="panel-subtitle">Informasi berikut dikelola oleh owner kos.</p></div><span class="read-only-chip">Hanya dapat dilihat</span></div><dl class="profile-details"><div><dt>Nama lengkap</dt><dd>${escapeHtml(resident?.name || "—")}</dd></div><div><dt>ID login</dt><dd>${escapeHtml(resident?.loginId || "—")}</dd></div><div><dt>Nomor telepon</dt><dd>${escapeHtml(resident?.phone || "—")}</dd></div><div><dt>Kamar</dt><dd>${escapeHtml(room?.name || "—")} · ${escapeHtml(room?.type || "—")}</dd></div><div><dt>Mulai tinggal</dt><dd>${formatDate(resident?.startDate)}</dd></div></dl></article><article class="panel password-panel"><div class="panel-header"><div><h2 class="panel-title">Ganti password</h2><p class="panel-subtitle">Gunakan password yang kuat dan tidak mudah ditebak.</p></div><span class="stat-icon">⌑</span></div><form id="residentPasswordForm" class="resident-password-form"><label class="field full"><span>Password saat ini</span><input name="currentPassword" type="password" autocomplete="current-password" required></label><label class="field"><span>Password baru</span><input name="newPassword" type="password" minlength="8" autocomplete="new-password" required><small class="field-hint">Minimal 8 karakter.</small></label><label class="field"><span>Ulangi password baru</span><input name="confirmPassword" type="password" minlength="8" autocomplete="new-password" required></label><div class="report-form-footer"><span>Nama, ID, nomor telepon, dan kamar tidak dapat diubah di sini.</span><button class="button button-primary" type="submit">Simpan password</button></div></form></article></section>`;
}

function renderResidentPage(page) {
  const renderers = { "resident-home": renderResidentPortal, "resident-bills": renderResidentBills, "resident-maintenance": renderResidentMaintenance, "resident-history": renderResidentHistory, "resident-profile": renderResidentProfile };
  return (renderers[page] || renderResidentPortal)();
}

function renderMaintenance() {
  const statusFilter = document.getElementById("maintenanceFilter")?.value || "Semua status";
  const reports = [...data.maintenanceReports].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).filter((report) => statusFilter === "Semua status" || report.status === statusFilter);
  const active = data.maintenanceReports.filter((report) => !["Selesai", "Ditolak"].includes(report.status)).length;
  return `${pageHeading("LAYANAN PENGHUNI", "Laporan gangguan", "Tindak lanjuti kendala fasilitas yang dilaporkan penghuni.", "", "")}<section class="report-grid"><article class="report-card"><span>Total laporan</span><strong>${data.maintenanceReports.length}</strong><small>Semua kamar</small></article><article class="report-card"><span>Perlu ditangani</span><strong>${active}</strong><small>Laporan aktif</small></article><article class="report-card"><span>Prioritas mendesak</span><strong>${data.maintenanceReports.filter((report) => report.urgency === "Mendesak" && !["Selesai", "Ditolak"].includes(report.status)).length}</strong><small>Belum selesai</small></article></section><div class="toolbar"><div class="toolbar-left"><span class="panel-subtitle">Pantau dan perbarui progres setiap laporan.</span></div><div class="toolbar-right"><select class="control" id="maintenanceFilter">${["Semua status", "Baru", "Dalam penanganan", "Terjadwal", "Selesai", "Ditolak"].map((status) => `<option ${statusFilter === status ? "selected" : ""}>${status}</option>`).join("")}</select></div></div><section class="panel">${reports.length ? `<div class="owner-report-list">${reports.map((report) => {
    const resident = getResident(report.residentId);
    const isActive = !["Selesai", "Ditolak"].includes(report.status);
    return `<article class="owner-report-card"><div class="owner-report-top"><div><span class="report-category-icon">${report.category === "Listrik" ? "ϟ" : report.category === "Air" ? "♧" : report.category === "Wi-Fi" ? "⌁" : "⚒"}</span><span class="owner-report-ident"><strong>${escapeHtml(report.title)}</strong><small>${escapeHtml(report.category)} · Kamar ${escapeHtml(getRoom(report.roomId)?.name || "—")} · ${formatDate(report.createdAt?.slice(0, 10))}</small></span></div><span class="report-status ${report.status === "Selesai" ? "done" : report.status === "Dalam penanganan" || report.status === "Terjadwal" ? "working" : report.status === "Ditolak" ? "declined" : ""}">${escapeHtml(report.status)}</span></div><p class="owner-report-description">${escapeHtml(report.description)}</p><div class="owner-report-footer"><span>Pelapor: <strong>${escapeHtml(resident?.name || "Penghuni")}</strong> · Prioritas <strong class="${report.urgency === "Mendesak" ? "urgent-text" : ""}">${escapeHtml(report.urgency)}</strong>${report.ownerNote ? `<small>Catatan terakhir: ${escapeHtml(report.ownerNote)}</small>` : ""}</span><div>${isActive ? `<select class="control" data-report-status="${escapeHtml(report.id)}">${["Baru", "Dalam penanganan", "Terjadwal", "Selesai", "Ditolak"].map((status) => `<option ${report.status === status ? "selected" : ""}>${status}</option>`).join("")}</select><button class="row-action" data-action="update-maintenance" data-id="${escapeHtml(report.id)}">Perbarui</button>` : `<span class="report-closed-label">Laporan ditutup</span>`}</div></div><label class="owner-note-field"><span>Catatan untuk penghuni</span><input type="text" maxlength="500" data-report-note="${escapeHtml(report.id)}" value="${escapeHtml(report.ownerNote || "")}" placeholder="Contoh: teknisi datang besok pukul 10.00"></label></article>`;
  }).join("")}</div>` : `<div class="empty-state"><strong>Belum ada laporan gangguan</strong>Laporan dari penghuni akan muncul di sini.</div>`}</section>`;
}

function renderPayments() {
  const query = (document.getElementById("paymentSearch")?.value || "").trim().toLowerCase();
  const filter = document.getElementById("paymentFilter")?.value || "Semua status";
  const payments = [...data.payments].sort((a, b) => b.month.localeCompare(a.month) || b.date.localeCompare(a.date)).filter((payment) => {
    const resident = getResident(payment.residentId);
    return `${resident?.name || "Penghuni dihapus"} ${payment.method} ${formatMonth(payment.month)}`.toLowerCase().includes(query) && (filter === "Semua status" || payment.status === filter);
  });
  const paid = payments.filter((payment) => payment.status === "Lunas").reduce((sum, payment) => sum + Number(payment.amount), 0);
  return `${pageHeading("PENCATATAN SEWA", "Pembayaran", "Catat dan pantau pembayaran sewa penghuni.", "Catat pembayaran", "add-payment")}
    <div class="toolbar"><div class="toolbar-left"><label class="search-field"><span>⌕</span><input id="paymentSearch" type="search" placeholder="Cari nama atau metode pembayaran..." value="${escapeHtml(query)}"></label><select class="control" id="paymentFilter">${["Semua status", "Lunas", "Menunggu", "Terlambat"].map((status) => `<option ${filter === status ? "selected" : ""}>${status}</option>`).join("")}</select></div><span class="table-footer" style="padding:0;border:0">Lunas ditampilkan: <strong>${money(paid)}</strong></span></div>
    <section class="panel data-panel"><div class="table-wrap"><table class="data-table"><thead><tr><th>PENGHUNI</th><th>PERIODE SEWA</th><th>TANGGAL BAYAR</th><th>METODE</th><th>JUMLAH</th><th>STATUS</th><th></th></tr></thead><tbody>${payments.length ? payments.map((payment) => {
      const resident = getResident(payment.residentId);
      return `<tr><td><div class="resident-cell">${avatar(resident?.name || "X")}<span><strong>${escapeHtml(resident?.name || "Penghuni dihapus")}</strong><small>Kamar ${escapeHtml(getRoom(resident?.roomId)?.name || "—")}</small></span></div></td><td class="cell-primary">${escapeHtml(formatMonth(payment.month))}</td><td>${formatDate(payment.date)}</td><td>${escapeHtml(payment.method)}</td><td class="cell-primary">${money(payment.amount)}</td><td>${statusPill(payment.status)}</td><td><div class="row-actions"><button class="row-action" data-action="edit-payment" data-id="${escapeHtml(payment.id)}">Edit</button><button class="row-action delete" data-action="delete-payment" data-id="${escapeHtml(payment.id)}">Hapus</button></div></td></tr>`;
    }).join("") : `<tr><td colspan="7"><div class="empty-state"><strong>Belum ada catatan pembayaran</strong>Catat pembayaran pertama untuk melihat riwayat sewa.</div></td></tr>`}</tbody></table></div><div class="table-footer"><span>Termasuk semua periode</span><strong>${payments.length} transaksi</strong></div></section>`;
}

function renderExpenses() {
  const query = (document.getElementById("expenseSearch")?.value || "").trim().toLowerCase();
  const expenses = [...data.expenses].sort((a, b) => b.date.localeCompare(a.date)).filter((expense) => `${expense.title} ${expense.category} ${expense.method}`.toLowerCase().includes(query));
  const total = expenses.reduce((sum, expense) => sum + Number(expense.amount), 0);
  return `${pageHeading("BIAYA OPERASIONAL", "Pengeluaran", "Catat biaya perawatan dan operasional kos.", "Tambah pengeluaran", "add-expense")}
    <div class="toolbar"><div class="toolbar-left"><label class="search-field"><span>⌕</span><input id="expenseSearch" type="search" placeholder="Cari pengeluaran atau kategori..." value="${escapeHtml(query)}"></label></div><span class="table-footer" style="padding:0;border:0">Total pengeluaran: <strong>${money(total)}</strong></span></div>
    <section class="panel data-panel"><div class="table-wrap"><table class="data-table"><thead><tr><th>KEPERLUAN</th><th>KATEGORI</th><th>TANGGAL</th><th>METODE</th><th>JUMLAH</th><th></th></tr></thead><tbody>${expenses.length ? expenses.map((expense) => `<tr><td class="cell-primary">${escapeHtml(expense.title)}</td><td>${escapeHtml(expense.category)}</td><td>${formatDate(expense.date)}</td><td>${escapeHtml(expense.method)}</td><td class="cell-primary">${money(expense.amount)}</td><td><div class="row-actions"><button class="row-action" data-action="edit-expense" data-id="${escapeHtml(expense.id)}">Edit</button><button class="row-action delete" data-action="delete-expense" data-id="${escapeHtml(expense.id)}">Hapus</button></div></td></tr>`).join("") : `<tr><td colspan="6"><div class="empty-state"><strong>Belum ada pengeluaran</strong>Catat biaya untuk memantau operasional kos.</div></td></tr>`}</tbody></table></div><div class="table-footer"><span>Total seluruh catatan</span><strong>${expenses.length} transaksi</strong></div></section>`;
}

function renderReports() {
  const monthPayments = data.payments.filter((payment) => payment.month === reportMonth);
  const monthExpenses = data.expenses.filter((expense) => expense.date.slice(0, 7) === reportMonth);
  const income = monthPayments.filter((payment) => payment.status === "Lunas").reduce((sum, payment) => sum + Number(payment.amount), 0);
  const expenses = monthExpenses.reduce((sum, expense) => sum + Number(expense.amount), 0);
  const net = income - expenses;
  const max = Math.max(income, expenses, 1);
  return `${pageHeading("ANALISIS OPERASIONAL", "Laporan kos", "Ringkasan pemasukan dan pengeluaran per bulan.", "", "")}
    <div class="toolbar"><div class="toolbar-left"><label class="field" style="display:flex;align-items:center;gap:9px"><span style="color:#858d85;font-size:10px">Periode laporan</span><input class="control" id="reportMonth" type="month" value="${escapeHtml(reportMonth)}"></label></div><div class="toolbar-right"><button class="button button-quiet" data-action="export-report">↓ &nbsp; Unduh CSV</button></div></div>
    <section class="report-grid"><article class="report-card"><span>Total pemasukan lunas</span><strong>${money(income)}</strong><small>${monthPayments.filter((payment) => payment.status === "Lunas").length} transaksi lunas · ${escapeHtml(formatMonth(reportMonth))}</small></article><article class="report-card"><span>Total pengeluaran</span><strong>${money(expenses)}</strong><small>${monthExpenses.length} catatan operasional</small></article><article class="report-card"><span>Selisih bersih</span><strong style="color:${net < 0 ? "#bd6258" : "#347151"}">${money(net)}</strong><small>Pemasukan lunas dikurangi pengeluaran</small></article></section>
    <section class="dashboard-grid"><article class="panel"><div class="panel-header"><div><h2 class="panel-title">Perbandingan keuangan</h2><p class="panel-subtitle">${escapeHtml(formatMonth(reportMonth))}</p></div></div><div class="report-bar-list"><div><div class="report-bar-top"><span>Pemasukan diterima</span><strong>${money(income)}</strong></div><div class="bar-track"><div class="bar-fill" style="width:${Math.round(income / max * 100)}%"></div></div></div><div><div class="report-bar-top"><span>Biaya operasional</span><strong>${money(expenses)}</strong></div><div class="bar-track"><div class="bar-fill expense" style="width:${Math.round(expenses / max * 100)}%"></div></div></div></div><div class="report-note">Laporan menghitung pemasukan dengan status <strong>Lunas</strong>. Pembayaran yang menunggu konfirmasi tidak dimasukkan ke total pemasukan.</div></article>
    <article class="panel"><div class="panel-header"><div><h2 class="panel-title">Ringkasan okupansi</h2><p class="panel-subtitle">Kondisi kamar saat ini</p></div></div><div class="occupancy-summary"><div class="donut" style="--occupancy:${data.rooms.length ? Math.round(occupiedRooms() / data.rooms.length * 100) : 0}%"><div class="donut-label"><strong>${data.rooms.length ? Math.round(occupiedRooms() / data.rooms.length * 100) : 0}%</strong><small>TERISI</small></div></div><div class="occupancy-legend"><div class="legend-item"><span class="legend-name"><i class="legend-dot"></i>Terisi</span><strong class="legend-count">${occupiedRooms()}</strong></div><div class="legend-item"><span class="legend-name"><i class="legend-dot vacant"></i>Tersedia</span><strong class="legend-count">${data.rooms.length - occupiedRooms()}</strong></div></div></div><div class="occupancy-footer"><span>Total kamar</span><strong>${data.rooms.length}</strong></div></article></section>
    <section class="panel data-panel"><div class="panel-header" style="padding:17px 17px 0;margin-bottom:12px"><div><h2 class="panel-title">Rincian pembayaran periode ini</h2><p class="panel-subtitle">Semua catatan sewa untuk ${escapeHtml(formatMonth(reportMonth))}</p></div></div><div class="table-wrap"><table class="data-table"><thead><tr><th>PENGHUNI</th><th>TANGGAL</th><th>METODE</th><th>JUMLAH</th><th>STATUS</th></tr></thead><tbody>${monthPayments.length ? monthPayments.map((payment) => `<tr><td class="cell-primary">${escapeHtml(getResident(payment.residentId)?.name || "Penghuni dihapus")}</td><td>${formatDate(payment.date)}</td><td>${escapeHtml(payment.method)}</td><td class="cell-primary">${money(payment.amount)}</td><td>${statusPill(payment.status)}</td></tr>`).join("") : `<tr><td colspan="5"><div class="empty-state">Tidak ada transaksi sewa untuk periode ini.</div></td></tr>`}</tbody></table></div></section>`;
}

function renderPage() {
  const renderers = { dashboard: renderDashboard, rooms: renderRooms, residents: renderResidents, bills: renderBills, maintenance: renderMaintenance, payments: renderPayments, expenses: renderExpenses, reports: renderReports };
  pageContent.innerHTML = (renderers[activePage] || renderDashboard)();
  document.getElementById("roomNavCount").textContent = data.rooms.length;
  const maintenanceCount = data.maintenanceReports.filter((report) => report.status === "Baru").length;
  document.getElementById("maintenanceNavCount").textContent = maintenanceCount;
  document.getElementById("maintenanceNavCount").hidden = maintenanceCount === 0;
}

function refreshCurrentPage() {
  if (currentUser?.role === "resident") {
    pageContent.innerHTML = renderResidentPage(activePage);
    updateResidentAvatar();
  } else renderPage();
}

async function submitMaintenanceReport(form) {
  const values = Object.fromEntries(new FormData(form).entries());
  const button = form.querySelector('[type="submit"]');
  button.disabled = true;
  try {
    const result = await apiRequest("/api/maintenance-reports", {
      method: "POST",
      body: JSON.stringify(values)
    });
    data = result.data;
    refreshCurrentPage();
    toast("Laporan terkirim. Owner dapat melihatnya di menu Laporan gangguan.");
  } catch (error) {
    toast(error.message);
    button.disabled = false;
  }
}

async function updateMaintenanceReport(id) {
  const status = pageContent.querySelector(`[data-report-status="${CSS.escape(id)}"]`)?.value;
  const ownerNote = pageContent.querySelector(`[data-report-note="${CSS.escape(id)}"]`)?.value || "";
  if (!status) return;
  try {
    const result = await apiRequest(`/api/maintenance-reports/${encodeURIComponent(id)}`, {
      method: "PATCH",
      body: JSON.stringify({ status, ownerNote })
    });
    data = result.data;
    renderPage();
    toast("Status laporan diperbarui dan terlihat oleh penghuni.");
  } catch (error) {
    toast(error.message);
  }
}

async function saveProfilePhoto(photo) {
  try {
    const result = await apiRequest("/api/profile", {
      method: "PUT",
      body: JSON.stringify({ profilePhoto: photo })
    });
    data = result.data;
    pendingProfilePhoto = null;
    refreshCurrentPage();
    toast(photo ? "Foto profil berhasil diperbarui." : "Foto profil dihapus.");
  } catch (error) {
    toast(error.message);
  }
}

async function changeResidentPassword(form) {
  const values = Object.fromEntries(new FormData(form).entries());
  if (values.newPassword.length < 8) {
    toast("Password baru minimal 8 karakter.");
    return;
  }
  if (values.newPassword !== values.confirmPassword) {
    toast("Konfirmasi password baru belum sama.");
    return;
  }
  const button = form.querySelector('[type="submit"]');
  button.disabled = true;
  try {
    await apiRequest("/api/profile/password", {
      method: "POST",
      body: JSON.stringify({ currentPassword: values.currentPassword, newPassword: values.newPassword })
    });
    form.reset();
    toast("Password berhasil diganti.");
  } catch (error) {
    toast(error.message);
  } finally {
    button.disabled = false;
  }
}

function exportResidentHistory() {
  const resident = getResident(currentUser?.residentId);
  if (!resident) return;
  const payments = data.payments.filter((payment) => payment.residentId === resident.id);
  const rows = [
    ["Periode", "Tanggal", "Keterangan", "Jumlah (Rp)", "Metode", "Status"],
    ...payments.map((payment) => [
      formatMonth(payment.month),
      formatDate(payment.date),
      data.bills.find((bill) => bill.id === payment.billId)?.title || "Pembayaran sewa",
      payment.amount,
      payment.method,
      payment.status
    ])
  ];
  const csv = rows.map((row) => row.map((cell) => `"${String(cell ?? "").replace(/"/g, '""')}"`).join(",")).join("\r\n");
  const url = URL.createObjectURL(new Blob(["\uFEFF", csv], { type: "text/csv;charset=utf-8" }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `riwayat-pembayaran-kamar-${getRoom(resident.roomId)?.name || "penghuni"}.csv`;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  toast("Riwayat pembayaran berhasil diunduh.");
}

function field(name, label, type = "text", value = "", options = [], full = false, hint = "", required = true) {
  const id = `field-${name}`;
  let control;
  if (type === "select") {
    control = `<select id="${id}" name="${name}" ${required ? "required" : ""}><option value="">Pilih ${label.toLowerCase()}</option>${options.map((option) => {
      const optionValue = typeof option === "string" ? option : option.value;
      const optionLabel = typeof option === "string" ? option : option.label;
      return `<option value="${escapeHtml(optionValue)}" ${String(value) === String(optionValue) ? "selected" : ""}>${escapeHtml(optionLabel)}</option>`;
    }).join("")}</select>`;
  } else {
    const inputType = type === "textarea" ? "textarea" : "input";
    control = inputType === "textarea"
      ? `<textarea id="${id}" name="${name}" required>${escapeHtml(value)}</textarea>`
      : `<input id="${id}" name="${name}" type="${type}" value="${escapeHtml(value)}" ${type === "number" ? 'min="0" step="1000"' : ""} ${required ? "required" : ""}>`;
  }
  return `<div class="field ${full ? "full" : ""}"><label for="${id}">${label}</label>${control}${hint ? `<small class="field-hint">${hint}</small>` : ""}</div>`;
}

function roomOptions(selectedId, excludedResidentId = null) {
  return data.rooms.filter((room) => {
    const resident = residentForRoom(room.id);
    return !resident || room.id === selectedId || resident.id === excludedResidentId;
  }).map((room) => ({ value: room.id, label: `Kamar ${room.name} · ${room.type} · ${money(room.price)}` }));
}

function residentOptions(selectedId) {
  return data.residents.map((resident) => ({ value: resident.id, label: `${resident.name} · Kamar ${getRoom(resident.roomId)?.name || "—"}` }));
}

function openModal(kind, id = null) {
  editing = { kind, id };
  const item = id ? findItem(kind === "bill-payment" ? "bill" : kind, id) : null;
  const prefix = id ? "edit" : "add";
  const titleMap = { room: ["Kamar", "Kamar"], resident: ["Penghuni", "Penghuni"], payment: ["Pembayaran sewa", "Pembayaran"], expense: ["Pengeluaran", "Pengeluaran"], bill: ["Tagihan", "Tagihan"], "bill-payment": ["Konfirmasi pembayaran", "Portal penghuni"] };
  const title = kind === "bill-payment" ? "Konfirmasi pembayaran" : `${id ? "Edit" : "Tambah"} ${titleMap[kind][0]}`;
  document.getElementById("modalTitle").textContent = title;
  document.getElementById("modalEyebrow").textContent = `${prefix === "edit" ? "UBAH DATA" : "DATA BARU"} · ${titleMap[kind][1].toUpperCase()}`;
  document.getElementById("saveModal").innerHTML = kind === "bill-payment" ? "Kirim konfirmasi <span>→</span>" : `${id ? "Simpan perubahan" : "Simpan data"} <span>→</span>`;

  if (kind === "room") {
    modalFields.innerHTML = field("name", "Nomor kamar", "text", item?.name || "", [], false, "Contoh: 101, A1, atau Paviliun 1")
      + field("type", "Tipe kamar", "select", item?.type || "Standard", ["Standard", "Deluxe", "Premium", "Lainnya"])
      + field("price", "Harga sewa per bulan (Rp)", "number", item?.price ?? "", [], true);
  } else if (kind === "resident") {
    const selectedRoom = item?.roomId || "";
    const availableRooms = roomOptions(selectedRoom, id);
    modalFields.innerHTML = field("name", "Nama lengkap", "text", item?.name || "")
      + field("phone", "Nomor telepon", "tel", item?.phone || "")
      + field("roomId", "Pilih kamar", "select", selectedRoom, availableRooms, true, availableRooms.length ? "Hanya kamar yang tersedia yang ditampilkan." : "Tambahkan kamar yang tersedia terlebih dahulu.")
      + field("startDate", "Tanggal mulai tinggal", "date", item?.startDate || today(), [], true)
      + field("loginId", "ID login penghuni", "text", item?.loginId || "", [], true, "Tepat 8 digit angka. Bagikan ID ini kepada penghuni.")
      + field("password", id && item?.loginId ? "Password baru (opsional)" : "Password awal penghuni", "password", "", [], true, id && item?.loginId ? "Kosongkan jika tidak ingin mengganti password." : "Minimal 8 karakter. Bagikan kepada penghuni secara pribadi.", !id || !item?.loginId);
    const loginInput = modalFields.querySelector('[name="loginId"]');
    loginInput.inputMode = "numeric";
    loginInput.pattern = "[0-9]{8}";
    loginInput.minLength = 8;
    loginInput.maxLength = 8;
    loginInput.placeholder = "Contoh: 00123456";
    loginInput.addEventListener("input", () => {
      loginInput.value = loginInput.value.replace(/\D/g, "").slice(0, 8);
    });
    modalFields.querySelector('[name="password"]')?.setAttribute("minlength", "8");
  } else if (kind === "payment") {
    if (!data.residents.length) {
      closeModal();
      toast("Tambahkan data penghuni sebelum mencatat pembayaran.");
      return;
    }
    const resident = item && getResident(item.residentId);
    const defaultRoom = resident ? getRoom(resident.roomId) : null;
    modalFields.innerHTML = field("residentId", "Penghuni", "select", item?.residentId || "", residentOptions(item?.residentId), true)
      + field("amount", "Jumlah pembayaran (Rp)", "number", item?.amount ?? defaultRoom?.price ?? (getRoom(data.residents[0].roomId)?.price || 0))
      + field("month", "Periode sewa", "month", item?.month || currentMonth())
      + field("date", "Tanggal pembayaran", "date", item?.date || today())
      + field("method", "Metode pembayaran", "select", item?.method || "Transfer bank", ["Transfer bank", "Tunai", "E-wallet"], false)
      + field("status", "Status", "select", item?.status || "Lunas", ["Lunas", "Menunggu", "Terlambat"], false);
  } else if (kind === "bill") {
    if (!data.residents.length) {
      closeModal();
      toast("Tambahkan data penghuni terlebih dahulu.");
      return;
    }
    modalFields.innerHTML = field("residentId", "Penghuni", "select", item?.residentId || "", residentOptions(item?.residentId), true)
      + field("category", "Jenis tagihan", "select", item?.category || "Sewa", ["Sewa", "Listrik", "Air", "Wi-Fi", "Lainnya"])
      + field("title", "Nama tagihan", "text", item?.title || "Sewa kamar", [], true)
      + field("amount", "Jumlah tagihan (Rp)", "number", item?.amount ?? "")
      + field("month", "Periode tagihan", "month", item?.month || currentMonth())
      + field("dueDate", "Tanggal jatuh tempo", "date", item?.dueDate || today());
  } else if (kind === "bill-payment") {
    const bill = item;
    if (!bill) {
      closeModal();
      return;
    }
    modalFields.innerHTML = `<p class="payment-confirm-copy">Anda akan mengirim konfirmasi pembayaran <strong>${escapeHtml(bill.title)}</strong> sebesar <strong>${money(bill.amount)}</strong>. Owner akan memeriksa pembayaran sebelum menandainya lunas.</p>`
      + field("method", "Metode pembayaran", "select", "Transfer bank", ["Transfer bank", "Tunai", "E-wallet"], true)
      + `<label class="field full"><span>Catatan (opsional)</span><textarea name="note" placeholder="Contoh: transfer dari rekening atas nama ..."></textarea></label>`;
  } else if (kind === "expense") {
    modalFields.innerHTML = field("title", "Keperluan", "text", item?.title || "", [], true)
      + field("category", "Kategori", "select", item?.category || "Utilitas", ["Utilitas", "Perawatan", "Kebersihan", "Perlengkapan", "Lainnya"])
      + field("amount", "Jumlah (Rp)", "number", item?.amount ?? "")
      + field("date", "Tanggal", "date", item?.date || today())
      + field("method", "Metode pembayaran", "select", item?.method || "Transfer bank", ["Transfer bank", "Tunai", "E-wallet"], true);
  }
  modalBackdrop.hidden = false;
  document.body.style.overflow = "hidden";
  window.setTimeout(() => modalFields.querySelector("input,select,textarea")?.focus(), 0);
}

function findItem(kind, id) {
  const key = { room: "rooms", resident: "residents", payment: "payments", expense: "expenses", bill: "bills" }[kind];
  return data[key].find((item) => item.id === id);
}

function closeModal() {
  modalBackdrop.hidden = true;
  document.body.style.overflow = "";
  editing = null;
}

function newId(kind) {
  return `${kind}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

async function submitModal(event) {
  event.preventDefault();
  if (!editing) return;
  const values = Object.fromEntries(new FormData(modalForm).entries());
  const { kind, id } = editing;
  if (kind === "bill-payment") {
    try {
      const result = await apiRequest(`/api/bills/${encodeURIComponent(id)}/pay`, {
        method: "POST",
        body: JSON.stringify({ method: values.method, note: values.note || "" })
      });
      data = result.data;
      closeModal();
      pageContent.innerHTML = renderResidentPortal();
      toast("Konfirmasi pembayaran dikirim ke owner.");
    } catch (error) {
      toast(error.message);
    }
    return;
  }
  const collection = { room: "rooms", resident: "residents", payment: "payments", expense: "expenses", bill: "bills" }[kind];
  const record = { ...values };
  delete record.password;
  if (kind === "payment" || kind === "expense") record.amount = Number(values.amount);
  if (kind === "bill") {
    record.amount = Number(values.amount);
    record.status = id ? findItem("bill", id)?.status || "Belum dibayar" : "Belum dibayar";
  }
  if (kind === "room") record.price = Number(values.price);
  const existing = id && findItem(kind, id);
  if (kind === "room" && data.rooms.some((room) => room.name.trim().toLowerCase() === record.name.trim().toLowerCase() && room.id !== id)) {
    toast("Nomor kamar tersebut sudah digunakan.");
    return;
  }
  if (kind === "payment") {
    const resident = getResident(record.residentId);
    if (!resident) {
      toast("Pilih penghuni yang masih terdaftar.");
      return;
    }
  }
  if (kind === "resident") {
    const assigned = residentForRoom(record.roomId);
    if (assigned && assigned.id !== id) {
      toast("Kamar tersebut sudah ditempati. Pilih kamar yang tersedia.");
      return;
    }
    record.loginId = values.loginId.trim();
    if (!/^\d{8}$/.test(record.loginId)) {
      toast("ID login penghuni harus tepat 8 digit angka.");
      return;
    }
    if (normalizedLogin(record.loginId) === normalizedLogin(data.owner.loginId)) {
      toast("ID login penghuni tidak boleh sama dengan ID owner.");
      return;
    }
    if (data.residents.some((resident) => resident.id !== id && normalizedLogin(resident.loginId) === normalizedLogin(record.loginId))) {
      toast("ID login tersebut sudah digunakan penghuni lain.");
      return;
    }
    if (!id && values.password.length < 8) {
      toast("Password akun penghuni minimal 8 karakter.");
      return;
    }
    if (values.password) record.password = values.password;
  }
  if (kind === "bill" && !getResident(record.residentId)) {
    toast("Pilih penghuni yang masih terdaftar.");
    return;
  }
  if (existing) Object.assign(existing, record);
  else data[collection].push({ id: newId(kind), ...record });
  const saved = await saveData();
  if (!saved) return;
  closeModal();
  renderPage();
  toast(id ? "Perubahan berhasil disimpan." : "Data baru berhasil ditambahkan.");
}

async function deleteRecord(kind, id) {
  const collection = { room: "rooms", resident: "residents", payment: "payments", expense: "expenses", bill: "bills" }[kind];
  const item = findItem(kind, id);
  if (!item) return;
  const descriptions = {
    room: `Hapus kamar ${item.name}?`,
    resident: `Hapus data penghuni ${item.name}? Riwayat pembayarannya tetap disimpan.`,
    payment: "Hapus catatan pembayaran ini?",
    expense: `Hapus catatan pengeluaran "${item.title}"?`,
    bill: `Hapus tagihan "${item.title}"?`
  };
  if (!window.confirm(`${descriptions[kind]} Tindakan ini tidak dapat dibatalkan.`)) return;
  if (kind === "room" && residentForRoom(id)) {
    toast("Kamar yang sedang ditempati tidak dapat dihapus.");
    return;
  }
  if (kind === "resident") {
    data.bills = data.bills.filter((bill) => bill.residentId !== id);
  }
  if (kind === "bill") data.payments.forEach((payment) => { if (payment.billId === id) delete payment.billId; });
  data[collection] = data[collection].filter((entry) => entry.id !== id);
  const saved = await saveData();
  if (!saved) return;
  renderPage();
  toast("Data berhasil dihapus.");
}

async function confirmBill(id) {
  try {
    const result = await apiRequest(`/api/bills/${encodeURIComponent(id)}/confirm`, { method: "POST" });
    data = result.data;
    renderPage();
    toast("Pembayaran dikonfirmasi dan dicatat lunas.");
  } catch (error) {
    toast(error.message);
  }
}

function exportReport() {
  const payments = data.payments.filter((payment) => payment.month === reportMonth);
  const expenses = data.expenses.filter((expense) => expense.date.slice(0, 7) === reportMonth);
  const rows = [
    ["Jenis", "Nama / Keterangan", "Periode / Tanggal", "Metode", "Jumlah (Rp)", "Status"],
    ...payments.map((payment) => ["Pemasukan sewa", getResident(payment.residentId)?.name || "Penghuni dihapus", formatMonth(payment.month), payment.method, payment.amount, payment.status]),
    ...expenses.map((expense) => ["Pengeluaran", expense.title, formatDate(expense.date), expense.method, expense.amount, expense.category])
  ];
  const csv = rows.map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(",")).join("\r\n");
  const link = document.createElement("a");
  const url = URL.createObjectURL(new Blob(["\uFEFF", csv], { type: "text/csv;charset=utf-8" }));
  link.href = url;
  link.download = `laporan-ruangkos-${reportMonth}.csv`;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  toast("Laporan CSV berhasil diunduh.");
}

document.querySelectorAll(".nav-link, .brand").forEach((button) => button.addEventListener("click", (event) => {
  event.preventDefault();
  setPage(button.dataset.page || "dashboard");
}));

pageContent.addEventListener("click", (event) => {
  const target = event.target.closest("[data-action], [data-page]");
  if (!target) return;
  if (target.dataset.page) {
    setPage(target.dataset.page);
    return;
  }
  const [verb, noun] = target.dataset.action.split("-");
  const kind = { room: "room", resident: "resident", payment: "payment", expense: "expense" }[noun];
  if (target.dataset.action === "choose-profile-photo") document.getElementById("profilePhotoInput")?.click();
  else if (target.dataset.action === "remove-profile-photo") saveProfilePhoto(null);
  else if (target.dataset.action === "export-resident-history") exportResidentHistory();
  else if (target.dataset.action === "update-maintenance") updateMaintenanceReport(target.dataset.id);
  else if (target.dataset.action === "add-bill") openModal("bill");
  else if (target.dataset.action === "edit-bill") openModal("bill", target.dataset.id);
  else if (target.dataset.action === "delete-bill") deleteRecord("bill", target.dataset.id);
  else if (target.dataset.action === "pay-bill") openModal("bill-payment", target.dataset.id);
  else if (target.dataset.action === "confirm-bill") confirmBill(target.dataset.id);
  else if (verb === "add") openModal(kind);
  else if (verb === "edit") openModal(kind, target.dataset.id);
  else if (verb === "delete") deleteRecord(kind, target.dataset.id);
  else if (target.dataset.action === "export-report") exportReport();
});

pageContent.addEventListener("input", (event) => {
  if (["roomSearch", "residentSearch", "paymentSearch", "expenseSearch", "billSearch"].includes(event.target.id)) {
    const { id, selectionStart, selectionEnd } = event.target;
    renderPage();
    const refreshedInput = document.getElementById(id);
    refreshedInput?.focus();
    if (refreshedInput && selectionStart !== null) refreshedInput.setSelectionRange(selectionStart, selectionEnd);
  }
});
pageContent.addEventListener("change", async (event) => {
  if (event.target.id !== "profilePhotoInput") return;
  const file = event.target.files?.[0];
  if (!file) return;
  const hint = document.getElementById("profilePhotoHint");
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type) || file.size > 1024 * 1024) {
    hint.textContent = file.size > 1024 * 1024 ? "Ukuran foto maksimal 1 MB." : "Pilih foto JPG, PNG, atau WebP.";
    event.target.value = "";
    return;
  }
  try {
    pendingProfilePhoto = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(new Error("Foto tidak dapat dibaca."));
      reader.readAsDataURL(file);
    });
    document.getElementById("profilePhotoPreview").innerHTML = `<img src="${pendingProfilePhoto}" alt="Pratinjau foto profil">`;
    document.getElementById("saveProfilePhoto").disabled = false;
    hint.textContent = `${file.name} dipilih. Simpan untuk memperbarui foto.`;
  } catch (error) {
    hint.textContent = error.message;
  }
});
pageContent.addEventListener("change", (event) => {
  if (event.target.id === "reportMonth" && event.target.value) {
    reportMonth = event.target.value;
    renderPage();
  } else if (["roomFilter", "paymentFilter", "billFilter"].includes(event.target.id)) renderPage();
});
pageContent.addEventListener("click", (event) => {
  if (event.target.id !== "saveProfilePhoto") return;
  if (pendingProfilePhoto) saveProfilePhoto(pendingProfilePhoto);
});
pageContent.addEventListener("submit", (event) => {
  if (event.target.id === "residentReportForm") {
    event.preventDefault();
    submitMaintenanceReport(event.target);
  } else if (event.target.id === "residentPasswordForm") {
    event.preventDefault();
    changeResidentPassword(event.target);
  }
});

modalForm.addEventListener("submit", submitModal);
document.getElementById("closeModal").addEventListener("click", closeModal);
document.getElementById("cancelModal").addEventListener("click", closeModal);
modalBackdrop.addEventListener("click", (event) => {
  if (event.target === modalBackdrop) closeModal();
});
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && !modalBackdrop.hidden) closeModal();
});
document.getElementById("mobileMenu").addEventListener("click", () => document.getElementById("sidebar").classList.toggle("open"));
document.getElementById("todayLabel").textContent = new Intl.DateTimeFormat("id-ID", { weekday: "short", day: "numeric", month: "short", year: "numeric" }).format(new Date());
document.getElementById("profileButton").addEventListener("click", () => {
  if (currentUser?.role !== "owner") return;
  logout();
});

async function logout() {
  try {
    await apiRequest("/api/logout", { method: "POST" });
  } catch (error) {
    console.error("Sesi gagal ditutup di server.", error);
  }
  currentUser = null;
  sessionStorage.removeItem(SESSION_KEY);
  ownerExists = true;
  closeModal();
  loginRole = "owner";
  renderAuth();
}

document.getElementById("logoutButton").addEventListener("click", logout);

document.getElementById("authScreen").addEventListener("click", (event) => {
  const roleButton = event.target.closest("[data-login-role]");
  if (!roleButton) return;
  loginRole = roleButton.dataset.loginRole;
  renderAuth();
});

document.getElementById("authScreen").addEventListener("submit", async (event) => {
  event.preventDefault();
  const values = Object.fromEntries(new FormData(event.target).entries());
  const submitButton = event.target.querySelector('[type="submit"]');
  submitButton.disabled = true;
  try {
    if (event.target.id === "ownerSetupForm") {
      const result = await apiRequest("/api/setup", {
        method: "POST",
        body: JSON.stringify({ ...values, initialData: data })
      });
      sessionStorage.setItem(SESSION_KEY, result.token);
      currentUser = result.user;
      ownerExists = true;
      data = (await apiRequest("/api/state")).data;
      showApp();
      toast("Akun owner berhasil dibuat.");
      return;
    }

    const result = await apiRequest("/api/login", {
      method: "POST",
      body: JSON.stringify({ role: loginRole, loginId: values.loginId, password: values.password })
    });
    sessionStorage.setItem(SESSION_KEY, result.token);
    currentUser = result.user;
    ownerExists = true;
    data = (await apiRequest("/api/state")).data;
    showApp();
  } catch (error) {
    if (event.target.id === "loginForm") {
      renderAuth(error.message);
    } else {
      console.error("Proses autentikasi gagal.", error);
      renderAuth(error.message || "Tidak dapat memproses akun. Coba muat ulang halaman.");
    }
  }
});

async function bootstrap() {
  try {
    const session = await apiRequest("/api/session");
    ownerExists = session.ownerExists;
    currentUser = session.user || null;
    if (currentUser) {
      data = (await apiRequest("/api/state")).data;
      showApp();
    } else {
      sessionStorage.removeItem(SESSION_KEY);
      renderAuth();
    }
  } catch (error) {
    console.error("Tidak dapat terhubung ke server RuangKos.", error);
    document.getElementById("authScreen").hidden = false;
    document.getElementById("authScreen").innerHTML = `<section class="auth-card"><a class="brand auth-brand" href="#"><span class="brand-mark"><span></span><span></span><span></span><span></span></span><span class="brand-copy"><strong>ruang<span>kos</span></strong><small>PROPERTY MANAGER</small></span></a><span class="eyebrow">KONEKSI SERVER</span><h1>Aplikasi belum terhubung</h1><p class="auth-description">${escapeHtml(error.message)} Periksa konfigurasi backend lalu muat ulang halaman.</p></section>`;
  }
}

bootstrap();
