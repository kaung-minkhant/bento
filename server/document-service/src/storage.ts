import {
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3'
import type { ServiceConfig } from './config.js'

export type EncryptedObject = {
  key: string
  body: Uint8Array
  sha256: string
  contentLength: number
}

export class BlobStore {
  private readonly client: S3Client

  constructor(private readonly config: ServiceConfig) {
    this.client = new S3Client({
      endpoint: config.s3Endpoint,
      region: config.s3Region,
      forcePathStyle: config.s3ForcePathStyle,
      credentials: {
        accessKeyId: config.s3AccessKeyId,
        secretAccessKey: config.s3SecretAccessKey,
      },
    })
  }

  async put(object: EncryptedObject): Promise<void> {
    await this.client.send(new PutObjectCommand({
      Bucket: this.config.s3Bucket,
      Key: object.key,
      Body: object.body,
      ContentLength: object.contentLength,
      ContentType: 'application/octet-stream',
      Metadata: { 'ciphertext-sha256': object.sha256 },
    }))
  }

  async head(key: string) {
    return this.client.send(new HeadObjectCommand({
      Bucket: this.config.s3Bucket,
      Key: key,
    }))
  }

  async get(key: string) {
    return this.client.send(new GetObjectCommand({
      Bucket: this.config.s3Bucket,
      Key: key,
    }))
  }
}
