
import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';

/*
  IMPORTANT: This strategy is now configured for standard JWT validation using a secret key.
  For a production environment using Clerk, you MUST replace this with a JWKS (JSON Web Key Set) based validation.
  This involves:
  1. Installing the `jwks-rsa` package.
  2. Using `passport-jwt`'s `secretOrKeyProvider` option.
  3. Pointing it to your Clerk JWKS URL (e.g., `https://api.clerk.dev/v1/jwks`).
  
  Example:
  import { passportJwtSecret } from 'jwks-rsa';
  // ...
  super({
    secretOrKeyProvider: passportJwtSecret({
      cache: true,
      rateLimit: true,
      jwksRequestsPerMinute: 5,
      jwksUri: process.env.CLERK_JWKS_URL
    }),
    jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
    algorithms: ['RS256']
  });
*/

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor() { // Remove ConfigService injection for now
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      // This uses a symmetric secret. For Clerk (asymmetric), see comment block above.
      // WARNING: Hardcoded secret for development purposes ONLY.
      // In production, this MUST be replaced by a value from a ConfigService.
      secretOrKey: 'a-temporary-secret-to-make-the-server-start',
    });
  }

  // With a standard JWT setup, Passport automatically verifies the signature
  // and expiration. If valid, it attaches the decoded payload to the request user property.
  async validate(payload: any) {
    // The 'sub' property of the JWT payload is the user ID from Clerk.
    if (payload && payload.sub) {
      return { userId: payload.sub, ...payload };
    }
    return null;
  }
}
