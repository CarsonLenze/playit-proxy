const dgram = require('dgram');

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

const ControlRequest = {
    Pong: Pong, /* 1 */
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
        const event_id = utils.writeInt32BE(this.content.constructor.id);

        const data = this.content.writeTo();

        const buffer = Buffer.concat([request_id, event_id, data]);
        return buffer;
    }
    toJSON() {
        const id = this.content.readInt32BE();
        this.offset += 4;

        this.request_id = Number(
            this.content.readBigInt64BE(this.offset)
        );
        this.offset += 8;
        const rand = this.content.readInt32BE(this.offset);
        this.offset += 4;

        let data = {};
        switch (id) {
            case ControlRequest.Pong.id:
                const pong = new ControlRequest.Pong();
                data = pong.readFrom(this.content, this.offset);
                console.log('ping:', (data.server_now - data.request_now) + 'ms')
            break;
            default:
                console.log('unknow: ', id)
        }

        console.log(data);
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

        this.socket.addListener('message', (...args) => this.onMessage(...args));
        this.socket.addListener('listening', () => this.onListening());
    }
    start() {
        this.socket.bind();
    }
    onListening() {
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
        //console.log('GOT MESSAGE', msg, rinfo)
    }
    send(buffer) {
        this.socket.send(buffer, 0, buffer.length, this.port, this.controlAddress, (err) => {
            if (err) console.log(err)
        });
    }
}

const channel = new Channel('209.25.140.1');
channel.start()