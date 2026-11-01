const fs = require("node:fs/promises");
const path = require("node:path");
const { Pool } = require("pg");

async function main() {
  if (!process.argv.includes("--replace")) {
    throw new Error("Perintah ini mengganti data di database tujuan. Jalankan ulang dengan --replace setelah memastikan database tujuan benar.");
  }
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL Neon belum diatur.");

  const storePath = path.join(__dirname, "..", "data", "ruangkos-store.json");
  const store = JSON.parse(await fs.readFile(storePath, "utf8"));
  if (!store.owner?.passwordHash || !Array.isArray(store.rooms) || !Array.isArray(store.residents)) {
    throw new Error("Data RuangKos lokal tidak lengkap atau belum memiliki akun owner.");
  }

  const database = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    await database.query("CREATE TABLE IF NOT EXISTS ruangkos_store (id boolean PRIMARY KEY DEFAULT true CHECK (id), payload jsonb NOT NULL)");
    await database.query(
      "INSERT INTO ruangkos_store (id, payload) VALUES (true, $1::jsonb) ON CONFLICT (id) DO UPDATE SET payload = EXCLUDED.payload",
      [JSON.stringify(store)]
    );
    console.log("Data RuangKos lokal berhasil disalin ke database tujuan.");
  } finally {
    await database.end();
  }
}

main().catch((error) => {
  console.error("Migrasi data gagal:", error.message);
  process.exitCode = 1;
});
