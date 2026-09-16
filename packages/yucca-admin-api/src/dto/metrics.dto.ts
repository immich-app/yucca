import { BackupStatus } from 'src/enum';
import z from 'zod';

export const BackupStatusSchema = z.enum(BackupStatus).meta({ id: 'BackupStatus' });
