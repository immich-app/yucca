import { type Mocks, newMocks } from '../../test/mocks';
import { AppService } from './app.service';

describe(AppService.name, () => {
  let mocks: Mocks;
  let sut: AppService;

  beforeEach(() => {
    mocks = newMocks();
    sut = new AppService(mocks.logger as never, mocks.dummy as never);
  });

  it('should exist', () => {
    expect(sut).toBeDefined();
  });
});
