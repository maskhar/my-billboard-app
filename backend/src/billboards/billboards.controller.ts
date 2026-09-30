// backend/src/billboards/billboards.controller.ts
import { Controller, Get, Param, NotFoundException, Patch, Body, Post, Delete } from '@nestjs/common';
import { BillboardsService } from './billboards.service';
import { CreateBillboardDto } from './dto/create-billboard.dto';
import { UpdateBillboardDto } from './dto/update-billboard.dto';
import { Public } from '../auth/public.decorator';
import { QuickUpdateBillboardDto } from './dto/quick-update-billboard.dto';

@Controller('api/billboards')
export class BillboardsController {
  constructor(private readonly billboardsService: BillboardsService) {}

  @Post()
  create(@Body() createBillboardDto: CreateBillboardDto) {
    return this.billboardsService.create(createBillboardDto);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() updateBillboardDto: UpdateBillboardDto) {
    return this.billboardsService.update(id, updateBillboardDto);
  }

  @Delete(':id')
  remove(@Param('id') id: string, @Body() body: { adminEmail?: string }) {
    return this.billboardsService.remove(id, body?.adminEmail);
  }

  @Public()
  @Get()
  findAll() {
    return this.billboardsService.findAll();
  }

  @Public()
  @Get('admin')
  findAllForAdmin() {
    return this.billboardsService.findAllForAdmin();
  }

  @Public()
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

  @Patch(':id/status')
  updateStatus(@Param('id') id: string, @Body() body: { status?: string; publishStatus?: string; adminEmail?: string }) {
    return this.billboardsService.updateStatus(id, body);
  }

  @Post('rollback')
  rollback(@Body('historyId') historyId: string, @Body('adminEmail') adminEmail?: string) {
    return this.billboardsService.rollback(historyId, adminEmail);
  }

  @Patch(':id/quick-update')
  quickUpdate(@Param('id') id: string, @Body() quickUpdateDto: QuickUpdateBillboardDto) {
    return this.billboardsService.quickUpdate(id, quickUpdateDto);
  }
}


