import { Injectable } from '@nestjs/common';
import { Observable } from 'rxjs';
import { RunHistoryRepository } from '../repositories/runHistory.repository';

@Injectable()
export class RunHistoryService {
  constructor(private readonly runHistory: RunHistoryRepository) {}

  observableLog(id: string): Observable<MessageEvent> {
    return this.runHistory.getObservable(id);
  }
}
