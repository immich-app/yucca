import { Generated } from 'kysely';
import { BackendType } from '../../enum';

export type BackendConfiguration =
  | {
      /** Yucca backup backend — discovers repositories by API; repository ID is the API id. */
      type: BackendType.Yucca;
      url?: string;
      accessToken: string;
    }
  | {
      /** Local backup backend — discovers repositories by folder listing; repository ID is `${path}/${id}`. */
      type: BackendType.Local;
      path: string;
    }
  | {
      /** S3 backup backend — discovers repositories by ListBuckets; repository ID is the bucket ID. */
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
