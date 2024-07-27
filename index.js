const fastify = require('fastify')({ logger: false });
const webpush = require('web-push');
const { TwitterApi } = require('twitter-api-v2');
const { v4: uuidv4 } = require('uuid');
const crypto = require('node:crypto');
const config = require('./config.json');

//setting up dot env in dev
require('dotenv').config();

fastify.register(require('@fastify/cookie'), {
  secret: process.env.COOKIE_SECRET,
  parseOptions: {
    expires: new Date("2999-12-31T12:00:00.000Z"),
    sameSite: 'none',
    secure: true,
    path: '/'
  }
})

fastify.register(require('@fastify/cors'), {
  origin: process.env.CLIENT_URL,
  credentials: true
})

const twitterClient = new TwitterApi({
  appKey: process.env.TWITTER_KEY,
  appSecret: process.env.TWITTER_KEY_SECRET
});

const hashPassword = (password) => crypto.pbkdf2Sync(password, process.env.SALT, 10000, 64, 'sha512').toString('hex');

let oauthTokens = {};
let userTokens = {};
let subscriptions = {};

const setupAuth = (username) => {
  const token = uuidv4();
  userTokens[username] = hashPassword(token);
  return token;
}

const checkAuth = (username, token) => {
  if (username == undefined || token == undefined) return false;
  if (userTokens[username] == hashPassword[token]) return true;
  return false;
}

//setting up webpush
webpush.setVapidDetails(
  'mailto:piero@piemadd.com',
  process.env.VAPID_PUBLIC_KEY,
  process.env.VAPID_PRIVATE_KEY,
);

// Declare a route
fastify.get('/', (request, reply) => {
  reply.redirect(process.env.CLIENT_URL);
})

fastify.get('/debug', (request, reply) => {
  reply.send({
    userTokens,
    subscriptions
  });
})

fastify.get('/ping', async (request, reply) => {
  console.log(request.cookies)
  reply.send(JSON.stringify(request.cookies))
})

fastify.get('/login-twitter', async (request, reply) => {
  const res = await twitterClient.generateAuthLink(`${process.env.SERVER_URL}/callback-twitter`)
  oauthTokens[`twitter_${res.oauth_token}`] = res.oauth_token_secret;
  reply.redirect(res.url)
})

fastify.get('/callback-twitter', async (request, reply) => {
  const { oauth_token, oauth_verifier } = request.query;
  const oauth_token_secret = oauthTokens[`twitter_${oauth_token}`];
  oauthTokens[`twitter_${oauth_token}`]; // we no longer need this

  if (!oauth_token || !oauth_verifier || !oauth_token_secret) {
    console.log('Failed user login, request denied')
    return reply.status(400).send('You denied the app or your session expired.');
  }

  const client = new TwitterApi({
    appKey: process.env.TWITTER_KEY,
    appSecret: process.env.TWITTER_KEY_SECRET,
    accessToken: oauth_token,
    accessSecret: oauth_token_secret,
  });

  try {
    const { client: loggedClient, accessToken, accessSecret } = await client.login(oauth_verifier);
    const user = await loggedClient.currentUser();

    if (!config.allowedUsers.includes(user.screen_name)) return reply.status(403).send('You are not on the user allow list.');

    const userToken = setupAuth(user.screen_name);

    console.log(`Redirecting ${user.screen_name} to client`);
    reply
      .setCookie('username', user.screen_name)
      .setCookie('name', user.name)
      .setCookie('userToken', userToken)
      .redirect(`${process.env.CLIENT_URL}/callback?username=${encodeURI(user.screen_name)}&name=${encodeURI(user.name)}&token=${encodeURI(userToken)}`)
  } catch (e) {
    reply.status(403).send('Twitter Authentication Error: Invalid verifier or access tokens.')
  }
})

fastify.post('/save-subscription', async (request, reply) => {
  const subscription = request.body;

  if (checkAuth(request.cookies.username, request.cookies.userToken)) {
    subscriptions[request.cookies.username] = subscription;
    console.log('Sub save pass')
    return reply.send({ success: true });
  };

  console.log('Sub save fail')
  return reply.send({ success: false })
})

fastify.post('/send-notif', async (request, reply) => {
  if (!checkAuth(request.cookies.username, request.cookies.userToken)) {
    return reply.send({ success: true });
  };

  const usernamesToSendTo = Object.keys(subscriptions).filter((n) => !n == request.cookies.username);

  usernamesToSendTo.forEach((username) => {
    const subscription = subscriptions[username];
    webpush.sendNotification(subscription, dataToSend);
  })

  return reply.send({ success: false })
})

// Run the server!
fastify.listen({ port: 3001, host: '0.0.0.0' }, (err, address) => {
  if (err) throw err
  console.log(`Server is now listening on ${address}`)
});