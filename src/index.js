const Channel = require('./channel.js');
const setup = require('./setup.js');
const API = require('./api.js');
const fs = require('fs');

global.VERSION = '0.15.13'

const server = {
    host: '127.0.0.1',
    port: 19132,
    type: 'bedrock'
}

async function run() {
    const api = new API();
    let secret;

    try {
        let buffer = fs.readFileSync('./secret.txt');
        secret = buffer.toString();
    } catch (err) {
        secret = await setup.claim_secret(api);
        if (secret) fs.writeFileSync('./secret.txt', Buffer.from(secret));
    }

    //set api secret
    api.setSecret(secret);

    const rundata = await api.agents_rundata();
    if (rundata.status !== 'success') return console.error(rundata);

    if (rundata.data.account_status !== 'ready') return console.error('account is not ready');
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
    // const channel = new Channel('209.25.140.1');
    // channel.start();

    // channel.onMessage((msg, rinfo) => {
    //     console.log(msg, rinfo)
    // })
}


/*

    // console.log(agent.data.tunnels)
    // const routing = await api.execute('/agents/routing/get');
    // if (routing.status !== "success") return console.trace(routing);
    // console.log(routing)
*/

run()