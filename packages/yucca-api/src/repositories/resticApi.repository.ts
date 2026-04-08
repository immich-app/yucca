import { Injectable } from '@nestjs/common';
import { env } from 'src/env';

@Injectable()
export class ResticApiRepository {
  getEndpoint() {
    return new URL(env.RESTIC_ENDPOINT);
  }
}
