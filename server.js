const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { promisify } = require("node:util");

const root = __dirname;
const dataDirectory = path.join(root, "data");
const storePath = path.join(dataDirectory, "ruangkos-store.json");
const port = Number(process.env.PORT) || 4173;
const host = process.env.HOST || "0.0.0.0";
const passwordLength = 64;
const sessionLifetime = 12 * 60 * 60 * 1000;
const scrypt = promisify(crypto.scrypt);
const sessions = new Map();
const contentTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml"
};
let store;

function currentDate() {
  return new Date().toISOString().slice(0, 10);
}

function currentMonth() {
  return currentDate().slice(0, 7);
}

function seedData() {
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
    { id: "payment-1", residentId: "resident-1", amount: 850000, month: currentMonth(), date: currentDate(), method: "Transfer bank", status: "Lunas" },
    { id: "payment-2", residentId: "resident-2", amount: 1100000, month: currentMonth(), date: currentDate(), method: "Transfer bank", status: "Lunas" },
    { id: "payment-3", residentId: "resident-3", amount: 900000, month: currentMonth(), date: currentDate(), method: "Tunai", status: "Menunggu" },
    { id: "payment-4", residentId: "resident-4", amount: 1200000, month: currentMonth(), date: currentDate(), method: "Transfer bank", status: "Lunas" },
    { id: "payment-5", residentId: "resident-5", amount: 1250000, month: currentMonth(), date: currentDate(), method: "Transfer bank", status: "Lunas" }
  ];
  return { rooms, residents, payments, expenses: [], bills: [], maintenanceReports: [] };
}

async function loadStore() {
  try {
    store = JSON.parse(await fs.promises.readFile(storePath, "utf8"));
    store.bills = Array.isArray(store.bills) ? store.bills : [];
    store.maintenanceReports = Array.isArray(store.maintenanceReports) ? store.maintenanceReports : [];
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
    store = { ...seedData(), owner: null };
  }
}

async function persistStore() {
  await fs.promises.mkdir(dataDirectory, { recursive: true });
  const temporaryPath = `${storePath}.${process.pid}.${crypto.randomUUID()}.tmp`;
  await fs.promises.writeFile(temporaryPath, JSON.stringify(store, null, 2), { mode: 0o600 });
  await fs.promises.rename(temporaryPath, storePath);
}

function safeOwner(owner) {
  if (!owner) return null;
  const { passwordHash, passwordSalt, ...publicOwner } = owner;
  return publicOwner;
}

function safeResident(resident) {
  if (!resident) return null;
  const { passwordHash, passwordSalt, password, ...publicResident } = resident;
  return publicResident;
}

function publicState(session) {
  const owner = safeOwner(store.owner);
  if (session.role === "owner") {
    return {
      rooms: store.rooms,
      residents: store.residents.map(safeResident),
      payments: store.payments,
      expenses: store.expenses,
      bills: store.bills,
      maintenanceReports: store.maintenanceReports,
      owner
    };
  }
  const resident = store.residents.find((item) => item.id === session.residentId);
  if (!resident) throw httpError(401, "Akun penghuni sudah tidak aktif.");
  const room = store.rooms.find((item) => item.id === resident.roomId);
  return {
    rooms: room ? [room] : [],
    residents: [safeResident(resident)],
    payments: store.payments.filter((payment) => payment.residentId === resident.id),
    expenses: [],
    bills: store.bills.filter((bill) => bill.residentId === resident.id),
    maintenanceReports: store.maintenanceReports.filter((report) => report.residentId === resident.id),
    owner
  };
}

function normalizedLogin(value) {
  return String(value || "").trim().toLowerCase();
}

function validateProfilePhoto(value) {
  if (value === null || value === "") return null;
  if (typeof value !== "string") throw httpError(400, "Foto profil tidak valid.");
  const match = value.match(/^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/]+={0,2})$/);
  if (!match) throw httpError(400, "Gunakan foto JPG, PNG, atau WebP.");
  const bytes = Buffer.from(match[2], "base64");
  if (!bytes.length || bytes.length > 1024 * 1024) throw httpError(413, "Ukuran foto maksimal 1 MB.");
  const validSignature = match[1] === "image/png"
    ? bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
    : match[1] === "image/jpeg"
      ? bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255
      : bytes.length >= 12 && bytes.toString("ascii", 0, 4) === "RIFF" && bytes.toString("ascii", 8, 12) === "WEBP";
  if (!validSignature) throw httpError(400, "Format isi foto tidak sesuai dengan jenis berkasnya.");
  return value;
}

function httpError(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function sendJson(response, status, value, headers = {}) {
  response.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", ...headers });
  response.end(JSON.stringify(value));
}

async function readJson(request) {
  let body = "";
  for await (const chunk of request) {
    body += chunk;
    if (body.length > 2_000_000) throw httpError(413, "Ukuran data terlalu besar.");
  }
  try {
    return body ? JSON.parse(body) : {};
  } catch {
    throw httpError(400, "Format data tidak valid.");
  }
}

function requestSession(request) {
  const cookie = request.headers.cookie || "";
  const token = cookie.split(";").map((part) => part.trim()).find((part) => part.startsWith("ruangkos_session="))?.slice("ruangkos_session=".length);
  const session = token ? sessions.get(token) : null;
  if (session?.expiresAt && session.expiresAt <= Date.now()) {
    sessions.delete(token);
    return null;
  }
  return session;
}

function publicSession(session) {
  if (!session) return null;
  return session.role === "resident" ? { role: session.role, residentId: session.residentId } : { role: session.role };
}

function requireRole(session, role) {
  if (!session) throw httpError(401, "Sesi berakhir. Silakan masuk kembali.");
  if (session.role !== role) throw httpError(403, "Anda tidak memiliki izin untuk tindakan ini.");
}

async function makePassword(password) {
  if (typeof password !== "string" || password.length < 8 || password.length > 200) {
    throw httpError(400, "Password harus berisi 8 sampai 200 karakter.");
  }
  const salt = crypto.randomBytes(16);
  const derived = await scrypt(password, salt, passwordLength);
  return { passwordSalt: salt.toString("hex"), passwordHash: derived.toString("hex") };
}

async function matchesPassword(password, account) {
  if (typeof password !== "string" || !account?.passwordSalt || !account?.passwordHash) return false;
  const derived = await scrypt(password, Buffer.from(account.passwordSalt, "hex"), passwordLength);
  const expected = Buffer.from(account.passwordHash, "hex");
  return expected.length === derived.length && crypto.timingSafeEqual(expected, derived);
}

function newSession(response, session) {
  const token = crypto.randomBytes(32).toString("base64url");
  sessions.set(token, { ...session, expiresAt: Date.now() + sessionLifetime });
  const secure = process.env.COOKIE_SECURE === "1" ? "; Secure" : "";
  response.setHeader("Set-Cookie", `ruangkos_session=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${sessionLifetime / 1000}${secure}`);
}

setInterval(() => {
  for (const [token, session] of sessions) {
    if (session.expiresAt <= Date.now()) sessions.delete(token);
  }
}, 15 * 60 * 1000).unref();

function normalizedInitialData(input) {
  const initial = input && typeof input === "object" ? input : {};
  const fallback = seedData();
  const result = {};
  for (const key of ["rooms", "residents", "payments", "expenses", "bills", "maintenanceReports"]) {
    result[key] = Array.isArray(initial[key]) ? initial[key] : fallback[key];
  }
  result.residents = result.residents.map(({ loginId, password, passwordHash, passwordSalt, ...resident }) => resident);
  result.payments = result.payments.map(({ billId, ...payment }) => payment);
  result.bills = [];
  result.maintenanceReports = [];
  return result;
}

async function updateOwnerState(input) {
  if (!input || !["rooms", "residents", "payments", "expenses", "bills", "maintenanceReports"].every((key) => Array.isArray(input[key]))) {
    throw httpError(400, "Data kos tidak lengkap.");
  }
  const previousResidents = new Map(store.residents.map((resident) => [resident.id, resident]));
  const residentIds = new Set();
  const logins = new Set([normalizedLogin(store.owner.loginId)]);
  const residents = [];

  for (const source of input.residents) {
    if (!source || typeof source.id !== "string" || residentIds.has(source.id)) throw httpError(400, "Data penghuni tidak valid.");
    residentIds.add(source.id);
    const loginId = String(source.loginId || "").trim();
    const previous = previousResidents.get(source.id);
    const password = source.password;
    let credentials = previous ? { passwordSalt: previous.passwordSalt, passwordHash: previous.passwordHash } : {};
    if (password) credentials = await makePassword(password);
    if (loginId) {
      if (!/^\d{8}$/.test(loginId)) throw httpError(400, "ID login penghuni harus tepat 8 digit angka.");
      const normalized = normalizedLogin(loginId);
      if (logins.has(normalized)) throw httpError(409, "ID login harus unik dan berbeda dari akun owner.");
      if (!credentials.passwordHash) throw httpError(400, `Akun ${loginId} belum memiliki password.`);
      logins.add(normalized);
    } else if (password) {
      throw httpError(400, "ID login wajib diisi untuk membuat akun penghuni.");
    }
    const { password: ignoredPassword, passwordHash: ignoredHash, passwordSalt: ignoredSalt, ...resident } = source;
    residents.push({ ...resident, loginId, ...credentials });
  }

  const roomIds = new Set(input.rooms.map((room) => room.id));
  if (residents.some((resident) => resident.roomId && !roomIds.has(resident.roomId))) {
    throw httpError(400, "Kamar penghuni tidak ditemukan.");
  }
  if (input.bills.some((bill) => !residentIds.has(bill.residentId))) throw httpError(400, "Penghuni pada tagihan tidak ditemukan.");
  if (input.maintenanceReports.some((report) => !residentIds.has(report.residentId))) throw httpError(400, "Penghuni pada laporan gangguan tidak ditemukan.");

  store = {
    ...store,
    rooms: input.rooms,
    residents,
    payments: input.payments,
    expenses: input.expenses,
    bills: input.bills,
    maintenanceReports: input.maintenanceReports
  };
  await persistStore();
}

async function handleApi(request, response, pathname) {
  if (request.method === "GET" && pathname === "/api/session") {
    const session = requestSession(request);
    return sendJson(response, 200, {
      authenticated: Boolean(session),
      ownerExists: Boolean(store.owner),
      user: publicSession(session)
    });
  }

  if (request.method === "POST" && pathname === "/api/setup") {
    if (store.owner) throw httpError(409, "Akun owner sudah dibuat. Silakan masuk.");
    const input = await readJson(request);
    const loginId = String(input.loginId || "").trim();
    if (!/^\d{8}$/.test(loginId)) throw httpError(400, "ID login owner harus tepat 8 digit angka.");
    const credentials = await makePassword(input.password);
    const initialData = normalizedInitialData(input.initialData);
    store = {
      ...initialData,
      owner: {
        name: String(input.ownerName || "").trim().slice(0, 60),
        propertyName: String(input.propertyName || "").trim().slice(0, 60),
        loginId,
        ...credentials
      }
    };
    if (!store.owner.name || !store.owner.propertyName) throw httpError(400, "Nama kos dan owner harus diisi.");
    await persistStore();
    const session = { role: "owner" };
    newSession(response, session);
    return sendJson(response, 201, { user: session });
  }

  if (request.method === "POST" && pathname === "/api/login") {
    const input = await readJson(request);
    const loginId = normalizedLogin(input.loginId);
    if (!/^\d{8}$/.test(loginId)) throw httpError(400, "ID login harus tepat 8 digit angka.");
    let user;
    if (input.role === "owner") {
      if (normalizedLogin(store.owner?.loginId) === loginId && await matchesPassword(input.password, store.owner)) user = { role: "owner" };
    } else if (input.role === "resident") {
      const resident = store.residents.find((item) => item.loginId && normalizedLogin(item.loginId) === loginId);
      if (resident && await matchesPassword(input.password, resident)) user = { role: "resident", residentId: resident.id };
    }
    if (!user) throw httpError(401, "ID login atau password tidak cocok.");
    newSession(response, user);
    return sendJson(response, 200, { user: publicSession(user) });
  }

  if (request.method === "POST" && pathname === "/api/logout") {
    const cookie = request.headers.cookie || "";
    const token = cookie.split(";").map((part) => part.trim()).find((part) => part.startsWith("ruangkos_session="))?.slice("ruangkos_session=".length);
    if (token) sessions.delete(token);
    response.setHeader("Set-Cookie", "ruangkos_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0");
    response.writeHead(204);
    return response.end();
  }

  const session = requestSession(request);
  if (request.method === "GET" && pathname === "/api/state") {
    if (!session) throw httpError(401, "Sesi berakhir. Silakan masuk kembali.");
    return sendJson(response, 200, { data: publicState(session) });
  }

  if (request.method === "PUT" && pathname === "/api/state") {
    requireRole(session, "owner");
    await updateOwnerState(await readJson(request));
    return sendJson(response, 200, { data: publicState(session) });
  }

  if (request.method === "PUT" && pathname === "/api/profile") {
    requireRole(session, "resident");
    const resident = store.residents.find((item) => item.id === session.residentId);
    if (!resident) throw httpError(401, "Akun penghuni sudah tidak aktif.");
    const input = await readJson(request);
    if (Object.keys(input).some((key) => key !== "profilePhoto")) throw httpError(400, "Profil hanya dapat mengubah foto.");
    resident.profilePhoto = validateProfilePhoto(input.profilePhoto);
    await persistStore();
    return sendJson(response, 200, { data: publicState(session) });
  }

  if (request.method === "POST" && pathname === "/api/profile/password") {
    requireRole(session, "resident");
    const resident = store.residents.find((item) => item.id === session.residentId);
    if (!resident) throw httpError(401, "Akun penghuni sudah tidak aktif.");
    const input = await readJson(request);
    if (!await matchesPassword(input.currentPassword, resident)) throw httpError(400, "Password saat ini tidak sesuai.");
    const credentials = await makePassword(input.newPassword);
    resident.passwordSalt = credentials.passwordSalt;
    resident.passwordHash = credentials.passwordHash;
    await persistStore();
    return sendJson(response, 200, { message: "Password berhasil diperbarui." });
  }

  if (request.method === "POST" && pathname === "/api/maintenance-reports") {
    requireRole(session, "resident");
    const input = await readJson(request);
    const allowedCategories = ["Listrik", "Air", "Wi-Fi", "Kebersihan", "Keamanan", "Fasilitas kamar", "Lainnya"];
    const allowedUrgencies = ["Rendah", "Normal", "Mendesak"];
    const title = String(input.title || "").trim();
    const description = String(input.description || "").trim();
    if (!allowedCategories.includes(input.category)) throw httpError(400, "Pilih kategori gangguan yang tersedia.");
    if (!title || title.length > 100) throw httpError(400, "Judul laporan harus diisi (maksimal 100 karakter).");
    if (description.length < 10 || description.length > 2000) throw httpError(400, "Jelaskan gangguan dalam 10–2000 karakter.");
    if (!allowedUrgencies.includes(input.urgency)) throw httpError(400, "Pilih tingkat prioritas yang tersedia.");
    const report = {
      id: `report-${crypto.randomUUID()}`,
      residentId: session.residentId,
      roomId: store.residents.find((item) => item.id === session.residentId)?.roomId || null,
      category: input.category,
      title,
      description,
      urgency: input.urgency,
      status: "Baru",
      ownerNote: "",
      createdAt: new Date().toISOString()
    };
    store.maintenanceReports.unshift(report);
    await persistStore();
    return sendJson(response, 201, { data: publicState(session) });
  }

  const maintenanceRoute = pathname.match(/^\/api\/maintenance-reports\/([^/]+)$/);
  if (request.method === "PATCH" && maintenanceRoute) {
    requireRole(session, "owner");
    const report = store.maintenanceReports.find((item) => item.id === decodeURIComponent(maintenanceRoute[1]));
    if (!report) throw httpError(404, "Laporan gangguan tidak ditemukan.");
    const input = await readJson(request);
    if (!["Baru", "Dalam penanganan", "Terjadwal", "Selesai", "Ditolak"].includes(input.status)) {
      throw httpError(400, "Status laporan tidak valid.");
    }
    report.status = input.status;
    report.ownerNote = String(input.ownerNote || "").trim().slice(0, 500);
    report.updatedAt = new Date().toISOString();
    await persistStore();
    return sendJson(response, 200, { data: publicState(session) });
  }

  const billRoute = pathname.match(/^\/api\/bills\/([^/]+)\/(pay|confirm)$/);
  if (request.method === "POST" && billRoute) {
    const billId = decodeURIComponent(billRoute[1]);
    const action = billRoute[2];
    const bill = store.bills.find((item) => item.id === billId);
    if (!bill) throw httpError(404, "Tagihan tidak ditemukan.");
    if (action === "pay") {
      requireRole(session, "resident");
      if (session.residentId !== bill.residentId) throw httpError(403, "Tagihan ini bukan milik akun Anda.");
      if (bill.status === "Lunas" || bill.status === "Menunggu konfirmasi") throw httpError(409, "Tagihan ini sudah diperbarui.");
      const input = await readJson(request);
      bill.status = "Menunggu konfirmasi";
      bill.paymentMethod = String(input.method || "Transfer bank");
      bill.paymentNote = String(input.note || "").slice(0, 500);
      bill.requestedAt = currentDate();
    } else {
      requireRole(session, "owner");
      if (bill.status !== "Menunggu konfirmasi") throw httpError(409, "Tagihan belum menunggu konfirmasi.");
      bill.status = "Lunas";
      bill.paidAt = currentDate();
      const existingPayment = store.payments.find((payment) => payment.billId === bill.id);
      if (existingPayment) {
        existingPayment.status = "Lunas";
        existingPayment.date = currentDate();
        existingPayment.method = bill.paymentMethod || existingPayment.method;
        existingPayment.amount = Number(bill.amount);
      } else {
        store.payments.push({
          id: `payment-${crypto.randomUUID()}`,
          billId: bill.id,
          residentId: bill.residentId,
          amount: Number(bill.amount),
          month: bill.month,
          date: currentDate(),
          method: bill.paymentMethod || "Transfer bank",
          status: "Lunas"
        });
      }
    }
    await persistStore();
    return sendJson(response, 200, { data: publicState(session) });
  }

  throw httpError(404, "Rute API tidak ditemukan.");
}

async function handleRequest(request, response) {
  try {
    const url = new URL(request.url, `http://${request.headers.host || "localhost"}`);
    const pathname = decodeURIComponent(url.pathname);
    if (pathname.startsWith("/api/")) return await handleApi(request, response, pathname);
    if (request.method !== "GET" && request.method !== "HEAD") throw httpError(405, "Metode tidak diizinkan.");
    const requestedPath = pathname === "/" ? "index.html" : pathname.replace(/^\/+/, "");
    const filePath = path.resolve(root, requestedPath);
    const relativePath = path.relative(root, filePath);
    if (relativePath.startsWith("..") || path.isAbsolute(relativePath) || relativePath.split(path.sep)[0] === "data") {
      throw httpError(404, "Not found");
    }
    const content = await fs.promises.readFile(filePath);
    response.writeHead(200, {
      "Content-Type": contentTypes[path.extname(filePath)] || "application/octet-stream",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "same-origin"
    });
    response.end(request.method === "HEAD" ? undefined : content);
  } catch (error) {
    const status = error.status || (error.code === "ENOENT" ? 404 : 500);
    if (status >= 500) console.error("Permintaan RuangKos gagal:", error.message);
    if (response.headersSent) return response.end();
    sendJson(response, status, { error: status === 500 ? "Terjadi kesalahan server." : error.message });
  }
}

loadStore().then(() => {
  http.createServer(handleRequest).listen(port, host, () => {
    console.log(`RuangKos berjalan di http://${host}:${port}`);
    console.log("Gunakan HTTPS melalui reverse proxy saat aplikasi diakses di luar jaringan lokal.");
  });
}).catch((error) => {
  console.error("Data RuangKos gagal dimuat:", error.message);
  process.exitCode = 1;
});
