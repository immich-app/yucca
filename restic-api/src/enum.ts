export enum ContentType {
  ResticV2 = 'application/vnd.x.restic.rest.v2',
}

export enum MetadataKey {
  Auth = 'AUTH',
  Restic = 'RESTIC_V2',
}

export enum BlobType {
  Data = 'data',
  Index = 'index',
  Keys = 'keys',
  Locks = 'locks',
  Snapshots = 'snapshots',
}
