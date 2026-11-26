import { ForbiddenException } from '@nestjs/common';
import { Role } from '@prisma/client';
import { UsersService } from './users.service';

describe('UsersService.adminCreate', () => {
  const dto = {
    name: 'Admin Baru',
    email: 'baru@example.invalid',
    password: 'kata-sandi-kuat',
    role: Role.SUPER_ADMIN,
  };
  const findUnique = jest.fn();
  const create = jest.fn();
  const service = new UsersService({ user: { findUnique, create } } as never);

  beforeEach(() => {
    jest.clearAllMocks();
    findUnique.mockResolvedValue(null);
    create.mockResolvedValue({ id: 'pengguna-1', ...dto, password: 'hashed' });
  });

  it('menolak admin biasa membuat Super Admin sebelum menyentuh database', async () => {
    await expect(service.adminCreate(dto, Role.ADMIN)).rejects.toThrow(ForbiddenException);
    expect(findUnique).not.toHaveBeenCalled();
    expect(create).not.toHaveBeenCalled();
  });

  it('mengizinkan Super Admin membuat Super Admin', async () => {
    const result = await service.adminCreate(dto, Role.SUPER_ADMIN);
    expect(create).toHaveBeenCalledWith({
      data: expect.objectContaining({ email: dto.email, role: Role.SUPER_ADMIN }),
    });
    expect(result).not.toHaveProperty('password');
  });

  it('mengizinkan admin biasa membuat pengguna tanpa hak Super Admin', async () => {
    const userDto = { ...dto, role: Role.USER };
    await service.adminCreate(userDto, Role.ADMIN);
    expect(create).toHaveBeenCalledWith({
      data: expect.objectContaining({ role: Role.USER }),
    });
  });
});
