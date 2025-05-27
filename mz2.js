import tls from "tls";
import WebSocket from "ws";
import extractJSON from "extract-json-from-string";
import fs from "fs/promises";

const TOKEN = "MTM0NTMzMDc1NTg5MDMOTJk1nGIP4kDHWw-aFy3-b53PDaGDh4GEQ";
const CHANNEL = "1371894588876259510";
const SERVER = "1374511195150880841";
const CONNECTION_POOL_SIZE = 1;


let MFA_TOKEN = '';
try {
  MFA_TOKEN = JSON.parse(await fs.readFile('mfa_token2.json', 'utf-8')).token.trim();
  console.log('[MFA] Loaded');
} catch (e) {
  console.error('[MFA] Load error:', e.message);
}
fs.watch('mfa_token.json', async () => {
  try {
    MFA_TOKEN = JSON.parse(await fs.readFile('mfa_token2.json', 'utf-8')).token.trim();
    console.log('[MFA] Loaded');
  } catch (e) {
    console.error('[MFA] Load error:', e.message);
  }
});

let lastToken = '';
let patching = false;
let vanity;
const PATCH_CACHE = {};
const POST_CACHE = {};
const guildVanities = {};
const tlsSockets = Array.from({ length: CONNECTION_POOL_SIZE }, (_, i) => {
  const tlsSock = tls.connect({
    host: "canary.discord.com",
    port: 443,
    minVersion: "TLSv1.3",
    maxVersion: "TLSv1.3",
    handshakeTimeout: 3000,
  });
  tlsSock.setNoDelay(true);
  tlsSock.on('secureConnect', () => {
    const ws = new WebSocket("wss://gateway.discord.gg/", { perMessageDeflate: false, handshakeTimeout: 1 });
    ws.on('open', () => {
      if (ws._socket && ws._socket.setNoDelay) {
        ws._socket.setNoDelay(true);
      }
      ws.send(JSON.stringify({ op: 2, d: { token: TOKEN, intents: 513, properties: { os: 'linux', browser: 'firefox', device: '' } } }));
      setInterval(() => ws.ping(), 2000);
    });
    ws.on('message', raw => {
      let payload;
      try { payload = JSON.parse(raw); } catch { return; }
      const { op, t, d } = payload;
      if (op === 10) return;
      if (t === 'READY') {
        d.guilds.filter(g => g.vanity_url_code).forEach(g => {
          guildVanities[g.id] = g.vanity_url_code;
          console.log(`[VANITY] Guild: ${g.id} | Vanity: ${g.vanity_url_code}`);
        });
      }
      if (t === 'GUILD_UPDATE' && d && guildVanities[d.id] && guildVanities[d.id] !== d.vanity_url_code) {
        const find = guildVanities[d.id];
        const body = JSON.stringify({ code: find });
        if (!PATCH_CACHE[find]) {
          const patchString = [
            `PATCH /api/v7/guilds/${SERVER}/vanity-url HTTP/1.1`,
            `Host: canary.discord.com`,
            `Authorization: `,
            `Content-Type: application/json`,
            `Content-Length: ${Buffer.byteLength(body)}`,
            `x-discord-mfa-authorization: ${MFA_TOKEN}`,
            `x-super-properties: eyJicm93c2VyIjoiQ2hyb21lIiwiYnJvd3Nlcl91c2VyX2FnZW50IjoiQ2hyb21lIiwiY2xpZW50X2J1aWxkX251bWJlciI6MzU1NjI0fQ==`,
            `User-Agent: Mozilla/5.0`,
            '', ''
          ].join('\r\n') + body;
          PATCH_CACHE[find] = Buffer.from(patchString, 'utf-8');
        }
        const sendParallelPatch = (sock, data, repeat = 31) => {
          const promises = [];
          for (let i = 0; i < repeat; i++) {
            promises.push(new Promise(res => { sock.write(data, res); }));
          }
          return Promise.all(promises);
        };
        Promise.all(
          tlsSockets.filter(sock => !!sock).map(sock => sendParallelPatch(sock, PATCH_CACHE[find]))
        );
      }
    });
    tlsSock.on('data', buf => {
      console.log('TLS response body:', buf.toString());
      const jsonMsgs = extractJSON(buf.toString());
      jsonMsgs.forEach(msg => {
        const err = msg.code || msg.message;
        if (err) {
          const postBody = JSON.stringify({ content: `@everyone ${guildVanities[SERVER] || ''}\n\u007f\u007f\u007fjson\n${JSON.stringify(msg)}\n\u007f\u007f\u007f` });
          if (!POST_CACHE[postBody]) {
            const postString = [
              `POST /api/v7/channels/${CHANNEL}/messages HTTP/1.1`,
              `Host: canary.discord.com`,
              `Authorization: `,
              `Content-Type: application/json`,
              `Content-Length: ${Buffer.byteLength(postBody)}`,
              '', ''
            ].join('\r\n') + postBody;
            POST_CACHE[postBody] = Buffer.from(postString, 'utf-8');
          }
          tlsSockets.filter(sock => !!sock).forEach(sock => sock.write(POST_CACHE[postBody]));
        }
      });
    });
    return tlsSock;
  });
  tlsSock.on('error', () => {
    const newTlsSock = tls.connect({ host: 'canary.discord.com', port: 443, minVersion: 'TLSv1.3', maxVersion: 'TLSv1.3', rejectUnauthorized: false });
    newTlsSock.setNoDelay(true);
    tlsSockets[i] = newTlsSock;
  });
  tlsSock.on('end', () => {
    const newTlsSock = tls.connect({ host: 'canary.discord.com', port: 443, minVersion: 'TLSv1.3', maxVersion: 'TLSv1.3', rejectUnauthorized: false });
    newTlsSock.setNoDelay(true);
    tlsSockets[i] = newTlsSock;
  });
  return tlsSock;
});
