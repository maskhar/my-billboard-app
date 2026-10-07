// backend/src/billboards/billboards.service.ts
import { Injectable, InternalServerErrorException, BadRequestException, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateBillboardDto } from './dto/create-billboard.dto';
import { UpdateBillboardDto } from './dto/update-billboard.dto';
import { QuickUpdateBillboardDto } from './dto/quick-update-billboard.dto';

// Dipakai `create()` saat koordinat tidak dikirim sama sekali. `update()` tidak
// memakai konstanta ini: ia jatuh ke nilai yang sudah tersimpan di DB supaya
// edit tanpa koordinat tidak memindahkan billboard.
const DEFAULT_LAT = -7.9;
const DEFAULT_LNG = 112.6;

@Injectable()
export class BillboardsService {
  constructor(private prisma: PrismaService) {}

  /**
   * Terjemahkan Prisma P2002 (unique constraint) jadi 409 yang menyebut field
   * mana yang bentrok. Tanpa ini, collision `sku`/`slug` muncul sebagai 500
   * "Gagal menyimpan data" yang tidak menjelaskan apa pun masalahnya.
   *
   * `meta.target` Prisma untuk PostgreSQL biasanya berisi nama kolom
   * (mis. ['sku']), tapi bisa juga nama index ('Billboard_sku_key'), jadi
   * keduanya ditangani.
   */
  private toConflict(error: unknown): ConflictException | null {
    const e = error as { code?: string; meta?: { target?: unknown } } | null;
    if (!e || e.code !== 'P2002') return null;

    const target = e.meta?.target;
    const raw = Array.isArray(target)
      ? target.map(String)
      : typeof target === 'string'
        ? [target]
        : [];

    const lower = raw.join(' ').toLowerCase();
    const field = lower.includes('sku') ? 'sku' : lower.includes('slug') ? 'slug' : null;

    const message =
      field === 'sku'
        ? 'SKU sudah dipakai billboard lain. Gunakan kode SKU yang unik.'
        : field === 'slug'
          ? 'Link URL (Slug) sudah dipakai billboard lain!'
          : `Data sudah dipakai billboard lain (${raw.join(', ') || 'nilai unik'}).`;

    return new ConflictException(message);
  }

  /**
   * Normalisasi koordinat menjadi number yang layak disimpan ke kolom `Float`.
   *
   * `Number(x) || fallback` itu SALAH, karena `0` termasuk falsy: koordinat
   * 0 (Greenwich / Khatulistiwa) akan diam-diam diganti jadi default.
   * `null`, `undefined`, string kosong, dan hasil `Number()` yang bukan
   * finite (NaN) memang perlu di-fallback-kan.
   */
  private toCoordinate(value: unknown, fallback: number): number {
    if (value === null || value === undefined) return fallback;
    if (typeof value === 'string' && value.trim() === '') return fallback;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }

  // otorisasi admin ditangani RolesGuard lewat @Roles(...ADMIN_ROLES) di
  // controller. Field `adminEmail` masih ada di DTO demi kompatibilitas dengan
  // frontend lama, tapi isinya TIDAK lagi dipakai validasi apa pun.
  async create(createBillboardDto: CreateBillboardDto, actorId: string) {
    const {
      sizeH,
      sizeW,
      orientation,
      sides,
      lighting,
      material,
      adminOptions,
      gallery,
    } = createBillboardDto;

    // Whitelist: HANYA kolom yang benar-benar ada di model Billboard (prisma/schema.prisma).
    // Jangan pakai spread ...rest — field asing (desc, adminEmail, createdBy, updatedBy, history)
    // akan membuat Prisma error "Unknown argument".
    const {
      slug,
      title,
      sku,
      address,
      type,
      price,
      lat,
      lng,
      status,
      publishStatus,
      mainImage,
      videoUrl,
      smartsucoUrl,
    } = createBillboardDto;

    // Sama persis seperti update(): slug wajib unik, dicek lebih dulu supaya
    // ketahuan sebagai 400 yang jelas, bukan 500 dari Prisma.
    if (slug) {
      const existingSlug = await this.prisma.billboard.findFirst({
        where: {
          slug: slug,
        },
      });
      if (existingSlug) {
        throw new BadRequestException('Link URL (Slug) sudah dipakai billboard lain!');
      }
    }

    const packedSpecs = JSON.stringify([
      { label: 'Ukuran', value: `${sizeH || 0}m x ${sizeW || 0}m` },
      { label: 'Luas Area', value: `${(Number(sizeH) * Number(sizeW)).toFixed(1)} m²` },
      { label: 'Layout / Orientasi', value: orientation || '-' },
      { label: 'Tampilan', value: sides ? `${sides} Sisi` : '-' },
      { label: 'Jenis Penerangan', value: lighting || '-' },
      { label: 'Material', value: material || '-' },
    ]);

    const options = Array.isArray(adminOptions) ? adminOptions : [];
    const includesList = options.filter((opt) => opt.included).map((opt) => opt.name);
    const excludesList = options.filter((opt) => !opt.included).map((opt) => opt.name);

    const galleryJson = JSON.stringify(gallery || []);

    try {
      const newBillboard = await this.prisma.billboard.create({
        data: {
          slug: slug || `billboard-${Date.now()}`,
          title,
          // `sku` kosong disimpan sebagai NULL, bukan string placeholder seperti
          // 'NO-SKU'. Kolomnya unik; di PostgreSQL beberapa NULL tidak dianggap
          // bentrok, sedangkan string placeholder hanya bisa dipakai satu kali.
          sku: sku || null,
          address: address || 'Alamat belum diisi',
          type: type || 'Baliho',
          price: Number(price),
          lat: this.toCoordinate(lat, DEFAULT_LAT),
          lng: this.toCoordinate(lng, DEFAULT_LNG),
          status: status || 'Available',
          publishStatus: publishStatus || 'DRAFT',
          mainImage: mainImage || '',
          videoUrl: videoUrl ?? null,
          smartsucoUrl: smartsucoUrl ?? null,
          specs: packedSpecs,
          includes: JSON.stringify(includesList),
          excludes: JSON.stringify(excludesList),
          gallery: galleryJson,
          createdById: actorId,
          updatedById: actorId,
        },
      });
      return { message: 'Billboard Berhasil Dibuat', id: newBillboard.id };
    } catch (error) {
      console.error('Create Error:', error);
      const conflict = this.toConflict(error);
      if (conflict) throw conflict;
      throw new InternalServerErrorException('Gagal menyimpan data');
    }
  }

  async update(id: string, updateBillboardDto: UpdateBillboardDto, actorId: string) {
    const {
      sizeH,
      sizeW,
      orientation,
      sides,
      lighting,
      material,
      adminOptions,
      gallery,
    } = updateBillboardDto;

    // Whitelist: HANYA kolom yang benar-benar ada di model Billboard (prisma/schema.prisma).
    // Jangan pakai spread ...rest — field asing (desc, adminEmail, createdBy, updatedBy, history)
    // yang ikut di-spread dari response GET akan membuat Prisma error.
    const {
      slug,
      title,
      sku,
      address,
      type,
      price,
      lat,
      lng,
      status,
      publishStatus,
      mainImage,
      videoUrl,
      smartsucoUrl,
    } = updateBillboardDto;

    if (slug) {
      const existingSlug = await this.prisma.billboard.findFirst({
        where: {
          slug: slug,
          NOT: { id: id },
        },
      });
      if (existingSlug) {
        throw new BadRequestException('Link URL (Slug) sudah dipakai billboard lain!');
      }
    }

    const oldData = await this.prisma.billboard.findUnique({ where: { id: id } });
    if (!oldData) {
      throw new NotFoundException('Data hilang');
    }

    const packedSpecs = JSON.stringify([
        { label: 'Ukuran', value: `${sizeH || 0}m x ${sizeW || 0}m` },
        { label: 'Luas Area', value: `${(Number(sizeH) * Number(sizeW)).toFixed(1)} m²` },
        { label: 'Layout / Orientasi', value: orientation || '-' },
        { label: 'Tampilan', value: sides ? `${sides} Sisi` : '-' },
        { label: 'Jenis Penerangan', value: lighting || '-' },
        { label: 'Material', value: material || '-' },
    ]);

    const options = Array.isArray(adminOptions) ? adminOptions : [];
    const includesList = options.filter((opt) => opt.included).map((opt) => opt.name);
    const excludesList = options.filter((opt) => !opt.included).map((opt) => opt.name);
    const galleryJson = JSON.stringify(gallery || []);

    try {
      await this.prisma.$transaction([
        this.prisma.billboardHistory.create({
          data: {
            billboardId: id,
            title: oldData.title,
            price: oldData.price,
            status: oldData.status,
            changedById: actorId,
            snapshot: JSON.stringify({ ...oldData }),
          },
        }),
        this.prisma.billboard.update({
          where: { id: id },
          data: {
            slug,
            title,
            // Form admin tidak punya input SKU, jadi `sku` selalu terkirim
            // kosong dan akan menimpa SKU asli menjadi ''. kirim `undefined`
            // supaya Prisma tidak menyentuh kolom itu sama sekali.
            sku: sku || undefined,
            address,
            type,
            price: Number(price),
            lat: this.toCoordinate(lat, oldData.lat),
            lng: this.toCoordinate(lng, oldData.lng),
            status,
            publishStatus,
            mainImage,
            videoUrl: videoUrl ?? null,
            smartsucoUrl: smartsucoUrl ?? null,
            specs: packedSpecs,
            includes: JSON.stringify(includesList),
            excludes: JSON.stringify(excludesList),
            gallery: galleryJson,
            updatedById: actorId,
          },
        }),
      ]);
      return { message: 'Update Sukses!' };
    } catch (error) {
      console.error(error);
      const conflict = this.toConflict(error);
      if (conflict) throw conflict;
      throw new InternalServerErrorException('Gagal Update');
    }
  }

  async findAllForAdmin() {
    return this.prisma.billboard.findMany({
      orderBy: {
        updatedAt: 'desc',
      },
      include: {
        createdBy: { select: { name: true, email: true } },
        updatedBy: { select: { name: true, email: true } },
      },
    });
  }

  findAll() {
    // Endpoint PUBLIK (GET /api/billboards, @Public di controller): hanya
    // billboard berstatus PUBLISHED. Data DRAFT tetap bisa dilihat lewat
    // GET /api/billboards/admin yang memakai @Roles(...ADMIN_ROLES), jadi
    // akses admin ke data draft di halaman admin tidak berkurang.
    return this.prisma.billboard.findMany({
      where: { publishStatus: 'PUBLISHED' },
    });
  }

  findOneBySlug(slug: string) {
    return this.prisma.billboard.findFirst({
      where: {
        slug: slug,
        publishStatus: 'PUBLISHED',
      },
      include: {
        bookings: {
          where: { status: { in: ['ACTIVE', 'PENDING_PAYMENT', 'PAID_CONFIRMED'] } },
          select: { startDate: true, endDate: true },
        },
      },
    });
  }

  async updateStatus(id: string, data: { status?: string; publishStatus?: string }) {
    const billboard = await this.prisma.billboard.findUnique({ where: { id } });
    if (!billboard) {
      throw new NotFoundException('Billboard not found');
    }
    const dataToUpdate: { status?: string; publishStatus?: string } = {};
    if (data.status) dataToUpdate.status = data.status;
    if (data.publishStatus) dataToUpdate.publishStatus = data.publishStatus;

    if (Object.keys(dataToUpdate).length === 0) {
      throw new BadRequestException('Tidak ada status untuk diupdate');
    }

    // Cek apakah ada order aktif jika ingin mengubah status ketersediaan
    if (data.status && data.status !== billboard.status) {
    const hasActiveOrder = await this.prisma.booking.findFirst({
      where: {
        billboardId: id,
          status: { in: ['ACTIVE', 'PENDING_PAYMENT', 'PAID_CONFIRMED'] },
      },
    });
    if (hasActiveOrder) {
        throw new BadRequestException('Tidak bisa mengubah status ketersediaan karena ada booking aktif.');
    }
    }

    return this.prisma.billboard.update({
      where: { id },
      data: dataToUpdate,
      });
    }

  async quickUpdate(id: string, quickUpdateBillboardDto: QuickUpdateBillboardDto, actorId: string) {
    const { status, publishStatus } = quickUpdateBillboardDto;

    const dataToUpdate: { status?: string; publishStatus?: string } = {};
    if (status) dataToUpdate.status = status;
    if (publishStatus) dataToUpdate.publishStatus = publishStatus;

    if (Object.keys(dataToUpdate).length === 0) {
      throw new BadRequestException('Tidak ada data untuk diupdate');
    }

    try {
      await this.prisma.billboard.update({
        where: { id: id },
        data: {
          ...dataToUpdate,
          updatedById: actorId,
        },
      });
      return { message: 'Status berhasil diupdate!' };
    } catch (error) {
      throw new InternalServerErrorException('Gagal mengupdate status');
    }
  }

  async remove(id: string) {
    const hasActiveOrder = await this.prisma.booking.findFirst({
      where: {
        billboardId: id,
        status: { in: ['ACTIVE', 'PENDING_PAYMENT'] },
      },
    });

    if (hasActiveOrder) {
      throw new BadRequestException('Gagal: Billboard ini sedang disewa!');
    }

    try {
      await this.prisma.billboard.delete({
        where: { id: id },
      });
      return { message: 'Billboard Berhasil Dihapus' };
    } catch (error) {
      throw new InternalServerErrorException('Gagal menghapus data');
    }
  }

  async findOne(id: string) { // Tambah async
    const billboard = await this.prisma.billboard.findUnique({
      where: { id: id },
      include: {
        history: {
          orderBy: { archivedAt: 'desc' },
          take: 10,
          include: { changedBy: { select: { id: true, name: true, email: true } } }, // Detail user di history
        },
        createdBy: { select: { id: true, name: true, email: true } }, // Include createdBy
        updatedBy: { select: { id: true, name: true, email: true } }, // Include updatedBy
      },
    });

    if (!billboard) {
      return null;
    }

    // Parsing JSON string kembali ke objek/array
    const parsedBillboard = {
      ...billboard,
      specs: JSON.parse(billboard.specs),
      includes: JSON.parse(billboard.includes),
      // Only parse excludes if it's not null/undefined to prevent error on empty field
      excludes: billboard.excludes ? JSON.parse(billboard.excludes) : [],
      gallery: JSON.parse(billboard.gallery),
    };

    // Parsing snapshot riwayat juga
    const parsedHistory = parsedBillboard.history.map(h => ({
      ...h,
      snapshot: JSON.parse(h.snapshot)
    }));
    parsedBillboard.history = parsedHistory;

    return parsedBillboard;
  }

  async rollback(historyId: string, actorId: string) {
    const history = await this.prisma.billboardHistory.findUnique({
      where: { id: historyId },
    });

    if (!history) {
      throw new NotFoundException('History not found');
    }

    const details = JSON.parse(history.snapshot);

    try {
      await this.prisma.billboard.update({
        where: { id: history.billboardId },
        data: {
          title: history.title,
          price: history.price,
          status: history.status,
          address: details.address,
          sku: details.sku,
          type: details.type,
          mainImage: details.mainImage,
          lat: details.lat,
          lng: details.lng,
          slug: details.slug,
          updatedById: actorId,
        },
      });
      return { message: 'Rollback Berhasil' };
    } catch (e) {
      throw new InternalServerErrorException('Gagal Rollback');
    }
  }
}

