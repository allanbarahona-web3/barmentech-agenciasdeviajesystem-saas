import { PutObjectCommand } from '@aws-sdk/client-s3';
import { ConfigService } from '@nestjs/config';
import { StorageObjectAlreadyExistsError, StorageService } from './storage.service';

describe('StorageService immutable object primitives', () => {
  it('uses S3 If-None-Match star and no public ACL for immutable writes', async () => {
    const service = new StorageService({ get: jest.fn().mockReturnValue('value') } as unknown as ConfigService);
    jest.spyOn(service, 'getConfig').mockReturnValue({ region: 'r', endpoint: 'e', bucket: 'b', key: 'k', secret: 's', cdnEndpoint: '' });
    const send = jest.fn().mockResolvedValue({ ETag: 'etag' }); jest.spyOn(service, 'getClient').mockReturnValue({ send } as never);
    await expect(service.putObjectIfAbsent({ objectKey: 'private/key', contentType: 'application/xml', body: Buffer.from('x') })).resolves.toEqual({ eTag: 'etag' });
    const command = send.mock.calls[0][0] as PutObjectCommand;
    expect(command.input).toMatchObject({ Bucket: 'b', Key: 'private/key', ContentType: 'application/xml', IfNoneMatch: '*' });
    expect(command.input).not.toHaveProperty('ACL');
  });

  it('maps conditional write races to a narrow typed signal', async () => {
    const service = new StorageService({ get: jest.fn() } as unknown as ConfigService);
    jest.spyOn(service, 'getConfig').mockReturnValue({ region: 'r', endpoint: 'e', bucket: 'b', key: 'k', secret: 's', cdnEndpoint: '' });
    jest.spyOn(service, 'getClient').mockReturnValue({ send: jest.fn().mockRejectedValue({ $metadata: { httpStatusCode: 412 } }) } as never);
    await expect(service.putObjectIfAbsent({ objectKey: 'private/key', contentType: 'application/xml', body: Buffer.from('x') })).rejects.toBeInstanceOf(StorageObjectAlreadyExistsError);
  });
});
