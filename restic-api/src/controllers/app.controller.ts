import {
  Controller,
  Delete,
  Get,
  Head,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  ParseBoolPipe,
  Post,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import { type Request, type Response } from 'express';
import { Traceable } from '@common/server/otel';
import { BlobInfoResponseDto } from 'src/dto/app.dto';
import { type AuthDto } from 'src/dto/auth.dto';
import { Auth, AuthRoute } from 'src/middleware/auth.guard';
import { ResticRoute } from 'src/middleware/restic.interceptor';
import { AppService } from 'src/services/app.service';
import { respondWithObject } from 'src/utils/s3';
import { BlobParamsDto, BlobWithNameParamsDto } from 'src/validation';

@Traceable()
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
    const size = await this.service.checkConfig(auth);
    res.set('Content-Length', String(size)).end();
  }

  @Get(':path/config')
  @AuthRoute()
  async getConfig(@Auth() auth: AuthDto, @Req() req: Request, @Res() res: Response): Promise<void> {
    const config = await this.service.getConfig(auth);
    respondWithObject(config, req, res);
  }

  @Post(':path/config')
  @AuthRoute()
  @HttpCode(HttpStatus.OK)
  async saveConfig(@Auth() auth: AuthDto, @Req() req: Request): Promise<void> {
    await this.service.saveConfig(auth, req);
  }

  @Delete(':path/config')
  @AuthRoute()
  @HttpCode(HttpStatus.OK)
  async deleteConfig(@Auth() auth: AuthDto): Promise<void> {
    await this.service.deleteConfig(auth);
  }

  @Get(':path/:type')
  @AuthRoute()
  @ResticRoute()
  async listBlobs(@Auth() auth: AuthDto, @Param() { type }: BlobParamsDto): Promise<BlobInfoResponseDto[]> {
    return this.service.listBlobs(auth, type);
  }

  @Head(':path/:type/:name')
  @AuthRoute()
  async checkBlob(
    @Auth() auth: AuthDto,
    @Param() { type, name }: BlobWithNameParamsDto,
    @Res() res: Response,
  ): Promise<void> {
    const size = await this.service.checkBlob(auth, type, name);
    res.set('Content-Length', String(size)).end();
  }

  @Get(':path/:type/:name')
  @AuthRoute()
  async getBlob(
    @Auth() auth: AuthDto,
    @Param() { type, name }: BlobWithNameParamsDto,
    @Headers('range') range: string | undefined,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    const blob = await this.service.getBlob(auth, type, name, range);
    respondWithObject(blob, req, res);
  }

  @Post(':path/:type/:name')
  @AuthRoute()
  @HttpCode(HttpStatus.OK)
  async saveBlob(
    @Auth() auth: AuthDto,
    @Param() { type, name }: BlobWithNameParamsDto,
    @Req() req: Request,
  ): Promise<void> {
    await this.service.saveBlob(auth, type, name, req);
  }

  @Delete(':path/:type/:name')
  @AuthRoute()
  @HttpCode(HttpStatus.OK)
  async deleteBlob(@Auth() auth: AuthDto, @Param() { type, name }: BlobWithNameParamsDto): Promise<void> {
    await this.service.deleteBlob(auth, type, name);
  }
}
