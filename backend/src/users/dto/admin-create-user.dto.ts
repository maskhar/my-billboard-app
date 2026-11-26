import { Role as UserRole } from '@prisma/client';

export { UserRole };

export const USER_ROLES = Object.values(UserRole);

export class AdminCreateUserDto {
  name!: string;
  email!: string;
  password!: string;
  role!: UserRole;
}
