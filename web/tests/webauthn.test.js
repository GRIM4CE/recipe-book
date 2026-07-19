import { describe, expect, it } from 'vitest';
import {
  b64urlToBuf,
  bufToB64url,
  credentialToJson,
  toCreateOptions,
  toGetOptions,
} from '../src/webauthn.js';

describe('base64url', () => {
  it('round-trips values of every padding length', () => {
    for (const s of ['AQ', 'AQI', 'AQID', 'AQIDBA', '_-8', 'SGVsbG8']) {
      expect(bufToB64url(b64urlToBuf(s))).toBe(s);
    }
  });

  it('decodes url-safe alphabet', () => {
    expect(Array.from(new Uint8Array(b64urlToBuf('_-8')))).toEqual([255, 239]);
  });
});

describe('toGetOptions', () => {
  it('converts challenge and credential ids to buffers', () => {
    const out = toGetOptions({
      challenge: 'AQID',
      rpId: 'example.test',
      allowCredentials: [{ type: 'public-key', id: 'BAUG' }],
    });
    expect(Array.from(new Uint8Array(out.publicKey.challenge))).toEqual([1, 2, 3]);
    expect(Array.from(new Uint8Array(out.publicKey.allowCredentials[0].id))).toEqual([4, 5, 6]);
    expect(out.publicKey.rpId).toBe('example.test');
  });

  it('unwraps a publicKey envelope', () => {
    const out = toGetOptions({ publicKey: { challenge: 'AQID' } });
    expect(out.publicKey.challenge).toBeInstanceOf(ArrayBuffer);
  });
});

describe('toCreateOptions', () => {
  it('converts challenge and user id', () => {
    const out = toCreateOptions({
      challenge: 'AQID',
      rp: { id: 'example.test', name: 'x' },
      user: { id: 'BAUG', name: 'u', displayName: 'u' },
    });
    expect(out.publicKey.challenge).toBeInstanceOf(ArrayBuffer);
    expect(Array.from(new Uint8Array(out.publicKey.user.id))).toEqual([4, 5, 6]);
    expect(out.publicKey.user.name).toBe('u');
  });
});

describe('credentialToJson', () => {
  const buf = (...b) => Uint8Array.from(b).buffer;

  it('serializes an assertion (sign-in) credential', () => {
    const json = credentialToJson({
      id: 'cred-id',
      rawId: buf(1),
      type: 'public-key',
      authenticatorAttachment: 'platform',
      getClientExtensionResults: () => ({}),
      response: {
        clientDataJSON: buf(2),
        authenticatorData: buf(3),
        signature: buf(4),
        userHandle: null,
      },
    });
    expect(json).toEqual({
      id: 'cred-id',
      rawId: 'AQ',
      type: 'public-key',
      authenticatorAttachment: 'platform',
      clientExtensionResults: {},
      response: {
        clientDataJSON: 'Ag',
        authenticatorData: 'Aw',
        signature: 'BA',
        userHandle: null,
      },
    });
  });

  it('serializes a registration credential with transports', () => {
    const json = credentialToJson({
      id: 'cred-id',
      rawId: buf(1),
      type: 'public-key',
      getClientExtensionResults: () => ({}),
      response: {
        clientDataJSON: buf(2),
        attestationObject: buf(5),
        getTransports: () => ['internal'],
      },
    });
    expect(json.response.attestationObject).toBe('BQ');
    expect(json.response.transports).toEqual(['internal']);
  });
});
