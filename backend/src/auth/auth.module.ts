
import { Module } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';
import { JwtModule } from '@nestjs/jwt';
import { JwtStrategy } from './jwt.strategy';

@Module({
  imports: [
    PassportModule,
    // WARNING: Hardcoded secret for development purposes ONLY.
    // In production, this MUST be replaced by a dynamic registration
    // using a ConfigService to load the secret from environment variables.
    JwtModule.register({
      secret: 'a-temporary-secret-to-make-the-server-start',
      signOptions: { expiresIn: '60m' },
    }),
  ],
  providers: [JwtStrategy],
  exports: [PassportModule],
})
export class AuthModule {}

