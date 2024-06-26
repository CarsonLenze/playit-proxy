const EventEmitter = require('events');
const { ControlRpcMessage, ControlRequest, ControlResponse, ControlFeed } = require('./control_messages.js');
const dgram = require('dgram');
const net = require('net');

async function find_channel(addresses) {
    for (const address of addresses) {
        //console.log('trying to establish tunnel connection')
        let is_ip6 = net.isIPv6(address);
        if (!is_ip6) return { addr: address, type: 4 };
    }
}

class ControlChannel extends EventEmitter {
    constructor() {
        super();

        this.control = { addr: null, port: 5525, type: null };
        this.pong = { client_addr: null, tunnel_addr: null }

        this.session_expires = null;
        this.session_id = null;
        this.last_ping = 0;
        this.last_auth = null;
        // this.last_keep_alive = 0;
        // this.last_udp_auth = 0;
        this.current_ping = 0;
        this.request_id = 1;

        this.socket = null;

        this.tick = setInterval(() => { if (this.session_id) this.update() }, 1000);
    }
    start() {
        this.refresh_control();
    }
    ping() {
        const now = Date.now();
        this.last_ping = now;

        const message = new ControlRpcMessage({
            request_id: this.request_id,
            content: new ControlRequest.Ping({
                now: now,
                current_ping: this.current_ping,
                session_id: this.session_id
            })
        });

        const buffer = message.toBuffer();
        this.send(buffer);
    }
    authenticate() {
        this.emit('authenticate', async (key) => {
            const message = new ControlRpcMessage({
                request_id: this.request_id,
                content: Buffer.from(key, 'hex')
            });

            const buffer = message.toBuffer();
            this.last_auth = message;
            this.send(buffer);
        })
    }
    refresh_control() {
        this.emit('control_addr', async (address) => {
            const control = await find_channel(address);
            
            if (control.addr !== this.control.addr) {
                this.control.addr = control.addr;
                this.control.type = control.type;

                this.initSocket();
            }
        });
    }
    update() {
        const now = Date.now();

        if (now - this.last_ping > 1_000) this.ping();
    }
    initSocket() {
        //add old logic here
        this.socket = dgram.createSocket('udp' + this.control.type);

        this.socket.addListener('message', (...args) => this.onMessage(...args));
        this.socket.addListener('listening', () => this.onListening());

        this.socket.bind();
    }
    onListening() {
        console.log('control channel started listening');

        this.ping();
    }
    onMessage(buffer, rinfo) {
        //make sure control channel ip is correct and no man in the middle attacks

        const feedType = buffer.readInt32BE();
        const message = buffer.subarray(4);
        
        switch (feedType) {
            case ControlFeed.NewClient.id:
                console.log('new client')
            break;
            case ControlFeed.Response.id:
                
                const feed = new ControlFeed.Response({ content: message });
                const response = feed.toJSON();

                switch (response.id) {
                    case ControlResponse.Pong.id:
                        this.pong.client_addr = response.data.client_addr;
                        this.pong.tunnel_addr = response.data.tunnel_addr;

                        if (response.data.session_expire_at) this.session_expires = response.data.session_expire_at;
                        this.current_ping = (response.data.server_now - response.data.request_now);
                        console.log('ping:', this.current_ping + 'ms');

                        if (!this.session_id) this.authenticate();
                    break;
                    case ControlResponse.RequestQueued.id:
                        if (!this.last_auth || (this.last_auth?.request_id !== response.request_id)) {
                            console.log('returned to auth')
                            return this.authenticate();
                        }
                        
                        setTimeout(() => {
                            this.last_auth.request_id = this.request_id;
                            
                            const buffer = this.last_auth.toBuffer();
                            this.send(buffer);
                        }, 1000)
                    break;
                    case ControlResponse.AgentRegistered.id:
                        this.session_expires = response.data.expires_at;
                        this.session_id = response.data.session;
                        console.log('authed')
                    break;
                    default:
                        console.log('unknown', response)
                    break;
                }
            break;
            default:
                console.trace('unknown control feed type', feedType, message);
            break;
        }
    }
    send(buffer) {
        this.request_id++;

        this.socket.send(buffer, 0, buffer.length, this.control.port, this.control.addr, (err) => {
            if (err) return console.log(err);
        });
    }
}

module.exports = ControlChannel;