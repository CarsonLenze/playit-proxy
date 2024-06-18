const dgram = require('dgram');
const fetchData = require('.');

const utils = {
    writeBigInt64BE: (value) => {
        const buf = Buffer.alloc(8);
        buf.writeBigInt64BE(value);
        return buf;
    },
    writeInt32BE: (value) => {
        const buf = Buffer.alloc(4);
        buf.writeInt32BE(value);
        return buf;
    },
    readAddress: (buffer, offset) => {
        const type = buffer.readUInt8(offset);
        let address;
        offset += 1;

        if (type === 4) {
            const ip_parts = buffer.slice(offset, offset + 4);
            address = Array.from(ip_parts).join('.');
            offset += 4;
        } else if (type === 6) {
            const ip_parts = buffer.slice(offset, offset + 16);
            address = Array.from(ip_parts).join(':');
            offset += 16;
        } else return console.error("unknown ip type", type);

        const port = buffer.readUInt16BE(offset);
        offset += 2;

        return {
            type: type,
            address: address,
            port: port
        }
    },
    AgentSessionId: {
        readFrom(buffer, offset) {
            const data = new Object();

            data.session_id = Number(
                buffer.readBigInt64BE(offset)
            );
            offset += 8;
    
            data.account_id = Number(
                buffer.readBigInt64BE(offset)
            );
            offset += 8;
    
            data.agent_id = Number(
                buffer.readBigInt64BE(offset)
            );
            offset += 8;

            return data;
        }
    }
}

class Message {
    constructor(args) {
        this.id = this.constructor.id;
        for (const key in args) this[key] = args[key];
    }
}

class Pong extends Message {
    static id = 1;

    constructor(args) {
        super(args);
    }

    readFrom(buffer, offset) {
        const data = new Object();

        data.request_now = Number(
            buffer.readBigInt64BE(offset)
        );
        offset += 8;

        data.server_now = Number(
            buffer.readBigInt64BE(offset)
        );
        offset += 8;

        data.server_id = Number(
            buffer.readBigInt64BE(offset)
        );
        offset += 8;

        data.data_center_id = buffer.readInt32BE(offset)
        offset += 4;

        data.client_addr = utils.readAddress(buffer, offset);
        offset += (data.client_addr.type === 4 ? 7 : 19);

        data.tunnel_addr = utils.readAddress(buffer, offset);
        offset += (data.tunnel_addr.type === 4 ? 7 : 19);

        //session_expire_at: Option::read_from(read)?,
        return data;
    }
}

class Ping extends Message {
    static id = 6;

    constructor(args) {
        super(args);
    }

    writeTo() {
        let buffers = [];

        buffers.push(utils.writeBigInt64BE(BigInt(this.now)))
        if (this.current_ping !== null) buffers.push(utils.writeInt32BE(this.current_ping))
        // if (this.session_id !== null)
        return Buffer.concat(buffers);
    }
}

class RequestQueued extends Message {
    static id = 4;

    constructor(args) {
        super(args);
    }

    writeTo() {
        let buffers = [];

        buffers.push(utils.writeBigInt64BE(BigInt(this.now)))
        if (this.current_ping !== null) buffers.push(utils.writeInt32BE(this.current_ping))
        // if (this.session_id !== null)
        return Buffer.concat(buffers);
    }
}


class AgentRegistered extends Message {
    static id = 6;

    constructor(args) {
        super(args);
    }

    readFrom(buffer, offset) {
        const data = new Object();

        data.agent = utils.AgentSessionId.readFrom(buffer, offset);
        offset += 24;

        data.expires_at = Number(
            buffer.readBigInt64BE(offset)
        );
        offset += 8;

        return data
    }
}

const ControlRequest = {
    Pong: Pong, /* 1 */
    RequestQueued: RequestQueued, /* 4 */
    AgentRegistered: AgentRegistered, /* 6 */
    Ping: Ping /* 6 */
}

class ControlRpcMessage {
    constructor({ request_id = null, content }) {
        this.request_id = request_id;
        this.content = content;
        this.offset = 0;
    }
    toBuffer() {
        const request_id = utils.writeBigInt64BE(BigInt(this.request_id));
        if (this?.content?.constructor?.id) {
            const event_id = utils.writeInt32BE(this.content.constructor.id);

            const data = this.content.writeTo();

            const buffer = Buffer.concat([request_id, event_id, data]);
            return buffer;
        } else {
            const buffer = Buffer.concat([request_id, this.content]);
            return buffer;
        }
    }
    toJSON() {
        const rand = this.content.readInt32BE();
        this.offset += 4;

        this.request_id = Number(
            this.content.readBigInt64BE(this.offset)
        );
        this.offset += 8;
        const id = this.content.readInt32BE(this.offset);
        this.offset += 4;

        let data = {};
        switch (id) {
            case ControlRequest.Pong.id:
                const pong = new ControlRequest.Pong();
                data = pong.readFrom(this.content, this.offset);
                console.log('ping:', (data.server_now - data.request_now) + 'ms')
            break;
            case ControlRequest.RequestQueued.id:
                data = { wait: true }
            break;
            case ControlRequest.AgentRegistered.id:
                const agentRegistered = new ControlRequest.AgentRegistered();
                data = agentRegistered.readFrom(this.content, this.offset);
                break;
            default:
                console.log('unknow: ', id)
        }
        data.id = id;
        data.rand = rand;
        //console.log(rand)

        return data;
    }
}

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