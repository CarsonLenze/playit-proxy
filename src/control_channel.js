const { ControlRpcMessage, ControlRequest, ControlResponse, ControlFeed } = require('./control_messages.js');
const utils = require('./control_utils.js');
const EventEmitter = require('events');
const dgram = require('dgram');

class ControlChannel extends EventEmitter {
    constructor() {
        super();

        this.control = { addr: null, port: 5525, type: null, server_id: null, dc_id: null, tunnel_name: null };
        this.pong = { client_addr: null, tunnel_addr: null }

        this.session_expires = null;
        this.session_id = null;
        this.last_ping = 0;
        this.last_auth = null;
        this.last_keep_alive = 0;
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
    keep_alive() {
        console.log('keep alive');
        const now = Date.now();
        this.last_keep_alive = now;

        const message = new ControlRpcMessage({
            request_id: this.request_id,
            content: new ControlRequest.AgentKeepAlive({
                session_id: this.session_id
            })
        });

        const buffer = message.toBuffer();
        console.log(buffer, message)
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
            const control = await utils.find_channel(address);
            
            if (control.addr !== this.control.addr) {
                this.control.addr = control.addr;
                this.control.type = control.type;

                const info = await utils.getDCInfo(control.addr, control.type);
                this.control.server_id = info.server_id;
                this.control.dc_id = info.dc_id;
                this.control.tunnel_name = info.tunnel_name;

                this.initSocket();
            }
        });
    }
    update() {
        const now = Date.now();

        //ping
        if (now - this.last_ping > 1_000) this.ping();

        //keep alive
        if (10_000 < (now - this.last_keep_alive) && (this.session_expires - now) < 30_000) this.keep_alive();
    }
    initSocket() {
        //add old logic here
        this.socket = dgram.createSocket('udp' + this.control.type);

        this.socket.addListener('message', (...args) => this.onMessage(...args));
        this.socket.addListener('listening', () => this.onListening());

        this.socket.bind();
    }
    get_udp_channel() {
        const message = new ControlRpcMessage({
            request_id: this.request_id,
            content: new ControlRequest.SetupUdpChannel({
                session_id: this.session_id
            })
        });

        const buffer = message.toBuffer();
        this.send(buffer);
    }
    onListening() {
        console.log('Control Channel Connected to', this.control.tunnel_name, 'with IP:', this.control.addr);

        this.ping();
    }
    onMessage(buffer, rinfo) {
        //make sure control channel ip is correct and no man in the middle attacks

        const feedType = buffer.readInt32BE();
        const message = buffer.subarray(4);
        
        switch (feedType) {
            case ControlFeed.NewClient.id:
                const client = new ControlFeed.NewClient({ content: message });
                const data = client.toJSON();
                this.emit('new_tcp_client', data);
            break;
            case ControlFeed.Response.id:
                
                const feed = new ControlFeed.Response({ content: message });
                const response = feed.toJSON();

                // console.log(response)

                switch (response.id) {
                    case ControlResponse.Pong.id:
                        this.pong.client_addr = response.data.client_addr;
                        this.pong.tunnel_addr = response.data.tunnel_addr;

                        if (response.data.session_expire_at) this.session_expires = response.data.session_expire_at;
                        this.current_ping = (response.data.server_now - response.data.request_now);

                        console.log('ping:', this.current_ping + 'ms', this.session_expires);

                        if (!this.session_id) this.authenticate();
                        this.emit('ping', response);
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
                        let first_auth = false
                        if (!this.session_id) first_auth = true;

                        this.session_expires = response.data.expires_at;
                        this.session_id = response.data.session;
                        
                        if (first_auth) this.emit('authenticated', response);
                    break;
                    case ControlResponse.UdpChannelDetails.id:
                        console.log('udp channel', response)
                        //setup udp channel here but not clients.
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