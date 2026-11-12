// backend/src/billboards/billboards.controller.ts
import { Controller, Get, Param, NotFoundException, Patch, Body, Post, Delete } from '@nestjs/common';
import { BillboardsService } from './billboards.service';
import { CreateBillboardDto } from './dto/create-billboard.dto';
import { UpdateBillboardDto } from './dto/update-billboard.dto';
import { Public } from '../auth/public.decorator';
import { Roles } from '../auth/roles.decorator';
import { CurrentUser } from '../auth/auth-user';
import { ADMIN_ROLES } from '../auth/admin-roles';
import type { AuthUser } from '../auth/auth-user';
import { QuickUpdateBillboardDto } from './dto/quick-update-billboard.dto';

@Controller('api/billboards')
export class BillboardsController {
  constructor(private readonly billboardsService: BillboardsService) {}

  @Roles(...ADMIN_ROLES)
  @Post()
  create(@CurrentUser() user: AuthUser, @Body() createBillboardDto: CreateBillboardDto) {
    return this.billboardsService.create(createBillboardDto, user.id);
  }

  @Roles(...ADMIN_ROLES)
  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() updateBillboardDto: UpdateBillboardDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.billboardsService.update(id, updateBillboardDto, user.id);
  }

  @Roles(...ADMIN_ROLES)
  @Delete(':id')
  // `adminEmail` masih diterima di body demi kompatibilitas dengan frontend
  // lama, tapi TIDAK lagi dipakai untuk validasi apa pun.
  remove(@Param('id') id: string) {
    return this.billboardsService.remove(id);
  }

  @Public()
  @Get()
  findAll() {
    return this.billboardsService.findAll();
  }

  @Roles(...ADMIN_ROLES)
  @Get('admin')
  findAllForAdmin() {
    return this.billboardsService.findAllForAdmin();
  }

  @Roles(...ADMIN_ROLES)
  @Get(':id/detail')
  async findOne(@Param('id') id: string) {
    const billboard = await this.billboardsService.findOne(id);
    if (!billboard) {
      throw new NotFoundException('Billboard not found');
    }
    return billboard;
  }

  @Public()
  @Get(':slug')
  async findOneBySlug(@Param('slug') slug: string) {
    const billboard = await this.billboardsService.findOneBySlug(slug);
    if (!billboard) {
      throw new NotFoundException('Billboard not found');
    }
    return billboard;
  }

  @Roles(...ADMIN_ROLES)
  @Patch(':id/status')
  updateStatus(@Param('id') id: string, @Body() body: { status?: string; publishStatus?: string }) {
    return this.billboardsService.updateStatus(id, body);
  }

  @Roles(...ADMIN_ROLES)
  @Post('rollback')
  // `adminEmail` masih diterima di body demi kompatibilitas, tapi diabaikan.
  rollback(@Body('historyId') historyId: string, @CurrentUser() user: AuthUser) {
    return this.billboardsService.rollback(historyId, user.id);
  }

  @Roles(...ADMIN_ROLES)
  @Patch(':id/quick-update')
  quickUpdate(
    @Param('id') id: string,
    @Body() quickUpdateDto: QuickUpdateBillboardDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.billboardsService.quickUpdate(id, quickUpdateDto, user.id);
  }
}
