import { Injectable } from '@nestjs/common';
import { BootstrapStatus } from '../enum';

@Injectable()
export class BootstrapRepository {
  private status: BootstrapStatus = BootstrapStatus.NotReady;
  private error: any;

  markReady() {
    this.status = BootstrapStatus.Ready;
  }

  markFailed(error: any) {
    this.status = BootstrapStatus.Error;
    this.error = error;
  }

  getStatus() {
    return this.status;
  }

  getError() {
    return this.error;
  }
}
