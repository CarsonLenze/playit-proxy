const ControlChannel = require('./control_channel.js');
const setup = require('./setup.js');
const utils = require('./utils.js');
const API = require('./api.js');
const fs = require('fs');

//version 0.15.13
global.VERSION = '0.15.13'

const tunnel_config = {
    type: 'java', /* java/bedrock/hybrid */
    allocation: {
        type: 'region',
        details: {
            region: 'smart-global'
        }
    }
}

async function run() {
    const api = new API();
    let config = { secret_key: null, tunnels: [] };

    try {
        const buffer = fs.readFileSync('./config.json');
        config = JSON.parse(buffer);
    } catch (err) {
        config.secret_key = await setup.claim_secret(api);

        if (!config.secret_key) {
            console.trace('Issue with creating agent secret');
            return process.exit(1);
        }

        fs.writeFileSync('./config.json', JSON.stringify(config, 0, 4));
    }

    //set api secret
    api.setSecret(config.secret_key);

    const rundata = await api.agents_rundata();
    if (rundata.status !== 'success') return console.trace(rundata);
    const agent_id = rundata.data.agent_id;

    if (rundata.data.account_status !== 'ready') return console.trace('account is not ready');

    const channel = new ControlChannel();

    channel.on('control_addr', async (callback) => {
        const routing = await api.routing_get();

        if (routing.status !== 'success') {
            console.trace(routing);
            process.exit(1);
        }

        const addresses = [];
        for (const ip6 of routing.data.targets6) addresses.push(ip6);
        for (const ip4 of routing.data.targets4) addresses.push(ip4);

        callback(addresses);
    });

    channel.on('authenticate', async (callback) => {
        const agent = {
            agent_version: {
                version: {
                    platform: utils.getPlatform(),
                    version: global.VERSION
                },
                official: false,
                details_website: "tbd"
            },
            client_addr: utils.formatAddress(channel.pong.client_addr),
            tunnel_addr: utils.formatAddress(channel.pong.tunnel_addr)
        }

        const proto = await api.proto_register(agent);
        if (proto.status !== 'success') {
            console.trace(proto, body);
            process.exit(1);
        }

        callback(proto.data.key);
    });

    channel.on('authenticated', async (data) => {
        console.log('Control Channel Authenticated!')
        const check = await setup.checkTunnels(api, config, tunnel_config, agent_id);

        if (check.status !== 'success') {
            console.trace(check);
            process.exit(1);
        }

        if (check.rewrite) {
            config.tunnels = check.tunnels.map(tunnel => tunnel.id);
            fs.writeFileSync('./config.json', JSON.stringify(config, 0, 4));
        }

        for (const tunnel of check.tunnels) {
            const alloc = tunnel.alloc.data;
            const url = tunnel.port_type === 'udp' ? alloc.assigned_domain + ':' + alloc.port_start : alloc.assigned_srv

            console.log(tunnel.name, 'Tunnel url:', url);
        }
    });

    channel.on('new_tcp_client', (data) => {
        console.log('new client', data);
    });

    channel.start();
}

console.clear();
run()