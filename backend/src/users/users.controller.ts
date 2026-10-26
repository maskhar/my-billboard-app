
import { Body, Controller, Delete, ForbiddenException, HttpException, HttpStatus, Param, Patch, Post } from '@nestjs/common';
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
  adminCreate(@Body() dto: AdminCreateUserDto) {
    return this.usersService.adminCreate(dto);
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
