// prisma/seed.ts
const { PrismaClient } = require("@prisma/client");
const { hash } = require("bcryptjs");

const prisma = new PrismaClient();

async function main() {
  console.log("🌱 Mulai Refresh Data...");

  // 1. HAPUS SEMUA DATA LAMA (URUTAN PENTING BIAR TIDAK ERROR)
  await prisma.booking.deleteMany();
  await prisma.billboardHistory.deleteMany();
  await prisma.billboard.deleteMany();
  await prisma.user.deleteMany();
  console.log("🔥 Data lama berhasil dibersihkan.");

  // 2. BUAT 5 JENIS USER
  const passwordHash = await hash("123456", 10); // Password default untuk semua user

  const superAdmin = await prisma.user.create({
    data: {
      name: "Super Admin",
      email: "bimokharis1810@gmail.com",
      password: passwordHash,
      role: "SUPER_ADMIN",
    },
  });

  await prisma.user.createMany({
    data: [
      {
        name: "Admin User",
        email: "utero@gmail.com",
        password: passwordHash,
        role: "ADMIN",
      },
      {
        name: "Operator User",
        email: "operator@gmail.com",
        password: passwordHash,
        role: "OPERATOR",
      },
      {
        name: "Customer Service",
        email: "cs@gmail.com",
        password: passwordHash,
        role: "CS",
      },
      {
        name: "User",
        email: "user@gmail.com",
        password: passwordHash,
        role: "USER",
      },
    ],
  });
  console.log("👤 5 User berhasil dibuat.");

  // 3. BUAT DATA BILLBOARD DUMMY
  const billboards = [
    {
      title: "BILLBOARD - Jl. Kawi Atas, Gading Kasri, Malang",
      slug: "billboard-kawi-atas-malang",
      sku: "B-MLG-001",
      address: "Jl. Kawi Atas, Gading Kasri, Kec. Klojen, Malang - Kota Malang",
      type: "Baliho",
      price: 30000000,
      lat: -7.9754,
      lng: 112.6156,
      status: "Available",
      publishStatus: "PUBLISHED",
      mainImage:
        "https://images.unsplash.com/photo-1604015248272-d901b07287a2?auto=format&fit=crop&w=1000&q=80",
      specs: JSON.stringify([
        { label: "Ukuran", value: "5m x 10m" },
        { label: "Luas Area", value: "50 m²" },
        { label: "Layout / Orientasi", value: "Horizontal" },
        { label: "Tampilan", value: "1 Sisi" },
        { label: "Jenis Penerangan", value: "Frontlight" },
        { label: "Material", value: "Vinyl" },
      ]),
      includes: JSON.stringify([
        "Sewa Lahan",
        "Biaya Cetak (1x)",
        "Biaya Pasang (1x)",
        "Pajak Reklame",
      ]),
      excludes: JSON.stringify(["PPN 11%"]),
      gallery: JSON.stringify([]),
      createdById: superAdmin.id,
      updatedById: superAdmin.id,
    },
    {
      title: "VIDEOTRON - Madiun (Pasar Pagotan)",
      slug: "videotron-pasar-pagotan-madiun",
      sku: "V-MDN-001",
      address: "Jl. Raya Ponorogo - Madiun (Pasar Pagotan), Madiun",
      type: "Videotron",
      price: 14400000,
      lat: -7.712,
      lng: 111.5312,
      status: "Available",
      publishStatus: "PUBLISHED",
      mainImage:
        "https://images.unsplash.com/photo-1542662565-7e4b66bae529?auto=format&fit=crop&w=1000&q=80",
      specs: JSON.stringify([
        { label: "Ukuran", value: "3m x 4m" },
        { label: "Luas Area", value: "12 m²" },
        { label: "Layout / Orientasi", value: "Vertical" },
        { label: "Tampilan", value: "1 Sisi" },
        { label: "Jenis Penerangan", value: "Videotron / LED" },
        { label: "Material", value: "LED Screen" },
      ]),
      includes: JSON.stringify(["Sewa Lahan", "Pajak Reklame", "Listrik"]),
      excludes: JSON.stringify(["Biaya Produksi Materi Iklan", "PPN 11%"]),
      gallery: JSON.stringify([]),
      createdById: superAdmin.id,
      updatedById: superAdmin.id,
    },
    {
      title: "Billboard Jl. Dr. Wahidin",
      slug: "billboard-jl-dr-wahidin",
      sku: "B-MLG-002",
      address: "Jl. Dr. Wahidin No. 2, Depan SMAN 1, Kabupaten Malang",
      type: "Billboard",
      price: 15000000,
      lat: -7.9666,
      lng: 112.6326,
      status: "Available",
      publishStatus: "DRAFT", // Ini contoh draft
      mainImage:
        "https://images.unsplash.com/photo-1520105072086-65e692263ab4?auto=format&fit=crop&w=1000&q=80",
      specs: JSON.stringify([
        { label: "Ukuran", value: "4m x 8m" },
        { label: "Luas Area", value: "32 m²" },
        { label: "Layout / Orientasi", value: "Horizontal" },
        { label: "Tampilan", value: "2 Sisi" },
        { label: "Jenis Penerangan", value: "Backlight" },
        { label: "Material", value: "Vinyl Backlight" },
      ]),
      includes: JSON.stringify(["Sewa Lahan", "Pajak Reklame"]),
      excludes: JSON.stringify(["Listrik", "PPN 11%"]),
      gallery: JSON.stringify([]),
      createdById: superAdmin.id,
      updatedById: superAdmin.id,
    },
  ];

  for (const item of billboards) {
    await prisma.billboard.create({ data: item });
  }
  console.log(` billboard berhasil dibuat.`);

  console.log("✅ Seeding Selesai. Database Segar Bugar!");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
