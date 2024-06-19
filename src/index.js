const Channel = require('./channel.js');
const setup = require('./setup.js');
const utils = require('./utils.js');
const API = require('./api.js');
const fs = require('fs');

//version 0.15.13
global.VERSION = '0.15.13'

const server = {
    host: '127.0.0.1',
    port: 19132,
    type: 'bedrock'
}

const alloc = {
    type: 'region',
    details: {
        region: 'smart-global'
    }
}

async function run() {
    const api = new API();
    let config = { secret_key: null, tunnel_id: null };

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

    if (rundata.data.account_status !== 'ready') return console.trace('account is not ready');
    // const agent_id = rundata.data.agent_id;
    //console.log(rundata)

    //console.log(agent_id)

    // const tunnels = await api.list_tunnels(agent_id);
    // if (tunnels.status !== 'success') return console.trace(tunnels);

    // const tunnel = tunnels.data.tunnels.find(tunnel => {
    //     const data = tunnel.origin.data;
    //     if (data.agent_id !== agent_id) return false;
    //     if (data.local_ip !== server.host) return false;
    //     if (data.local_port !== server.port) return false;
    //     if (tunnel.tunnel_type !== ('minecraft-' + server.type)) return false;
    //     return true;
    // });

    // const capitalize = s => s && s[0].toUpperCase() + s.slice(1)

    // const tunnel = {
    //     // agent_id: agent_id,
    //     name: "Minecraft " + capitalize(server.type),
    //     tunnel_type: 'minecraft-' + server.type,
    //     port_type: server.type === 'bedrock' ? 'udp' : 'tcp',
    //     port_count: 1,
    //     origin: {
    //         type: 'managed',
    //         data: {
    //             agent_id: agent_id
    //         }
    //     },
    //     enabled: true,
    //     alloc: alloc
    // }

    // const test = await api.create_tunnel(tunnel)
    // //console.log(test.data.id)

    // const tunnels = await api.list_tunnels(agent_id, test.data.id);
    // console.log(tunnels.data.tunnels[0])

    // if (!tunnel) console.trace('no tunnel')
    // //for url console.log(tunnel.alloc.data)
    // //create tunnel here and do more routing changes

    const routing = await api.routing_get();
    if (routing.status !== 'success') return console.trace(routing);

    const address = routing.data.targets6[0];

    const channel = new Channel(address);
    channel.start();

    channel.onAuthenticate(async (pong) => {
        const body = {
            "agent_version": {
                "version": {
                    "platform": utils.getPlatform(),
                    "version": global.VERSION
                },
                "official": true,
                "details_website": "https://google.com"
            },
            "client_addr": utils.formatAddress(pong.client_addr),
            "tunnel_addr": utils.formatAddress(pong.tunnel_addr)
        }

        const proto = await api.proto_register(body);
        if (proto.status !== 'success') {
            console.trace(proto, body);
            process.exit(1);
        }

        return proto.data.key;
    })
}

run()