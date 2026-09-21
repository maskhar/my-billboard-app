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
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.BillboardsController = void 0;
const common_1 = require("@nestjs/common");
const billboards_service_1 = require("./billboards.service");
const create_billboard_dto_1 = require("./dto/create-billboard.dto");
const update_billboard_dto_1 = require("./dto/update-billboard.dto");
const jwt_auth_guard_1 = require("../auth/jwt-auth.guard");
const public_decorator_1 = require("../auth/public.decorator");
const quick_update_billboard_dto_1 = require("./dto/quick-update-billboard.dto");
let BillboardsController = class BillboardsController {
    constructor(billboardsService) {
        this.billboardsService = billboardsService;
    }
    create(createBillboardDto, req) {
        const userId = req.user.userId;
        return this.billboardsService.create(createBillboardDto, userId);
    }
    update(id, updateBillboardDto, req) {
        const userId = req.user.userId;
        return this.billboardsService.update(id, updateBillboardDto, userId);
    }
    remove(id) {
        return this.billboardsService.remove(id);
    }
    findAll() {
        return this.billboardsService.findAll();
    }
    findAllForAdmin() {
        return this.billboardsService.findAllForAdmin();
    }
    async findOne(id) {
        const billboard = await this.billboardsService.findOne(id);
        if (!billboard) {
            throw new common_1.NotFoundException('Billboard not found');
        }
        return billboard;
    }
    async findOneBySlug(slug) {
        const billboard = await this.billboardsService.findOneBySlug(slug);
        if (!billboard) {
            throw new common_1.NotFoundException('Billboard not found');
        }
        return billboard;
    }
    updateStatus(id, body) {
        return this.billboardsService.updateStatus(id, body);
    }
    rollback(historyId, req) {
        const userId = req.user.userId;
        return this.billboardsService.rollback(historyId, userId);
    }
    quickUpdate(id, quickUpdateDto, req) {
        const userId = req.user.userId;
        return this.billboardsService.quickUpdate(id, quickUpdateDto, userId);
    }
};
exports.BillboardsController = BillboardsController;
__decorate([
    (0, common_1.Post)(),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [create_billboard_dto_1.CreateBillboardDto, Object]),
    __metadata("design:returntype", void 0)
], BillboardsController.prototype, "create", null);
__decorate([
    (0, common_1.Patch)(':id'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Body)()),
    __param(2, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, update_billboard_dto_1.UpdateBillboardDto, Object]),
    __metadata("design:returntype", void 0)
], BillboardsController.prototype, "update", null);
__decorate([
    (0, public_decorator_1.Public)(),
    (0, common_1.Delete)(':id'),
    __param(0, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], BillboardsController.prototype, "remove", null);
__decorate([
    (0, public_decorator_1.Public)(),
    (0, common_1.Get)(),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], BillboardsController.prototype, "findAll", null);
__decorate([
    (0, public_decorator_1.Public)(),
    (0, common_1.Get)('admin'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], BillboardsController.prototype, "findAllForAdmin", null);
__decorate([
    (0, public_decorator_1.Public)(),
    (0, common_1.Get)(':id/detail'),
    __param(0, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], BillboardsController.prototype, "findOne", null);
__decorate([
    (0, public_decorator_1.Public)(),
    (0, common_1.Get)(':slug'),
    __param(0, (0, common_1.Param)('slug')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], BillboardsController.prototype, "findOneBySlug", null);
__decorate([
    (0, public_decorator_1.Public)(),
    (0, common_1.Patch)(':id/status'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", void 0)
], BillboardsController.prototype, "updateStatus", null);
__decorate([
    (0, common_1.Post)('rollback'),
    __param(0, (0, common_1.Body)('historyId')),
    __param(1, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", void 0)
], BillboardsController.prototype, "rollback", null);
__decorate([
    (0, common_1.Patch)(':id/quick-update'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Body)()),
    __param(2, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, quick_update_billboard_dto_1.QuickUpdateBillboardDto, Object]),
    __metadata("design:returntype", void 0)
], BillboardsController.prototype, "quickUpdate", null);
exports.BillboardsController = BillboardsController = __decorate([
    (0, common_1.Controller)('api/billboards'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    __metadata("design:paramtypes", [billboards_service_1.BillboardsService])
], BillboardsController);
//# sourceMappingURL=billboards.controller.js.map