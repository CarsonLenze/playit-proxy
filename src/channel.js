const { ControlRpcMessage, ControlRequest } = require('./control_messages.js');
const dgram = require('dgram');

class Channel {
    constructor(controlAddress) {
        this.socket = dgram.createSocket('udp6');
        this.controlAddress = controlAddress;
        this.port = 5525;

        //temp
        this.session_id = null
        this.current_ping = 0
        this.request_id = 1
        this.state = 'offline'

        this.pong = {
            client_addr: null,
            tunnel_addr: null
        }

        this.lastSend = null;
        this.agent = null;

        this.socket.addListener('message', (...args) => this.onMessage(...args));
        this.socket.addListener('listening', () => this.onListening());

        this.authCallback = null
    }
    start() {
        this.socket.bind();
    }
    onListening() {
        this.state = 'listening'
        console.log('Tunnel started listening');

        const message = new ControlRpcMessage({
            request_id: this.request_id,
            content: new ControlRequest.Ping({
                now: Date.now(),
                current_ping: this.current_ping,
                session_id: this.session_id
            })
        });

        const buffer = message.toBuffer();
        this.send(buffer);
    }
    onMessage(msg, rinfo) {
        if (rinfo.address !== this.controlAddress || rinfo.port !== this.port) return console.trace('Got message from invalid address', rinfo);

        const message = new ControlRpcMessage({ content: msg });
        const data = message.toJSON();

        if (data.id === ControlRequest.AgentRegistered.id) {
            this.agent = data.agent;
            console.log('authenticated')
        } else if (data.id === ControlRequest.Pong.id) {
            this.pong.client_addr = data.client_addr;
            this.pong.tunnel_addr = data.tunnel_addr;
        }

        if (data?.wait) {
            setTimeout(() => {
                this.lastSend.writeBigInt64BE(BigInt(this.request_id), 0);
                this.send(this.lastSend);
            }, 500)
            return;
        }

        if (data && this.state === 'listening') {
            this.state = 'authenticating';
            Promise.all([this.authCallback(this.pong)])
                .then(([key]) => {
                    const message = new ControlRpcMessage({
                        request_id: this.request_id,
                        content: Buffer.from(key, 'hex')
                    });

                    const buffer = message.toBuffer();
                    this.send(buffer);
                })
        }
    }
    send(buffer) {
        this.request_id++
        this.socket.send(buffer, 0, buffer.length, this.port, this.controlAddress, (err) => {
            if (err) return console.log(err);
            this.lastSend = buffer;
        });
    }
    onAuthenticate(cb) {
        this.authCallback = cb
    }
}

module.exports = Channel