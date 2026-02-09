import { Injectable } from '@nestjs/common';

@Injectable()
export class ConfigRepository {
  getAccessToken() {
    // from login flow -- need to grab it from client
    return 'b2b8cf695f188e11bfd0b9348448972382a767aea426268c73afd350942c0f04';
  }

  getEncryptionKey(): Buffer {
    // randomBytes(32) .hex .uppercase
    return Buffer.from('19353BB7B8A5897279E55BF30C88ECD840CD8BDBD50E7F3E4B9199B91197A24C'.toLowerCase(), 'hex');
  }
}
