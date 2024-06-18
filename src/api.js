const axios = require('axios').default;

class API {
    constructor(secret = null) {
        this.baseURL = 'https://api.playit.gg';
        this.secret = secret;
        this.api = null;

        this.setup();
    }
    setup() {
        this.api = axios.create({
            baseURL: this.baseURL,
            headers: {
                'Content-Type': 'application/json',
                Accept: 'application/json',
                ...(this.secret && { Authorization: ['agent-key', this.secret].join(' ') }),
            },
        });
    }
    setSecret(secret) {
        this.secret = secret;
        this.setup();
    }
    async execute(...args) {
        return this.api.request(...args)
            .then(res => res.data)
            .catch((error) => error.response ? error.response.data : error);
    }

    async claim_setup(data) {
        return this.execute({ method: 'post', url: '/claim/setup', data: data });
    }
    async claim_exchange(code) {
        return this.execute({ method: 'post', url: '/claim/exchange', data: { code }});
    }
    async agents_rundata() {
        if (!this.secret) return console.error('request requires secret');

        return this.execute({ method: 'post', url: '/agents/rundata' });
    }
    async routing_get(agent_id = null) {
        if (!this.secret) return console.error('request requires secret');

        return this.execute({ method: 'post', url: '/agents/routing/get', data: { agent_id }});
    }
    async list_tunnels(agent_id, tunnel_id = null) {
        if (!this.secret) return console.error('request requires secret');

        return this.execute({ method: 'post', url: '/tunnels/list', data: { agent_id, tunnel_id } });
    }
}

module.exports = API;