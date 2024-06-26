const crypto = require('crypto');

async function claim_secret(api) {
    const claimCode = crypto.randomBytes(8).toString('hex');

    const body = {
        code: claimCode,
        agent_type: "self-managed",
        version: global.VERSION
    }

    const claim = await api.claim_setup(body);
    if (claim.status !== 'success') return console.trace(claim);

    console.log('Visit web page:', 'https://playit.gg/mc/' + body.code);
    console.log('Or enter code: ', body.code);
    console.log('\x1b[1m%s\x1b[0m', `Setup playit.gg (v${global.VERSION})`);

    return new Promise((resolve, reject) => {
        const interval = setInterval(async () => {
            const claim = await api.claim_setup(body);

            if (claim.status !== 'success') {
                clearInterval(interval);
                console.trace(claim);
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
                        console.trace(claim);
                        return process.exit(1);
                    }

                    console.clear();
                    resolve(exchange.data.secret_key);
                    break;
                case 'UserRejected':
                    /* user rejected */
                    clearInterval(interval);
                    console.trace('User rejected agent');
                    process.exit(1);
                    break;
                default:
                    clearInterval(interval);
                    console.trace('unknown claim code', claim.data);
                    return process.exit(1);
                    break;
            }
        }, 5000);
    });
}

async function checkTunnels(api, config, tunnel_config, agent_id) {
    const check = await api.list_tunnels(agent_id);
    const data = new Object();
    data.rewrite = false;

    if (check.status !== 'success') {
        console.trace(check);
        process.exit(1);
    }
    const tunnels = check.data.tunnels;

    if (!config?.tunnels?.length || !config?.tunnels.every(tunnel => tunnels.find(x => x.id === tunnel))) {
        console.log('Creating new tunnel(s)');

        if (tunnel_config.type === 'hybrid') {
            console.log('more work needed')
        } else {
            const tunnel = await createTunnel(api, tunnel_config, agent_id);
            if (tunnel.status !== 'success') {
                console.trace(tunnel);
                console.log('There was a problem creating a tunnel');
                return process.exit(1);
            }

            data.rewrite = true;
            data.tunnels = [tunnel];
            data.status = 'success';
        }
    } else {
        data.tunnels = tunnels.filter(tunnel => config.tunnels.includes(tunnel.id));
        data.status = 'success';
    }

    return data;
}

async function createTunnel(api, info, agent_id) {
    const capitalize = s => s && s[0].toUpperCase() + s.slice(1);

    const config = {
        name: "Minecraft " + capitalize(info.type),
        tunnel_type: 'minecraft-' + info.type,
        port_type: info.type === 'bedrock' ? 'udp' : 'tcp',
        port_count: 1,
        origin: {
            type: 'managed',
            data: {
                agent_id: agent_id
            }
        },
        enabled: true,
        alloc: info.allocation
    }

    const create = await api.create_tunnel(config);
    if (create.status !== 'success') return console.trace(create);
    const id = create.data.id;

    return new Promise((resolve, reject) => {
        const interval = setInterval(async () => {
            const check = await api.list_tunnels(agent_id);
            if (check.status !== 'success') return console.trace(check);

            const tunnels = check.data.tunnels;
            const tunnel = tunnels.find(tunnel => tunnel.id === id);

            if (!tunnel) return reject('bad tunnel');
            if (tunnel.alloc.status === 'pending') return;

            clearInterval(interval);
            resolve({ ...tunnel, status: 'success' });
        }, 2500);
    });
}


module.exports = {
    claim_secret: claim_secret,
    checkTunnels: checkTunnels
}