// backend/src/billboards/billboards.controller.ts
import { Controller, Get, Param, NotFoundException, Patch, Body, Post, Delete, UseGuards, Req } from '@nestjs/common';
import { BillboardsService } from './billboards.service';
import { CreateBillboardDto } from './dto/create-billboard.dto';
import { UpdateBillboardDto } from './dto/update-billboard.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Public } from '../auth/public.decorator';
import { QuickUpdateBillboardDto } from './dto/quick-update-billboard.dto';

@Controller('api/billboards')
@UseGuards(JwtAuthGuard)
export class BillboardsController {
  constructor(private readonly billboardsService: BillboardsService) {}

  @Post()
  create(@Body() createBillboardDto: CreateBillboardDto, @Req() req: any) {
    const userId = req.user.userId;
    return this.billboardsService.create(createBillboardDto, userId);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() updateBillboardDto: UpdateBillboardDto, @Req() req: any) {
    const userId = req.user.userId;
    return this.billboardsService.update(id, updateBillboardDto, userId);
  }

  @Public()
  @Delete(':id')
  remove(@Param('id') id: string) {
    // Note: Should probably also check for ownership or admin role here
    return this.billboardsService.remove(id);
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

  @Public()
  @Patch(':id/status')
  updateStatus(@Param('id') id: string, @Body() body: { status?: string; publishStatus?: string }) {
    // Note: This should also be protected and use the user ID for auditing
    return this.billboardsService.updateStatus(id, body);
  }

  @Post('rollback')
  rollback(@Body('historyId') historyId: string, @Req() req: any) {
    const userId = req.user.userId;
    return this.billboardsService.rollback(historyId, userId);
  }

  @Patch(':id/quick-update')
  quickUpdate(@Param('id') id: string, @Body() quickUpdateDto: QuickUpdateBillboardDto, @Req() req: any) {
    const userId = req.user.userId;
    return this.billboardsService.quickUpdate(id, quickUpdateDto, userId);
  }
}


