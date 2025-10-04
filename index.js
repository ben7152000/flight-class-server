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
        const result = await validateAndEnter(data.token, env);
        server.send(JSON.stringify(result));

        if (result.type === 'success') {
          userToken = data.token;
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

    const { results } = await env.DB.prepare(
      'SELECT * FROM user WHERE token = ?'
    ).bind(token).all();

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
    const created_time = Date.now().toString();

    await env.DB.prepare(
      'INSERT INTO user (token, created_time) VALUES (?, ?)'
    ).bind(token, created_time).run();

    return jsonResponse({ success: true, token, created_time });
  } catch (error) {
    return jsonResponse({ error: error.message }, 500);
  }
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
