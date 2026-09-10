import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

const FilesystemListingRequestSchema = z
  .object({ path: z.string().optional() })
  .meta({ id: 'FilesystemListingRequestDto' });

const FilesystemListingItemSchema = z
  .object({
    path: z.string(),
    isDirectory: z.boolean(),
  })
  .meta({ id: 'FilesystemListingItemDto' });

const FilesystemListingResponseSchema = z
  .object({
    parent: z.string(),
    path: z.string(),
    items: z.array(FilesystemListingItemSchema),
  })
  .meta({ id: 'FilesystemListingResponseDto' });

export class FilesystemListingRequestDto extends createZodDto(FilesystemListingRequestSchema) {}
export class FilesystemListingItemDto extends createZodDto(FilesystemListingItemSchema) {}
export class FilesystemListingResponseDto extends createZodDto(FilesystemListingResponseSchema) {}
