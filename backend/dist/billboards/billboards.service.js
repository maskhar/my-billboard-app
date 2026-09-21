"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __rest = (this && this.__rest) || function (s, e) {
    var t = {};
    for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p) && e.indexOf(p) < 0)
        t[p] = s[p];
    if (s != null && typeof Object.getOwnPropertySymbols === "function")
        for (var i = 0, p = Object.getOwnPropertySymbols(s); i < p.length; i++) {
            if (e.indexOf(p[i]) < 0 && Object.prototype.propertyIsEnumerable.call(s, p[i]))
                t[p[i]] = s[p[i]];
        }
    return t;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.BillboardsService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../prisma/prisma.service");
let BillboardsService = class BillboardsService {
    constructor(prisma) {
        this.prisma = prisma;
    }
    async create(createBillboardDto, userId) {
        const { sizeH, sizeW, orientation, sides, lighting, material, adminOptions, gallery } = createBillboardDto, rest = __rest(createBillboardDto, ["sizeH", "sizeW", "orientation", "sides", "lighting", "material", "adminOptions", "gallery"]);
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
                data: Object.assign(Object.assign({}, rest), { price: Number(rest.price), lat: Number(rest.lat) || -7.9, lng: Number(rest.lng) || 112.6, slug: rest.slug || `billboard-${Date.now()}`, sku: rest.sku || 'NO-SKU', address: rest.address || 'Alamat belum diisi', type: rest.type || 'Baliho', status: rest.status || 'Available', publishStatus: rest.publishStatus || 'DRAFT', mainImage: rest.mainImage || '', specs: packedSpecs, includes: JSON.stringify(includesList), excludes: JSON.stringify(excludesList), gallery: galleryJson, createdById: userId, updatedById: userId }),
            });
            return { message: 'Billboard Berhasil Dibuat', id: newBillboard.id };
        }
        catch (error) {
            console.error('Create Error:', error);
            throw new common_1.InternalServerErrorException('Gagal menyimpan data');
        }
    }
    async update(id, updateBillboardDto, userId) {
        const { sizeH, sizeW, orientation, sides, lighting, material, adminOptions, gallery } = updateBillboardDto, rest = __rest(updateBillboardDto, ["sizeH", "sizeW", "orientation", "sides", "lighting", "material", "adminOptions", "gallery"]);
        if (rest.slug) {
            const existingSlug = await this.prisma.billboard.findFirst({
                where: {
                    slug: rest.slug,
                    NOT: { id: id },
                },
            });
            if (existingSlug) {
                throw new common_1.BadRequestException('Link URL (Slug) sudah dipakai billboard lain!');
            }
        }
        const oldData = await this.prisma.billboard.findUnique({ where: { id: id } });
        if (!oldData) {
            throw new common_1.NotFoundException('Data hilang');
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
                        snapshot: JSON.stringify(Object.assign({}, oldData)),
                    },
                }),
                this.prisma.billboard.update({
                    where: { id: id },
                    data: Object.assign(Object.assign({}, rest), { price: Number(rest.price), lat: Number(rest.lat), lng: Number(rest.lng), specs: packedSpecs, includes: JSON.stringify(includesList), gallery: galleryJson, updatedById: userId }),
                }),
            ]);
            return { message: 'Update Sukses!' };
        }
        catch (error) {
            console.error(error);
            throw new common_1.InternalServerErrorException('Gagal Update');
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
        return this.prisma.billboard.findMany();
    }
    findOneBySlug(slug) {
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
    async updateStatus(id, data) {
        const billboard = await this.prisma.billboard.findUnique({ where: { id } });
        if (!billboard) {
            throw new common_1.NotFoundException('Billboard not found');
        }
        const dataToUpdate = {};
        if (data.status)
            dataToUpdate.status = data.status;
        if (data.publishStatus)
            dataToUpdate.publishStatus = data.publishStatus;
        if (Object.keys(dataToUpdate).length === 0) {
            throw new common_1.BadRequestException('Tidak ada status untuk diupdate');
        }
        if (data.status && data.status !== billboard.status) {
            const hasActiveOrder = await this.prisma.booking.findFirst({
                where: {
                    billboardId: id,
                    status: { in: ['ACTIVE', 'PENDING_PAYMENT', 'PAID_CONFIRMED'] },
                },
            });
            if (hasActiveOrder) {
                throw new common_1.BadRequestException('Tidak bisa mengubah status ketersediaan karena ada booking aktif.');
            }
        }
        return this.prisma.billboard.update({
            where: { id },
            data: dataToUpdate,
        });
    }
    async quickUpdate(id, quickUpdateBillboardDto, userId) {
        const { status, publishStatus } = quickUpdateBillboardDto;
        const dataToUpdate = {};
        if (status)
            dataToUpdate.status = status;
        if (publishStatus)
            dataToUpdate.publishStatus = publishStatus;
        if (Object.keys(dataToUpdate).length === 0) {
            throw new common_1.BadRequestException('Tidak ada data untuk diupdate');
        }
        try {
            await this.prisma.billboard.update({
                where: { id: id },
                data: Object.assign(Object.assign({}, dataToUpdate), { updatedById: userId }),
            });
            return { message: 'Status berhasil diupdate!' };
        }
        catch (error) {
            throw new common_1.InternalServerErrorException('Gagal mengupdate status');
        }
    }
    async remove(id) {
        const hasActiveOrder = await this.prisma.booking.findFirst({
            where: {
                billboardId: id,
                status: { in: ['ACTIVE', 'PENDING_PAYMENT'] },
            },
        });
        if (hasActiveOrder) {
            throw new common_1.BadRequestException('Gagal: Billboard ini sedang disewa!');
        }
        try {
            await this.prisma.billboard.delete({
                where: { id: id },
            });
            return { message: 'Billboard Berhasil Dihapus' };
        }
        catch (error) {
            throw new common_1.InternalServerErrorException('Gagal menghapus data');
        }
    }
    async findOne(id) {
        const billboard = await this.prisma.billboard.findUnique({
            where: { id: id },
            include: {
                history: {
                    orderBy: { archivedAt: 'desc' },
                    take: 10,
                    include: { changedBy: { select: { id: true, name: true, email: true } } },
                },
                createdBy: { select: { id: true, name: true, email: true } },
                updatedBy: { select: { id: true, name: true, email: true } },
            },
        });
        if (!billboard) {
            return null;
        }
        const parsedBillboard = Object.assign(Object.assign({}, billboard), { specs: JSON.parse(billboard.specs), includes: JSON.parse(billboard.includes), excludes: billboard.excludes ? JSON.parse(billboard.excludes) : [], gallery: JSON.parse(billboard.gallery) });
        const parsedHistory = parsedBillboard.history.map(h => (Object.assign(Object.assign({}, h), { snapshot: JSON.parse(h.snapshot) })));
        parsedBillboard.history = parsedHistory;
        return parsedBillboard;
    }
    async rollback(historyId, userId) {
        const history = await this.prisma.billboardHistory.findUnique({
            where: { id: historyId },
        });
        if (!history) {
            throw new common_1.NotFoundException('History not found');
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
        }
        catch (e) {
            throw new common_1.InternalServerErrorException('Gagal Rollback');
        }
    }
};
exports.BillboardsService = BillboardsService;
exports.BillboardsService = BillboardsService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], BillboardsService);
//# sourceMappingURL=billboards.service.js.map