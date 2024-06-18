const crypto = require('crypto');
const API = require('./api.js');
const fs = require('fs');

const VERSION = '0.15.13'

const server = {
    host: '127.0.0.1',
    port: 19132,
    type: 'bedrock'
}

async function run() {
    //playit.gg Secret
    let secret;

    try {
        let buffer = fs.readFileSync('./secret.txt');
        secret = buffer.toString();
    } catch (err) {
        secret = await setup();
        if (secret) fs.writeFileSync('./secret.txt', Buffer.from(secret));
    }

    const api = new API(secret);

    const rundata = await api.agents_rundata();
    if (rundata.status !== 'success') return console.error(rundata);

    if (rundata.data.account_status !== 'ready') return console.error('account is not ready');
    
    //do tunnel creation here if one does not exsist

    const agent_id = rundata.data.agent_id;

    const tunnels = await api.list_tunnels(agent_id);
    if (tunnels.status !== 'success') return console.error(tunnels);

    const tunnel = tunnels.data.tunnels.find(tunnel => {
        const data = tunnel.origin.data;
        if (data.agent_id !== agent_id) return false;
        if (data.local_ip !== server.host) return false;
        if (data.local_port !== server.port) return false;
        if (tunnel.tunnel_type !== ('minecraft-' + server.type)) return false;
        return true;
    });

    if (!tunnel) console.error('no tunnel')
    //for url console.log(tunnel.alloc.data)
    //create tunnel here and do more routing changes

    const routing = await api.routing_get();
    if (routing.status !== 'success') return console.error(routing);

    //console.log(routing.data)
    const address = routing.data.targets4[0];
    console.log(address)
}


/*

    // console.log(agent.data.tunnels)
    // const routing = await api.execute('/agents/routing/get');
    // if (routing.status !== "success") return console.trace(routing);
    // console.log(routing)
*/

async function setup() {
    const claimCode = crypto.randomBytes(8).toString('hex');
    const api = new API();

    const body = {
        code: claimCode,
        agent_type: "self-managed",
        version: VERSION
    }

    const claim = await api.claim_setup(body);
    if (claim.status !== 'success') return console.error(claim);

    console.log('Visit web page:', 'https://playit.gg/mc/' + body.code);
    console.log('Or enter code: ', body.code);
    console.log('\x1b[1m%s\x1b[0m', `Setup playit.gg (v${VERSION})`);

    return new Promise((resolve, reject) => {
        const interval = setInterval(async () => {
            const claim = await api.claim_setup(body);

            if (claim.status !== 'success') {
                clearInterval(interval);
                console.error(claim);
                return process.exit(1);
            }

            switch (claim.data) {
                case 'WaitingForUserVisit':
                    /* waiting for user to visit */
                break;
                case 'WaitingForUser':
                    /* waiting for user to accept */
                break;
                case 'UserAccepted':
                    //user accepted
                    clearInterval(interval);
                    console.log('Authenticating');

                    const exchange = await api.claim_exchange(body.code);

                    if (exchange.status !== 'success') {
                        console.error(claim);
                        return process.exit(1);
                    }

                    console.clear();
                    resolve(exchange.data.secret_key);
                break;
                case 'UserRejected':
                    /* user rejected */
                    clearInterval(interval);
                    console.error('User rejected agent');
                    process.exit(1);
                break;
                default:
                    clearInterval(interval);
                    console.error('unknown claim code', claim.data);
                    return process.exit(1);
                break;
            }
        }, 5000);
    });
}

run()