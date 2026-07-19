// Cognito's WebAuthn JSON uses base64url for binary fields; the browser's
// credentials API wants ArrayBuffers. Everything here is that conversion.

export function b64urlToBuf(s) {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(b64.padEnd(Math.ceil(b64.length / 4) * 4, '='));
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes.buffer;
}

export function bufToB64url(buf) {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function toGetOptions(json) {
  const pk = json.publicKey ?? json;
  return {
    publicKey: {
      ...pk,
      challenge: b64urlToBuf(pk.challenge),
      allowCredentials: (pk.allowCredentials ?? []).map((c) => ({
        ...c,
        id: b64urlToBuf(c.id),
      })),
    },
  };
}

export function toCreateOptions(json) {
  const pk = json.publicKey ?? json;
  return {
    publicKey: {
      ...pk,
      challenge: b64urlToBuf(pk.challenge),
      user: { ...pk.user, id: b64urlToBuf(pk.user.id) },
      excludeCredentials: (pk.excludeCredentials ?? []).map((c) => ({
        ...c,
        id: b64urlToBuf(c.id),
      })),
    },
  };
}

export function credentialToJson(cred) {
  const r = cred.response;
  const out = {
    id: cred.id,
    rawId: bufToB64url(cred.rawId),
    type: cred.type,
    clientExtensionResults: cred.getClientExtensionResults?.() ?? {},
    response: { clientDataJSON: bufToB64url(r.clientDataJSON) },
  };
  if (cred.authenticatorAttachment) out.authenticatorAttachment = cred.authenticatorAttachment;
  if (r.attestationObject) {
    out.response.attestationObject = bufToB64url(r.attestationObject);
    if (r.getTransports) out.response.transports = r.getTransports();
  }
  if (r.authenticatorData) {
    out.response.authenticatorData = bufToB64url(r.authenticatorData);
    out.response.signature = bufToB64url(r.signature);
    out.response.userHandle = r.userHandle ? bufToB64url(r.userHandle) : null;
  }
  return out;
}
