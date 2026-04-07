import { env } from '@common/server/env';
import { Injectable } from '@nestjs/common';

@Injectable()
export class ResticApiRepository {
  getEndpoint() {
    return new URL(`http://${env.RESTIC_API_HOST}:${env.RESTIC_API_PORT}`);
  }
}
