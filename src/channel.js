const dgram = require('dgram');
const fetchData = require('.');

const { ControlRpcMessage, ControlRequest } = require('./control_messages.js')

class Channel {
    constructor(controlAddress) {
        this.version = '0.0.1'

        this.socket = dgram.createSocket('udp4');
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
        if (rinfo.address !== this.controlAddress || rinfo.port !== this.port) return console.error('Got message from invalid address', rinfo);

        const message = new ControlRpcMessage({ content: msg });
        const data = message.toJSON();

        if (data.id === ControlRequest.Pong.id) {
            this.pong.client_addr = data.client_addr.address + ':' + data.client_addr.port;
            this.pong.tunnel_addr = data.tunnel_addr.address + ':' + data.tunnel_addr.port;
        } else if (data.id === ControlRequest.AgentRegistered.id) {
            this.agent = data.agent;
            console.log('authenticated')
        }

        if (data?.wait) {
            setTimeout(() => {
                this.lastSend.writeBigInt64BE(BigInt(this.request_id), 0);
                this.send(this.lastSend);
            }, 500)
            return;
        }

        if (data && this.state === 'listening') {
            this.state = 'authenticating'
            this.authenticate(data)
        }

        //console.log('GOT MESSAGE', msg, rinfo, data)
    }
    send(buffer) {
        this.request_id++
        this.socket.send(buffer, 0, buffer.length, this.port, this.controlAddress, (err) => {
            if (err) return console.log(err);
            this.lastSend = buffer;
        });
    }
    async authenticate() {
        const test = await fetchData();

        const body = {
            "agent_version": {
              "version": {
                "platform": "macos",
                "version": "0.0.1"
              },
              "official": false,
              "details_website": "https://google.com"
            },
            "client_addr": this.pong.client_addr,
            "tunnel_addr": this.pong.tunnel_addr
          }

        const proto = await test.api.execute('/proto/register', body);
        if (proto.status !== 'success') return console.trace(proto);

        const message = new ControlRpcMessage({
            request_id: this.request_id,
            content: Buffer.from(proto?.data?.key, 'hex')
        });

        const buffer = message.toBuffer();
        this.send(buffer);
    }
}

const channel = new Channel('209.25.140.1');
channel.start()