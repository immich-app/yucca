import { Generated } from 'kysely';
import { BackendType } from '../../enum';

export type BackendConfiguration =
  | {
      /**
       * Yucca backup backend
       *
       * * Discovers repositories by API
       * * Repository ID used in API
       */
      type: BackendType.Yucca;
      url?: string;
      uuid?: string;
      accessToken: string;
    }
  | {
      /**
       * Local backup backend
       *
       * * Discovers repositories by folder listing
       * * Repository ID corresponds to `${path}/${id}`
       */
      type: BackendType.Local;
      path: string;
    }
  | {
      /**
       * S3 backup backend
       *
       * * Discovers repositories by ListBuckets
       * * Repository ID corresponds to bucket ID
       */
      type: BackendType.S3;
      endpoint: string;
      region: string;
      accessKeyId: string;
      secretAccessKey: string;
    };

export class BackendTable {
  id!: Generated<string>;
  configuration!: string;
}
