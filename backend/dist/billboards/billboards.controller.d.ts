import { BillboardsService } from './billboards.service';
import { CreateBillboardDto } from './dto/create-billboard.dto';
import { UpdateBillboardDto } from './dto/update-billboard.dto';
import { QuickUpdateBillboardDto } from './dto/quick-update-billboard.dto';
export declare class BillboardsController {
    private readonly billboardsService;
    constructor(billboardsService: BillboardsService);
    create(createBillboardDto: CreateBillboardDto, req: any): Promise<{
        message: string;
        id: string;
    }>;
    update(id: string, updateBillboardDto: UpdateBillboardDto, req: any): Promise<{
        message: string;
    }>;
    remove(id: string): Promise<{
        message: string;
    }>;
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
            archivedAt: Date;
            billboardId: string;
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
    findOneBySlug(slug: string): Promise<{
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
    }>;
    updateStatus(id: string, body: {
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
    rollback(historyId: string, req: any): Promise<{
        message: string;
    }>;
    quickUpdate(id: string, quickUpdateDto: QuickUpdateBillboardDto, req: any): Promise<{
        message: string;
    }>;
}
