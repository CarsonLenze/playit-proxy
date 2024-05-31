const axios = require('axios').default;
const config = require('./config.json');
const crypto = require('crypto');
const util = require('util');
const dns = require('dns');
const fs = require('fs');

const api = axios.create({
    headers: {
        "Content-Type": "application/json",
        "Accept": "application/json"
    },
    baseURL: "https://api.playit.gg"
});

api.execute = async (path = '/', body = {}, extra = {}) => {
    if (config.secret) extra.headers = {
        ...extra?.headers,
        Authorization: 'agent-key ' + config.secret
    }

    return api.post(path, body, extra)
        .then(res => res.data)
        .catch(error => error?.response?.data ?? null);
}

async function genSecret() {
    const claimCode = crypto.randomBytes(8).toString('hex');

    const body = {
        code: claimCode,
        agent_type: "self-managed",
        version: "carson development"
    }

    const claim = await api.execute('/claim/setup', body);
    if (claim.data !== 'WaitingForUserVisit') return console.trace(claim);
    console.log("https://playit.gg/mc/" + claimCode);

    let stage = 0;
    await new Promise((resolve, reject) => {
        async function run() {
            const claim = await api.execute('/claim/setup', body);

            switch (claim.data) {
                case 'WaitingForUserVisit':
                    console.log('run')
                break;
                case 'WaitingForUser':
                    console.log('user visited page')
                break;
                case 'UserAccepted':
                    console.log('user accepted')
                    resolve(true)
                break;
                default:
                    console.log(claim.data)
                break;
            }

            if (claim.data !== 'UserAccepted') setTimeout(run, 5000);
        }

        run()
    });

    const session = await api.execute('/claim/exchange', { code: claimCode });
    if (session.status !== "success") return console.trace(session);

    fs.writeFileSync('./config.json', JSON.stringify({ secret: session.data.secret_key }, 0, 4));
    return session.data.secret_key;
}

async function run() {
    if (!config.secret) config.secret = await genSecret();

    const agent = await api.execute('/agents/rundata');
    if (agent.status !== "success") return console.trace(agent);

    console.log(agent)

}

run()

