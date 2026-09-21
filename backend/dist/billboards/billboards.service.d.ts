import { PrismaService } from '../prisma/prisma.service';
import { CreateBillboardDto } from './dto/create-billboard.dto';
import { UpdateBillboardDto } from './dto/update-billboard.dto';
import { QuickUpdateBillboardDto } from './dto/quick-update-billboard.dto';
export declare class BillboardsService {
    private prisma;
    constructor(prisma: PrismaService);
    create(createBillboardDto: CreateBillboardDto, userId: string): Promise<{
        message: string;
        id: string;
    }>;
    update(id: string, updateBillboardDto: UpdateBillboardDto, userId: string): Promise<{
        message: string;
    }>;
    findAllForAdmin(): Promise<({
        createdBy: {
            name: string;
            email: string;
        };
        updatedBy: {
            name: string;
            email: string;
        };
    } & {
        id: string;
        slug: string;
        title: string;
        sku: string | null;
        address: string;
        type: string;
        price: number;
        lat: number;
        lng: number;
        status: string;
        publishStatus: string;
        mainImage: string;
        gallery: string;
        videoUrl: string | null;
        smartsucoUrl: string | null;
        specs: string;
        includes: string;
        excludes: string;
        createdAt: Date;
        updatedAt: Date;
        createdById: string | null;
        updatedById: string | null;
    })[]>;
    findAll(): import(".prisma/client").Prisma.PrismaPromise<{
        id: string;
        slug: string;
        title: string;
        sku: string | null;
        address: string;
        type: string;
        price: number;
        lat: number;
        lng: number;
        status: string;
        publishStatus: string;
        mainImage: string;
        gallery: string;
        videoUrl: string | null;
        smartsucoUrl: string | null;
        specs: string;
        includes: string;
        excludes: string;
        createdAt: Date;
        updatedAt: Date;
        createdById: string | null;
        updatedById: string | null;
    }[]>;
    findOneBySlug(slug: string): import(".prisma/client").Prisma.Prisma__BillboardClient<{
        bookings: {
            startDate: Date;
            endDate: Date;
        }[];
    } & {
        id: string;
        slug: string;
        title: string;
        sku: string | null;
        address: string;
        type: string;
        price: number;
        lat: number;
        lng: number;
        status: string;
        publishStatus: string;
        mainImage: string;
        gallery: string;
        videoUrl: string | null;
        smartsucoUrl: string | null;
        specs: string;
        includes: string;
        excludes: string;
        createdAt: Date;
        updatedAt: Date;
        createdById: string | null;
        updatedById: string | null;
    }, null, import("@prisma/client/runtime/library").DefaultArgs, import(".prisma/client").Prisma.PrismaClientOptions>;
    updateStatus(id: string, data: {
        status?: string;
        publishStatus?: string;
    }): Promise<{
        id: string;
        slug: string;
        title: string;
        sku: string | null;
        address: string;
        type: string;
        price: number;
        lat: number;
        lng: number;
        status: string;
        publishStatus: string;
        mainImage: string;
        gallery: string;
        videoUrl: string | null;
        smartsucoUrl: string | null;
        specs: string;
        includes: string;
        excludes: string;
        createdAt: Date;
        updatedAt: Date;
        createdById: string | null;
        updatedById: string | null;
    }>;
    quickUpdate(id: string, quickUpdateBillboardDto: QuickUpdateBillboardDto, userId: string): Promise<{
        message: string;
    }>;
    remove(id: string): Promise<{
        message: string;
    }>;
    findOne(id: string): Promise<{
        specs: any;
        includes: any;
        excludes: any;
        gallery: any;
        createdBy: {
            id: string;
            name: string;
            email: string;
        };
        updatedBy: {
            id: string;
            name: string;
            email: string;
        };
        history: ({
            changedBy: {
                id: string;
                name: string;
                email: string;
            };
        } & {
            id: string;
            title: string;
            price: number;
            status: string;
            billboardId: string;
            archivedAt: Date;
            changedById: string | null;
            snapshot: string;
        })[];
        id: string;
        slug: string;
        title: string;
        sku: string | null;
        address: string;
        type: string;
        price: number;
        lat: number;
        lng: number;
        status: string;
        publishStatus: string;
        mainImage: string;
        videoUrl: string | null;
        smartsucoUrl: string | null;
        createdAt: Date;
        updatedAt: Date;
        createdById: string | null;
        updatedById: string | null;
    }>;
    rollback(historyId: string, userId: string): Promise<{
        message: string;
    }>;
}
