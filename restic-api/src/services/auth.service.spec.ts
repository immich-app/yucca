import { newJwtMock } from '../../test/mocks';
import { AuthService } from './auth.service';

describe(AuthService.name, () => {
  let jwt: ReturnType<typeof newJwtMock>;
  let sut: AuthService;

  beforeEach(() => {
    jwt = newJwtMock();
    sut = new AuthService(jwt as never);
  });

  it('should exist', () => {
    expect(sut).toBeDefined();
  });

  describe('authenticate', () => {
    it('should throw if Authorization header is missing', async () => {
      await expect(sut.authenticate({})).rejects.toThrow('Missing Authorization header');
    });

    it('should throw if not Basic auth', async () => {
      await expect(sut.authenticate({ authorization: 'Bearer token' })).rejects.toThrow('Expected Basic auth');
    });

    it('should throw if token is missing', async () => {
      const auth = Buffer.from('username').toString('base64');
      await expect(sut.authenticate({ authorization: `Basic ${auth}` })).rejects.toThrow('Expected Basic auth token');
    });

    it('should throw if JWT verification fails', async () => {
      jwt.verifyAsync.mockRejectedValue(new Error('invalid'));
      const auth = Buffer.from('username:token').toString('base64');
      await expect(sut.authenticate({ authorization: `Basic ${auth}` })).rejects.toThrow('Invalid JWT Token');
    });

    it('should throw if JWT payload is invalid', async () => {
      jwt.verifyAsync.mockResolvedValue({ invalid: 'payload' });
      const auth = Buffer.from('username:token').toString('base64');
      await expect(sut.authenticate({ authorization: `Basic ${auth}` })).rejects.toThrow('Invalid auth payload');
    });

    it('should return auth dto on success', async () => {
      const payload = { user: 'testuser', repository: 'testrepo', writeOnce: true };
      jwt.verifyAsync.mockResolvedValue(payload);
      const auth = Buffer.from('username:token').toString('base64');
      const result = await sut.authenticate({ authorization: `Basic ${auth}` });
      expect(result).toEqual(payload);
      expect(jwt.verifyAsync).toHaveBeenCalledWith('token');
    });
  });
});
