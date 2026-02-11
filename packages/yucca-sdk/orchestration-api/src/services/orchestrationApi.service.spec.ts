import { Test, TestingModule } from '@nestjs/testing';
import { OrchestrationApiService } from './orchestrationApi.service.js';

describe('OrchestrationApiService', () => {
  let service: OrchestrationApiService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [OrchestrationApiService],
    }).compile();

    service = module.get<OrchestrationApiService>(OrchestrationApiService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
