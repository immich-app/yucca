import {
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
  Req,
  Res,
} from '@nestjs/common';
import { type Request, type Response } from 'express';
import { type AuthDto } from 'src/dto/auth.dto';
import { Auth, AuthRoute } from 'src/middleware/auth.guard';
import { AppService } from 'src/services/app.service';
import { BlobParamsDto, BlobWithNameParamsDto } from 'src/validation';

@Controller()
export class AppController {
  constructor(private readonly service: AppService) {}

  @Post(':path')
  @AuthRoute()
  @HttpCode(HttpStatus.OK)
  async createRepository(@Auth() auth: AuthDto, @Query('create', ParseBoolPipe) isCreate: boolean): Promise<void> {
    await this.service.createRepository(auth.repository, isCreate);
  }

  @Delete(':path')
  @AuthRoute()
  @HttpCode(HttpStatus.NOT_IMPLEMENTED)
  deleteRepository(@Auth() _auth: AuthDto): void {
    this.service.deleteRepository();
  }

  @Head(':path/config')
  @AuthRoute()
  async checkConfig(@Auth() auth: AuthDto, @Res() res: Response): Promise<void> {
    const size = await this.service.checkConfig(auth.repository);
    res.set('Content-Length', String(size)).end();
  }

  @Get(':path/config')
  @AuthRoute()
  async getConfig(@Auth() auth: AuthDto, @Res() res: Response): Promise<void> {
    const stream = await this.service.getConfig(auth.repository);
    res.set('Content-Type', 'application/octet-stream');
    stream.pipe(res);
  }

  @Post(':path/config')
  @AuthRoute()
  @HttpCode(HttpStatus.OK)
  async saveConfig(@Auth() auth: AuthDto, @Req() req: Request): Promise<void> {
    await this.service.saveConfig(auth.repository, req, auth.writeOnce);
  }

  @Get(':path/:type')
  @AuthRoute()
  async listBlobs(
    @Auth() auth: AuthDto,
    @Param() { type }: BlobParamsDto,
    @Headers('accept') accept: string | undefined,
    @Res() res: Response,
  ): Promise<void> {
    if (accept !== 'application/vnd.x.restic.rest.v2') {
      throw new NotImplementedException();
    }

    const blobs = await this.service.listBlobs(auth.repository, type);

    // note: must set header and serialise manually or Express adds charset to header
    res.setHeader('Content-Type', 'application/vnd.x.restic.rest.v2').end(JSON.stringify(blobs));
  }

  @Head(':path/:type/:name')
  @AuthRoute()
  async checkBlob(
    @Auth() auth: AuthDto,
    @Param() { type, name }: BlobWithNameParamsDto,
    @Res() res: Response,
  ): Promise<void> {
    const size = await this.service.checkBlob(auth.repository, type, name);
    res.set('Content-Length', String(size)).end();
  }

  @Get(':path/:type/:name')
  @AuthRoute()
  async getBlob(
    @Auth() auth: AuthDto,
    @Param() { type, name }: BlobWithNameParamsDto,
    @Headers('range') range: string | undefined,
    @Res() res: Response,
  ): Promise<void> {
    const stream = await this.service.getBlob(auth.repository, type, name, range);
    res.status(range ? HttpStatus.PARTIAL_CONTENT : HttpStatus.OK).set('Content-Type', 'application/octet-stream');
    stream.pipe(res);
  }

  @Post(':path/:type/:name')
  @AuthRoute()
  @HttpCode(HttpStatus.OK)
  async saveBlob(
    @Auth() auth: AuthDto,
    @Param() { type, name }: BlobWithNameParamsDto,
    @Req() req: Request,
  ): Promise<void> {
    await this.service.saveBlob(auth.repository, type, name, req, auth.writeOnce);
  }

  @Delete(':path/:type/:name')
  @AuthRoute()
  @HttpCode(HttpStatus.OK)
  async deleteBlob(@Auth() auth: AuthDto, @Param() { type, name }: BlobWithNameParamsDto): Promise<void> {
    await this.service.deleteBlob(auth.repository, type, name, auth.writeOnce);
  }
}
