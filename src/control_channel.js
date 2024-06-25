const EventEmitter = require('events');
const { ControlRpcMessage, ControlRequest, ControlResponse, ControlFeed } = require('./control_messages.js');
const dgram = require('dgram');
const net = require('net');
const API = require('./api');

async function find_channel(addresses) {
    for (const address of addresses) {
        //console.log('trying to establish tunnel connection')
        let is_ip6 = net.isIPv6(address);
        if (!is_ip6) return { addr: address, type: 4 };
    }
}

class Channel extends EventEmitter {
    constructor() {
        super();

        this.control = { addr: '', port: 5525, type: '' };

        this.started = null;
        this.session_id = null;
        this.last_ping = 0;
        this.last_keep_alive = 0;
        this.last_udp_auth = 0;
        this.current_ping = 0;
        this.request_id = 1;

        this.socket = null;
    }
    start() {
        this.started = Date.now();
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
    initSocket() {
        //add old logic here
        this.socket = dgram.createSocket('udp' + this.control.type);

        this.socket.addListener('message', (...args) => this.onMessage(...args));
        this.socket.addListener('listening', () => this.onListening());

        this.socket.bind();
    }
    refresh_control() {
        this.emit('refresh_control', async (address) => {
            const control = await find_channel(address);
            
            if (control.addr !== this.control.addr) {
                this.control.addr = control.addr;
                this.control.type = control.type;

                this.initSocket();
            }
        });
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
                        this.current_ping = (response.data.server_now - response.data.request_now);
                        console.log('ping:', this.current_ping + 'ms');
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

const channel = new Channel();

const api = new API('3a1095277c7c367fd66fb3fffd78bace9ec731d9d5b05ec790ce7754f76b7d94');

channel.on('refresh_control', async (callback) => {
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

channel.start()