export default {
  async scheduled(event, env, ctx) {
    await cleanupUnusedUsers(env);
  },

  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (url.pathname === '/ws' && request.headers.get('Upgrade') === 'websocket') {
      return handleWebSocket(request, env);
    }

    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type'
        }
      });
    }

    if (url.pathname === '/api/users' && request.method === 'POST') {
      return await createUser(request, env);
    }

    if (url.pathname === '/api/users/check' && request.method === 'POST') {
      return await checkUserTime(request, env);
    }

    return new Response('Flight Class Server API', { status: 200 });
  },
};

function handleWebSocket(request, env) {
  const pair = new WebSocketPair();
  const [client, server] = Object.values(pair);

  server.accept();

  let expireTimer = null;
  let userToken = null;

  server.addEventListener('message', async (event) => {
    try {
      const data = JSON.parse(event.data);

      if (data.type === 'ping') {
        server.send(JSON.stringify({ type: 'ping', timestamp: Date.now() }));
      } else if (data.type === 'enter') {
        let decryptedToken;
        try {
          decryptedToken = await decrypt(data.token, env);
        } catch (decryptError) {
          server.send(JSON.stringify({ type: 'error', message: 'Invalid token format: ' + decryptError.message }));
          return;
        }

        const result = await validateAndEnter(decryptedToken, env);
        server.send(JSON.stringify(result));

        if (result.type === 'success') {
          userToken = decryptedToken;
          const timeUntilExpire = result.expired_time - Date.now();

          if (expireTimer) clearTimeout(expireTimer);

          expireTimer = setTimeout(() => {
            server.send(JSON.stringify({
              type: 'expired',
              token: userToken,
              message: 'Your session has expired',
              expired_at: Date.now()
            }));
          }, timeUntilExpire);
        }
      } else {
        server.send(JSON.stringify({ type: 'error', message: 'Unknown message type' }));
      }
    } catch (error) {
      server.send(JSON.stringify({ type: 'error', message: error.message }));
    }
  });

  server.addEventListener('close', (event) => {
    if (expireTimer) clearTimeout(expireTimer);
    console.log('WebSocket closed', event.code, event.reason);
  });

  return new Response(null, {
    status: 101,
    webSocket: client,
  });
}

async function checkUserTime(request, env) {
  try {
    const { token } = await request.json();
    const decryptedToken = await decrypt(token, env);

    const { results } = await env.DB.prepare(
      'SELECT * FROM user WHERE token = ?'
    ).bind(decryptedToken).all();

    if (results.length === 0) {
      return jsonResponse({ valid: false, error: 'User not found' }, 404);
    }

    const user = results[0];
    const now = Date.now();

    if (!user.expired_time) {
      return jsonResponse({ valid: false, error: 'No expiration time set' }, 400);
    }

    if (user.expired_time >= now) {
      return jsonResponse({
        valid: true,
        token: user.token,
        expired_time: user.expired_time,
        remaining_time: user.expired_time - now
      });
    } else {
      return jsonResponse({
        valid: false,
        error: 'Token has expired',
        expired_time: user.expired_time
      }, 403);
    }
  } catch (error) {
    return jsonResponse({ error: error.message }, 500);
  }
}

async function cleanupUnusedUsers(env) {
  try {
    const result = await env.DB.prepare(
      'DELETE FROM user WHERE enter_time IS NULL AND expired_time IS NULL'
    ).run();

    console.log(`Cleanup completed: ${result.meta.changes} users deleted`);
    return result;
  } catch (error) {
    console.error('Cleanup failed:', error.message);
    throw error;
  }
}

async function validateAndEnter(token, env) {
  try {
    const { results } = await env.DB.prepare(
      'SELECT * FROM user WHERE token = ?'
    ).bind(token).all();

    if (results.length === 0) {
      return { type: 'error', message: 'User not found' };
    }

    const user = results[0];
    const now = Date.now();

    if (user.expired_time) {
      if (user.expired_time < now) {
        return { type: 'error', message: 'Token has expired' };
      }

      return { type: 'success', token, enter_time: user.enter_time, expired_time: user.expired_time, already_entered: true };
    }

    const enter_time = now;
    const expired_time = now + (10 * 60 * 1000);

    await env.DB.prepare(
      'UPDATE user SET enter_time = ?, expired_time = ? WHERE token = ?'
    ).bind(enter_time, expired_time, token).run();

    return { type: 'success', token, enter_time, expired_time, already_entered: false };
  } catch (error) {
    return { type: 'error', message: error.message };
  }
}

async function createUser(request, env) {
  try {
    const { token } = await request.json();
    const created_time = Date.now();

    await env.DB.prepare(
      'INSERT INTO user (token, created_time) VALUES (?, ?)'
    ).bind(token, created_time).run();

    return jsonResponse({ success: true, token, created_time });
  } catch (error) {
    return jsonResponse({ error: error.message }, 500);
  }
}

async function decrypt(encryptedToken, env) {
  try {
    const encryptedBuffer = Uint8Array.from(atob(encryptedToken), c => c.charCodeAt(0));

    // CryptoJS format: "Salted__" + 8 bytes salt + ciphertext
    if (encryptedBuffer[0] !== 0x53 || encryptedBuffer[1] !== 0x61) {
      throw new Error('Invalid CryptoJS format');
    }

    const salt = encryptedBuffer.slice(8, 16);
    const ciphertext = encryptedBuffer.slice(16);

    // Derive key and IV using EVP_BytesToKey (same as CryptoJS)
    const password = new TextEncoder().encode(env.ENCRYPTION_KEY);
    const { key, iv } = evpBytesToKey(password, salt, 32, 16);

    const cryptoKey = await crypto.subtle.importKey(
      'raw',
      key,
      { name: 'AES-CBC' },
      false,
      ['decrypt']
    );

    const decryptedBuffer = await crypto.subtle.decrypt(
      { name: 'AES-CBC', iv },
      cryptoKey,
      ciphertext
    );

    return new TextDecoder().decode(decryptedBuffer);
  } catch (error) {
    throw new Error('Decryption failed: ' + error.message);
  }
}

function evpBytesToKey(password, salt, keyLen, ivLen) {
  const md5Hashes = [];
  let digest = new Uint8Array(0);

  while (md5Hashes.reduce((acc, h) => acc + h.length, 0) < keyLen + ivLen) {
    const data = new Uint8Array(digest.length + password.length + salt.length);
    data.set(digest, 0);
    data.set(password, digest.length);
    data.set(salt, digest.length + password.length);

    digest = md5(data);
    md5Hashes.push(digest);
  }

  const keyIv = new Uint8Array(md5Hashes.reduce((acc, h) => acc + h.length, 0));
  let offset = 0;
  for (const hash of md5Hashes) {
    keyIv.set(hash, offset);
    offset += hash.length;
  }

  return {
    key: keyIv.slice(0, keyLen),
    iv: keyIv.slice(keyLen, keyLen + ivLen)
  };
}

function md5(data) {
  function rotateLeft(value, shift) {
    return (value << shift) | (value >>> (32 - shift));
  }

  function addUnsigned(x, y) {
    return (x + y) >>> 0;
  }

  const k = new Uint32Array([
    0xd76aa478, 0xe8c7b756, 0x242070db, 0xc1bdceee, 0xf57c0faf, 0x4787c62a, 0xa8304613, 0xfd469501,
    0x698098d8, 0x8b44f7af, 0xffff5bb1, 0x895cd7be, 0x6b901122, 0xfd987193, 0xa679438e, 0x49b40821,
    0xf61e2562, 0xc040b340, 0x265e5a51, 0xe9b6c7aa, 0xd62f105d, 0x02441453, 0xd8a1e681, 0xe7d3fbc8,
    0x21e1cde6, 0xc33707d6, 0xf4d50d87, 0x455a14ed, 0xa9e3e905, 0xfcefa3f8, 0x676f02d9, 0x8d2a4c8a,
    0xfffa3942, 0x8771f681, 0x6d9d6122, 0xfde5380c, 0xa4beea44, 0x4bdecfa9, 0xf6bb4b60, 0xbebfbc70,
    0x289b7ec6, 0xeaa127fa, 0xd4ef3085, 0x04881d05, 0xd9d4d039, 0xe6db99e5, 0x1fa27cf8, 0xc4ac5665,
    0xf4292244, 0x432aff97, 0xab9423a7, 0xfc93a039, 0x655b59c3, 0x8f0ccc92, 0xffeff47d, 0x85845dd1,
    0x6fa87e4f, 0xfe2ce6e0, 0xa3014314, 0x4e0811a1, 0xf7537e82, 0xbd3af235, 0x2ad7d2bb, 0xeb86d391
  ]);

  const r = new Uint8Array([
    7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22,
    5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20,
    4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23,
    6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21
  ]);

  const msgLen = data.length;
  const numBlocks = ((msgLen + 8) >>> 6) + 1;
  const totalLen = numBlocks << 6;
  const msg = new Uint8Array(totalLen);
  msg.set(data);
  msg[msgLen] = 0x80;

  const bitLen = msgLen * 8;
  msg[totalLen - 8] = bitLen & 0xff;
  msg[totalLen - 7] = (bitLen >>> 8) & 0xff;
  msg[totalLen - 6] = (bitLen >>> 16) & 0xff;
  msg[totalLen - 5] = (bitLen >>> 24) & 0xff;

  let h0 = 0x67452301;
  let h1 = 0xefcdab89;
  let h2 = 0x98badcfe;
  let h3 = 0x10325476;

  for (let i = 0; i < numBlocks; i++) {
    const offset = i << 6;
    const w = new Uint32Array(16);
    for (let j = 0; j < 16; j++) {
      w[j] = msg[offset + j * 4] | (msg[offset + j * 4 + 1] << 8) |
        (msg[offset + j * 4 + 2] << 16) | (msg[offset + j * 4 + 3] << 24);
    }

    let a = h0, b = h1, c = h2, d = h3;

    for (let j = 0; j < 64; j++) {
      let f, g;
      if (j < 16) {
        f = (b & c) | (~b & d);
        g = j;
      } else if (j < 32) {
        f = (d & b) | (~d & c);
        g = (5 * j + 1) % 16;
      } else if (j < 48) {
        f = b ^ c ^ d;
        g = (3 * j + 5) % 16;
      } else {
        f = c ^ (b | ~d);
        g = (7 * j) % 16;
      }

      f = addUnsigned(f, addUnsigned(a, addUnsigned(k[j], w[g])));
      a = d;
      d = c;
      c = b;
      b = addUnsigned(b, rotateLeft(f, r[j]));
    }

    h0 = addUnsigned(h0, a);
    h1 = addUnsigned(h1, b);
    h2 = addUnsigned(h2, c);
    h3 = addUnsigned(h3, d);
  }

  const result = new Uint8Array(16);
  for (let i = 0; i < 4; i++) {
    result[i] = (h0 >>> (i * 8)) & 0xff;
    result[i + 4] = (h1 >>> (i * 8)) & 0xff;
    result[i + 8] = (h2 >>> (i * 8)) & 0xff;
    result[i + 12] = (h3 >>> (i * 8)) & 0xff;
  }

  return result;
}

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type'
    }
  });
}
