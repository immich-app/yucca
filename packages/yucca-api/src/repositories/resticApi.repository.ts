import { env } from '@common/server/env';
import { Injectable } from '@nestjs/common';

@Injectable()
export class ResticApiRepository {
  getEndpoint() {
    return new URL(`http://100.64.0.6:${env.RESTIC_API_PORT}`);
    // return new URL(`http://localhost:${env.RESTIC_API_PORT}`);
  }
}
