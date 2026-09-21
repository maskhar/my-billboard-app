
import { Body, Controller, HttpException, HttpStatus, Param, Patch, Post } from '@nestjs/common';
import { UsersService } from './users.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { ChangePasswordDto } from './dto/change-password.dto';

@Controller('api/users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Post('register')
  async register(@Body() createUserDto: CreateUserDto) {
    try {
      const user = await this.usersService.create(createUserDto);
      return { user, message: 'Sukses mendaftar' };
    } catch (error) {
      throw new HttpException(error.message, error.status || HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  @Patch(':id/profile')
  async updateProfile(@Param('id') id: string, @Body() updateProfileDto: UpdateProfileDto) {
    try {
      await this.usersService.updateProfile(id, updateProfileDto);
      return { message: 'Profil berhasil diperbarui.' };
    } catch (error) {
      throw new HttpException(error.message, error.status || HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  @Patch(':id/change-password')
  async changePassword(@Param('id') id: string, @Body() changePasswordDto: ChangePasswordDto) {
    try {
      await this.usersService.changePassword(id, changePasswordDto);
      return { message: 'Password berhasil diubah.' };
    } catch (error) {
      throw new HttpException(error.message, error.status || HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }
}


