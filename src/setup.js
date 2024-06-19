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


module.exports = {
    claim_secret: claim_secret
}