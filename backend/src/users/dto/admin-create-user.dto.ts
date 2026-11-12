export enum UserRole {
  USER = 'USER',
  OPERATOR = 'OPERATOR',
  CS = 'CS',
  ADMIN = 'ADMIN',
  SUPER_ADMIN = 'SUPER_ADMIN',
}

export const USER_ROLES = Object.values(UserRole);

export class AdminCreateUserDto {
  name!: string;
  email!: string;
  password!: string;
  role!: UserRole;
}
