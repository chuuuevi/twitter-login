import 'dotenv/config';
import express from 'express';
import cookieSession from 'cookie-session';
import {TwitterApi, TwitterApiV2Settings} from 'twitter-api-v2';
import {HttpsProxyAgent} from 'https-proxy-agent';

const proxy = process.env.HTTP_PROXY;
const httpAgent = proxy ? new HttpsProxyAgent(proxy) : null;

const TWITTER_CLIENT_ID = process.env.TWITTER_CLIENT_ID;
const TWITTER_CLIENT_SECRET = process.env.TWITTER_CLIENT_SECRET;
const CALLBACK_URL = process.env.CALLBACK_URL;

// TwitterApiV2Settings.debug = true;

const client = new TwitterApi(
    {clientId: TWITTER_CLIENT_ID, clientSecret: TWITTER_CLIENT_SECRET},
    {httpAgent}
);

const app = express()

app.use(cookieSession({ name: 'session', secret: 'secretomitted', maxAge: 0 }))

app.get('/', function (req, res) {
    if (req.session.login) {
        res.send("You are logged in.<a href='/logout'>Logout Twitter</a>")
    } else {
        res.send("<a href='/twitter-login'>Login with Twitter</a>")
    }
})

app.use('/logout', function (req, res) {
    req.session.login = false;
    delete req.session.twitter;
    res.redirect('/')
})

app.get('/twitter-login', function (req, res) {
    const {url, codeVerifier, state} = client.generateOAuth2AuthLink(
        CALLBACK_URL,
        {scope: ['tweet.read', 'users.read', "follows.read", "follows.write", "offline.access"]}
    );

    req.session.twitter = {
        codeVerifier, state
    };

    console.debug(`codeVerifier=${codeVerifier}, state=${state}, url=${url}`)

    res.redirect(url)
})

app.get('/callback', async (req, res) => {
    // Extract state and code from query string
    const {state, code} = req.query;
    if (typeof req.session.twitter === 'undefined') {
        return res.status(400).send(`<h1>You don't enter /twitter-login page</h1>  <br><a href='/'>Home</a>`);
    }

    // Get the saved codeVerifier from session
    const {codeVerifier, state: sessionState} = req.session.twitter;

    if (!codeVerifier || !state || !sessionState || !code) {
        return res.status(400).send(`<h1>You denied the app or your session expired!</h1>  <br><a href='/'>Home</a>`);
    }
    if (state !== sessionState) {
        return res.status(400).send(`<h1>Stored tokens didnt match!</h1>  <br><a href='/'>Home</a>`);
    }

    try {
        const {accessToken, refreshToken, expiresIn} =
            await client.loginWithOAuth2({code, codeVerifier, redirectUri: CALLBACK_URL});

        console.info(`accessToken=${accessToken}, refreshToken=${refreshToken}, expiresIn=${expiresIn}`);

        req.session.login = true;
        req.session.twitter = {
            accessToken,
            refreshToken,
            expiresIn
        };

        res.redirect('/')
    } catch (e) {
        console.info(e)
        res.status(403).send(`<h1>Invalid verifier or access tokens!</h1>  <br><a href='/'>Home</a>`);
    }
})

app.get('/me', async (req, res) => {
    if (req.session.login) {
        // console.info(`/me, req.session.twitter.accessToken=${req.session.twitter.accessToken}`);
        const loggedClient = new TwitterApi(req.session.twitter.accessToken, {httpAgent})
        try {
            const { data: userObject } =  await loggedClient.v2.me();
            res.send(`<h1>id=${userObject.id}</h1><h1>id=${userObject.name}</h1><h1>id=${userObject.username}</h1>`)
        } catch (e) {
            res.status(500).send(`<h1>${e}</h1> <br><a href='/'>Home</a>`);
        }
    } else {
        res.redirect('/twitter-login')
    }
})

app.listen(3000);
