import request from 'supertest';
import { createApp } from '../app';
import { encrypt, decrypt, generateOAuthState, verifyOAuthState } from '../utils/crypto';
import { googleAuthService } from '../services/googleAuthService';
import { slackAuthService } from '../services/slackAuthService';
import { slackNotificationService } from '../services/slackNotificationService';
import { prisma } from '../services/prismaService';
import { redisClient } from '../config/redis';
import { config } from '../config';
import { SlackConnectionStatus } from '@prisma/client';

let passed = 0;
let failed = 0;

const assert = (condition: boolean, testName: string, detail?: unknown) => {
  if (condition) {
    console.log(`  ✓ ${testName}`);
    passed++;
  } else {
    console.error(`  ✗ ${testName}`, detail || '');
    failed++;
  }
};

async function runAuthAndSlackTests() {
  console.log('\n--- Running Phase 6: Google OAuth & Slack Integration Test Suite ---\n');
  const app = createApp();

  // TEST 1: Token Encryption & Decryption (AES-256-GCM)
  {
    console.log('[1] AES-256-GCM Token Encryption & Integrity:');
    const secretToken = 'xoxb-1234567890-9876543210-mock-slack-token';
    const encrypted = encrypt(secretToken);

    assert(encrypted.includes(':'), 'Encrypted string contains IV, auth tag and ciphertext format');
    assert(encrypted !== secretToken, 'Token is fully ciphered and not in plaintext');

    const decrypted = decrypt(encrypted);
    assert(decrypted === secretToken, 'Decrypted token exactly matches the original plaintext');

    // Tampering test
    let tamperingFailed = false;
    try {
      const parts = encrypted.split(':');
      parts[2] = parts[2].replace(/[a-f0-9]/, 'x'); // Corrupt ciphertext
      decrypt(parts.join(':'));
    } catch {
      tamperingFailed = true;
    }
    assert(tamperingFailed, 'Tampered ciphertext is detected and rejected by GCM authentication tag');
  }

  // TEST 2: OAuth State Signature & CSRF Protection
  {
    console.log('\n[2] Signed OAuth State Tokens (CSRF Prevention):');
    const state = generateOAuthState('google');
    const verified = verifyOAuthState(state);

    assert(verified.valid === true, 'Generated OAuth state passes signature validation');
    assert(verified.provider === 'google', 'State records the correct provider');

    // User-bound state for Slack
    const slackState = generateOAuthState('slack', 'user-12345');
    const verifiedSlack = verifyOAuthState(slackState);
    assert(verifiedSlack.valid === true && verifiedSlack.userId === 'user-12345', 'Slack state is securely bound to initiating userId');

    // Tampered state
    const tampered = state.slice(0, -4) + 'abcd';
    const tamperedVerification = verifyOAuthState(tampered);
    assert(tamperedVerification.valid === false, 'Tampered OAuth state signature is rejected');
  }

  // TEST 3: Google Login Endpoint Redirect
  {
    console.log('\n[3] Google Login Initiation:');
    // Set mock client ID if empty
    const originalClientId = config.google.clientId;
    (config.google as any).clientId = 'mock-google-client-id.apps.googleusercontent.com';

    const res = await request(app).get('/api/auth/google');
    assert(res.status === 302, 'GET /api/auth/google returns 302 Redirect');
    assert(res.header.location.includes('accounts.google.com'), 'Redirects to accounts.google.com OAuth endpoint');
    assert(res.header.location.includes('scope=openid+email+profile'), 'Requests openid, email and profile scopes');
    assert(res.header.location.includes('state='), 'Includes signed state token');

    (config.google as any).clientId = originalClientId;
  }

  // TEST 4: Google OAuth Callback & Session Cookie Issuance
  {
    console.log('\n[4] Google Callback & Secure Cookie Issuance:');
    const originalExchange = googleAuthService.exchangeCodeAndGetProfile;
    const originalSync = googleAuthService.syncUserWithDatabase;

    try {
      googleAuthService.exchangeCodeAndGetProfile = (async () => ({
        googleId: 'google-sub-999',
        email: 'alex@reachinbox.ai',
        name: 'Alex ReachInbox',
        avatar: 'https://lh3.googleusercontent.com/avatar.jpg',
      })) as any;

      googleAuthService.syncUserWithDatabase = (async (profile: any) => ({
        id: 'user-google-999',
        ...profile,
        createdAt: new Date(),
        updatedAt: new Date(),
      })) as any;

      const validState = generateOAuthState('google');
      const callbackRes = await request(app)
        .get(`/api/auth/google/callback?code=mock-auth-code&state=${encodeURIComponent(validState)}`);

      assert(callbackRes.status === 302, 'Callback returns 302 Redirect to frontend');
      assert(callbackRes.header.location.includes('login=success'), 'Redirect location contains login=success');

      // Verify Set-Cookie header
      const cookies = callbackRes.header['set-cookie'];
      assert(Array.isArray(cookies), 'Set-Cookie header was issued');
      assert(cookies[0].includes('reachinbox_session='), 'Issues reachinbox_session cookie');
      assert(cookies[0].includes('HttpOnly'), 'Session cookie is HttpOnly for XSS security');
    } finally {
      googleAuthService.exchangeCodeAndGetProfile = originalExchange;
      googleAuthService.syncUserWithDatabase = originalSync;
    }
  }

  // TEST 5: User Profile & Logout
  {
    console.log('\n[5] User Profile & Logout:');
    prisma.user.findUnique = (async ({ where }: any) => ({
      id: where.id,
      email: 'alex@reachinbox.ai',
      name: 'Alex ReachInbox',
      avatar: 'https://lh3.googleusercontent.com/avatar.jpg',
      createdAt: new Date(),
      updatedAt: new Date(),
    })) as any;

    const meRes = await request(app)
      .get('/api/auth/me')
      .set('x-user-id', 'user-google-999');

    assert(meRes.status === 200, 'GET /api/auth/me returns 200 OK');
    assert(meRes.body.data.email === 'alex@reachinbox.ai', 'Returns verified email');
    assert(meRes.body.data.name === 'Alex ReachInbox', 'Returns user name');
    assert(meRes.body.data.avatar !== null, 'Returns avatar URL');

    const logoutRes = await request(app).post('/api/auth/logout');
    assert(logoutRes.status === 200, 'POST /api/auth/logout returns 200 OK');
    const setCookie = logoutRes.header['set-cookie'];
    assert(setCookie[0].includes('reachinbox_session=;'), 'Logout clears session cookie');
  }

  // TEST 6: Slack OAuth Initiation & Callback
  {
    console.log('\n[6] Slack OAuth Connect & Callback:');
    const originalSlackClientId = config.slack.clientId;
    (config.slack as any).clientId = 'mock-slack-client-id';

    const connectRes = await request(app)
      .get('/api/slack/connect')
      .set('x-user-id', 'test-user-id');

    assert(connectRes.status === 302, 'GET /api/slack/connect returns 302 Redirect');
    assert(connectRes.header.location.includes('slack.com/oauth/v2/authorize'), 'Redirects to slack.com OAuth');
    assert(connectRes.header.location.includes('scope=chat%3Awrite'), 'Requests chat:write permission');

    (config.slack as any).clientId = originalSlackClientId;

    // Test Slack Callback with token encryption
    const originalSlackExchange = slackAuthService.exchangeCodeAndConnect;
    slackAuthService.exchangeCodeAndConnect = (async () => ({
      id: 'slack-int-001',
      userId: 'test-user-id',
      teamId: 'T12345678',
      teamName: 'ReachInbox Team',
      status: SlackConnectionStatus.CONNECTED,
    })) as any;

    const slackState = generateOAuthState('slack', 'test-user-id');
    const callbackRes = await request(app)
      .get(`/api/slack/callback?code=mock-slack-code&state=${encodeURIComponent(slackState)}`);

    assert(callbackRes.status === 302, 'Slack callback redirects back to frontend');
    assert(callbackRes.header.location.includes('slack=connected'), 'Redirect URL confirms slack=connected');

    slackAuthService.exchangeCodeAndConnect = originalSlackExchange;
  }

  // TEST 7: Slack Disconnect & Status
  {
    console.log('\n[7] Slack Disconnect & Status API:');
    prisma.slackIntegration.findFirst = (async () => ({
      id: 'slack-int-001',
      teamId: 'T12345678',
      teamName: 'ReachInbox Workspace',
      channelName: '#email-alerts',
      status: SlackConnectionStatus.CONNECTED,
      updatedAt: new Date(),
    })) as any;

    const statusRes = await request(app)
      .get('/api/slack/status')
      .set('x-user-id', 'test-user-id');

    assert(statusRes.status === 200, 'GET /api/slack/status returns 200 OK');
    assert(statusRes.body.data.connected === true, 'Indicates connected = true');
    assert(statusRes.body.data.integration.teamName === 'ReachInbox Workspace', 'Returns workspace team name');

    // Test Disconnect
    prisma.slackIntegration.updateMany = (async () => ({ count: 1 })) as any;
    const disconnectRes = await request(app)
      .post('/api/slack/disconnect')
      .set('x-user-id', 'test-user-id');

    assert(disconnectRes.status === 200, 'POST /api/slack/disconnect returns 200 OK');
  }

  // TEST 8: Slack Rate Limit Alert & Redis Deduplication
  {
    console.log('\n[8] Slack Rate Limit Alert & Deduplication:');
    const redisNotifStore = new Map<string, string>();
    redisClient.get = (async (key: string) => redisNotifStore.get(key) || null) as any;
    redisClient.set = (async (key: string, val: string) => {
      redisNotifStore.set(key, val);
      return 'OK';
    }) as any;

    let postedToSlack = false;
    let postedPayload: any = null;

    // Mock global fetch for Slack API chat.postMessage
    const originalFetch = global.fetch;
    global.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
      if (url.toString().includes('slack.com/api/chat.postMessage')) {
        postedToSlack = true;
        postedPayload = JSON.parse((init?.body as string) || '{}');
        return {
          ok: true,
          json: async () => ({ ok: true, channel: 'C12345', ts: '1234567890.123456' }),
        } as any;
      }
      return originalFetch(url, init);
    }) as any;

    try {
      // Mock connected Slack integration with encrypted token
      prisma.slackIntegration.findFirst = (async () => ({
        id: 'slack-int-001',
        userId: 'user-001',
        teamId: 'T123',
        teamName: 'Alerts Team',
        channelId: 'C123',
        encryptedToken: encrypt('xoxb-real-bot-token'),
        status: SlackConnectionStatus.CONNECTED,
      })) as any;

      const alertPayload = {
        userId: 'user-001',
        senderId: 'sender-sales',
        senderName: 'Sales Sender',
        senderEmail: 'sales@reachinbox.ai',
        hourlyLimit: 50,
        nextAvailableHour: new Date(Date.now() + 3600 * 1000),
      };

      // 1st Notification: Should send to Slack
      const result1 = await slackNotificationService.notifyHourlyLimitReached(alertPayload);
      assert(result1 === true, 'First hourly limit event sends alert to Slack');
      assert(postedToSlack === true, 'Slack chat.postMessage was invoked');
      assert(postedPayload.text.includes('Rate Limit Alert'), 'Slack message contains rate limit warning');
      assert(postedPayload.channel === 'C123', 'Delivers to configured Slack channel');

      // 2nd Notification in same hour: Should be deduplicated by Redis key
      postedToSlack = false;
      const result2 = await slackNotificationService.notifyHourlyLimitReached(alertPayload);
      assert(result2 === false, 'Duplicate alert in same hour window was deduplicated');
      assert(postedToSlack === false, 'Slack chat.postMessage was NOT called again');
    } finally {
      global.fetch = originalFetch;
    }
  }

  console.log(`\n--- Auth & Slack Test Results: ${passed} passed, ${failed} failed ---\n`);

  if (failed > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runAuthAndSlackTests().catch((err) => {
  console.error('Auth & Slack test suite failed:', err);
  process.exit(1);
});
