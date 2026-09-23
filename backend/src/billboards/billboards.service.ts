// backend/src/billboards/billboards.service.ts
import { Injectable, InternalServerErrorException, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateBillboardDto } from './dto/create-billboard.dto';
import { UpdateBillboardDto } from './dto/update-billboard.dto';
import { QuickUpdateBillboardDto } from './dto/quick-update-billboard.dto';
import { assertAdmin } from '../common/admin-check.helper';

@Injectable()
export class BillboardsService {
  constructor(private prisma: PrismaService) {}

  async create(createBillboardDto: CreateBillboardDto, userId: string) {
    const {
      sizeH,
      sizeW,
      orientation,
      sides,
      lighting,
      material,
      adminOptions,
      gallery,
      ...rest
    } = createBillboardDto;

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
          ...rest,
          price: Number(rest.price),
          lat: Number(rest.lat) || -7.9,
          lng: Number(rest.lng) || 112.6,
          slug: rest.slug || `billboard-${Date.now()}`,
          sku: rest.sku || 'NO-SKU',
          address: rest.address || 'Alamat belum diisi',
          type: rest.type || 'Baliho',
          status: rest.status || 'Available',
          publishStatus: rest.publishStatus || 'DRAFT',
          mainImage: rest.mainImage || '',
          specs: packedSpecs,
          includes: JSON.stringify(includesList),
          excludes: JSON.stringify(excludesList),
          gallery: galleryJson,
          createdById: userId,
          updatedById: userId,
        },
      });
      return { message: 'Billboard Berhasil Dibuat', id: newBillboard.id };
    } catch (error) {
      console.error('Create Error:', error);
      throw new InternalServerErrorException('Gagal menyimpan data');
    }
  }

  async update(id: string, updateBillboardDto: UpdateBillboardDto, userId: string) {
    const {
      sizeH,
      sizeW,
      orientation,
      sides,
      lighting,
      material,
      adminOptions,
      gallery,
      ...rest
    } = updateBillboardDto;

    if (rest.slug) {
      const existingSlug = await this.prisma.billboard.findFirst({
        where: {
          slug: rest.slug,
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
    // The original code calculated `excludesList` but didn't use it in `update`.
    // For consistency with `create`, if `excludes` is needed in the update, it should be passed.
    // For now, mirroring original `update` logic, it's not explicitly used in the `update` data object.
    const galleryJson = JSON.stringify(gallery || []);

    try {
      await this.prisma.$transaction([
        this.prisma.billboardHistory.create({
          data: {
            billboardId: id,
            title: oldData.title,
            price: oldData.price,
            status: oldData.status,
            changedById: userId,
            snapshot: JSON.stringify({ ...oldData }),
          },
        }),
        this.prisma.billboard.update({
          where: { id: id },
          data: {
            ...rest,
            price: Number(rest.price),
            lat: Number(rest.lat),
            lng: Number(rest.lng),
            specs: packedSpecs,
            includes: JSON.stringify(includesList),
            gallery: galleryJson,
            updatedById: userId,
          },
        }),
      ]);
      return { message: 'Update Sukses!' };
    } catch (error) {
      console.error(error);
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
    return this.prisma.billboard.findMany(); // Hapus filter publishStatus
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

  async updateStatus(id: string, data: { status?: string; publishStatus?: string; adminEmail?: string }) {
    // TODO: ganti ke role guard JWT proper setelah keputusan arsitektur auth final.
    await assertAdmin(this.prisma, data.adminEmail);

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

  async quickUpdate(id: string, quickUpdateBillboardDto: QuickUpdateBillboardDto, userId: string) {
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
          updatedById: userId,
        },
      });
      return { message: 'Status berhasil diupdate!' };
    } catch (error) {
      throw new InternalServerErrorException('Gagal mengupdate status');
    }
  }

  async remove(id: string, adminEmail?: string) {
    // TODO: ganti ke role guard JWT proper setelah keputusan arsitektur auth final.
    await assertAdmin(this.prisma, adminEmail);

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

  async rollback(historyId: string, userId: string) {
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
          updatedById: userId,
        },
      });
      return { message: 'Rollback Berhasil' };
    } catch (e) {
      throw new InternalServerErrorException('Gagal Rollback');
    }
  }
}

