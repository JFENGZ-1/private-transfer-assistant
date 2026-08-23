import { createHash, randomBytes } from 'node:crypto';
import { hash, verify, Algorithm } from '@node-rs/argon2';

export const sha256 = (value: string | Buffer) => createHash('sha256').update(value).digest('hex');
export const newToken = () => randomBytes(32).toString('base64url');
export const passwordHash = (value: string) => hash(value, { algorithm: Algorithm.Argon2id, memoryCost: 19456, timeCost: 2, parallelism: 1 });
export const passwordVerify = async (encoded: string | undefined, value: string) => encoded ? verify(encoded, value) : false;
