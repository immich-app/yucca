import {
  Body,
  Controller,
  Delete,
  Get,
  Head,
  Headers,
  HttpCode,
  HttpStatus,
  NotImplementedException,
  Param,
  ParseBoolPipe,
  Post,
  Query,
  Res,
} from '@nestjs/common';
import { type Response } from 'express';
import { AppService } from 'src/services/app.service';
import { BlobParamsDto, BlobWithNameParamsDto } from 'src/validation';

@Controller()
export class AppController {
  constructor(private readonly service: AppService) {}

  @Post(':path')
  @HttpCode(HttpStatus.OK)
  async createRepository(
    @Param('path') path: string,
    @Query('create', ParseBoolPipe) isCreate: boolean,
  ): Promise<void> {
    await this.service.createRepository(path, isCreate);
  }

  @Delete(':path')
  @HttpCode(HttpStatus.NOT_IMPLEMENTED)
  deleteRepository(): void {
    this.service.deleteRepository();
  }

  @Head(':path/config')
  async checkConfig(@Param('path') path: string, @Res() res: Response): Promise<void> {
    const size = await this.service.checkConfig(path);
    res.set('Content-Length', String(size)).end();
  }

  @Get(':path/config')
  async getConfig(@Param('path') path: string, @Res() res: Response): Promise<void> {
    const data = await this.service.getConfig(path);
    res.set('Content-Type', 'application/octet-stream').send(data);
  }

  @Post(':path/config')
  @HttpCode(HttpStatus.OK)
  async saveConfig(@Param('path') path: string, @Body() body: Buffer): Promise<void> {
    await this.service.saveConfig(path, body);
  }

  @Get(':path/:type')
  async listBlobs(
    @Param() { path, type }: BlobParamsDto,
    @Headers('accept') accept: string | undefined,
    @Res() res: Response,
  ): Promise<void> {
    if (accept !== 'application/vnd.x.restic.rest.v2') {
      throw new NotImplementedException();
    }

    const blobs = await this.service.listBlobs(path, type);

    // note: must set header and serialise manually or Express adds charset to header
    res.setHeader('Content-Type', 'application/vnd.x.restic.rest.v2').end(JSON.stringify(blobs));
  }

  @Head(':path/:type/:name')
  async checkBlob(@Param() { path, type, name }: BlobWithNameParamsDto, @Res() res: Response): Promise<void> {
    const size = await this.service.checkBlob(path, type, name);
    res.set('Content-Length', String(size)).end();
  }

  @Get(':path/:type/:name')
  async getBlob(
    @Param() { path, type, name }: BlobWithNameParamsDto,
    @Headers('range') range: string | undefined,
    @Res() res: Response,
  ): Promise<void> {
    const data = await this.service.getBlob(path, type, name, range);
    res.set('Content-Type', 'application/octet-stream').send(data);
  }

  @Post(':path/:type/:name')
  @HttpCode(HttpStatus.OK)
  async saveBlob(@Param() { path, type, name }: BlobWithNameParamsDto, @Body() body: Buffer): Promise<void> {
    await this.service.saveBlob(path, type, name, body);
  }

  @Delete(':path/:type/:name')
  @HttpCode(HttpStatus.OK)
  async deleteBlob(@Param() { path, type, name }: BlobWithNameParamsDto): Promise<void> {
    await this.service.deleteBlob(path, type, name);
  }
}
