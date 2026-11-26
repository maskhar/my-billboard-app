
import { BadRequestException, Body, Controller, Delete, ForbiddenException, HttpException, HttpStatus, Param, Patch, Post, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { mkdir, unlink, writeFile } from 'fs/promises';
import { extname, join } from 'path';
import { randomUUID } from 'crypto';
import { UsersService } from './users.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { AdminCreateUserDto } from './dto/admin-create-user.dto';
import { AdminUpdateAccountDto } from './dto/admin-update-account.dto';
import { AdminUpdateBusinessDto } from './dto/admin-update-business.dto';
import { Public } from '../auth/public.decorator';
import { CurrentUser } from '../auth/auth-user';
import type { AuthUser } from '../auth/auth-user';
import { Roles } from '../auth/roles.decorator';
import { ADMIN_ROLES } from '../auth/admin-roles';

@Controller('api/users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  /** Idor guard: hanya boleh mengubah data milik sendiri, kecuali admin. */
  private assertCanManage(user: AuthUser, targetUserId: string) {
    if (user.id === targetUserId) return;
    if (user.role && ADMIN_ROLES.includes(user.role as (typeof ADMIN_ROLES)[number])) return;
    throw new ForbiddenException('Anda hanya dapat mengubah data milik Anda sendiri.');
  }

  // Pendaftaran tidak butuh session — form register bisa diakses tamu.
  @Public()
  @Post('register')
  async register(@Body() createUserDto: CreateUserDto) {
    try {
      const user = await this.usersService.create(createUserDto);
      return { user, message: 'Sukses mendaftar' };
    } catch (error) {
      console.error('Register error:', error);
      throw new HttpException(error.message, error.status || HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  @Patch(':id/profile')
  async updateProfile(
    @Param('id') id: string,
    @CurrentUser() user: AuthUser,
    @Body() updateProfileDto: UpdateProfileDto,
  ) {
    this.assertCanManage(user, id);
    try {
      await this.usersService.updateProfile(id, updateProfileDto);
      return { message: 'Profil berhasil diperbarui.' };
    } catch (error) {
      console.error('Update profile error:', error);
      throw new HttpException(error.message, error.status || HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  @Post(':id/profile-image')
  @UseInterceptors(FileInterceptor('file', {
    storage: memoryStorage(),
    limits: { fileSize: 5 * 1024 * 1024 },
    fileFilter: (_request, file, callback) => {
      const accepted = ['image/jpeg', 'image/png', 'image/webp'];
      callback(accepted.includes(file.mimetype) ? null : new BadRequestException('Foto harus JPG, PNG, atau WebP.'), accepted.includes(file.mimetype));
    },
  }))
  async updateProfileImage(
    @Param('id') id: string,
    @CurrentUser() user: AuthUser,
    @UploadedFile() file: Express.Multer.File,
  ) {
    if (user.id !== id) throw new ForbiddenException('Anda hanya dapat mengubah foto profil sendiri.');
    if (!file) throw new BadRequestException('Pilih foto profil terlebih dahulu.');

    const ext = extname(file.originalname).toLowerCase();
    const extByMime: Record<string, string> = {
      'image/jpeg': '.jpg',
      'image/png': '.png',
      'image/webp': '.webp',
    };
    if (!extByMime[file.mimetype] || extByMime[file.mimetype] !== ext) {
      throw new BadRequestException('Format dan ekstensi foto tidak cocok.');
    }
    const bytes = file.buffer;
    const validJpeg = bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
    const validPng = bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
    const validWebp = bytes.length >= 12 && bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP';
    if (!(file.mimetype === 'image/jpeg' && validJpeg || file.mimetype === 'image/png' && validPng || file.mimetype === 'image/webp' && validWebp)) {
      throw new BadRequestException('Isi file bukan gambar yang valid.');
    }

    const directory = join(process.cwd(), 'public/uploads/designs/profiles');
    const filename = `${randomUUID()}${ext}`;
    const path = join(directory, filename);
    const url = `/uploads/designs/profiles/${filename}`;
    await mkdir(directory, { recursive: true });
    await writeFile(path, file.buffer, { flag: 'wx' });
    try {
      await this.usersService.updateProfileImage(id, url);
      return { url };
    } catch (error) {
      await unlink(path).catch(() => undefined);
      throw error;
    }
  }

  @Patch(':id/change-password')
  async changePassword(
    @Param('id') id: string,
    @CurrentUser() user: AuthUser,
    @Body() changePasswordDto: ChangePasswordDto,
  ) {
    this.assertCanManage(user, id);
    try {
      await this.usersService.changePassword(id, changePasswordDto);
      return { message: 'Password berhasil diubah.' };
    } catch (error) {
      console.error('Change password error:', error);
      throw new HttpException(error.message, error.status || HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  @Roles(...ADMIN_ROLES)
  @Post('admin-create')
  adminCreate(@Body() dto: AdminCreateUserDto, @CurrentUser() actor: AuthUser) {
    return this.usersService.adminCreate(dto, actor.role);
  }

  @Roles(...ADMIN_ROLES)
  @Patch(':id/admin-account')
  adminUpdateAccount(
    @Param('id') id: string,
    @CurrentUser() user: AuthUser,
    @Body() dto: AdminUpdateAccountDto,
  ) {
    return this.usersService.adminUpdateAccount(id, dto, user.role);
  }

  @Roles(...ADMIN_ROLES)
  @Patch(':id/admin-business')
  adminUpdateBusiness(@Param('id') id: string, @Body() dto: AdminUpdateBusinessDto) {
    return this.usersService.adminUpdateBusiness(id, dto);
  }

  @Roles(...ADMIN_ROLES)
  @Patch(':id/admin-role')
  adminUpdateRole(
    @Param('id') id: string,
    @CurrentUser() user: AuthUser,
    @Body() body: { newRole: string },
  ) {
    return this.usersService.adminUpdateRole(id, body.newRole, user.role);
  }

  @Roles(...ADMIN_ROLES)
  @Delete(':id/admin-delete')
  adminDelete(@Param('id') id: string) {
    return this.usersService.adminDelete(id);
  }
}
