const utils = require('./utils.js');

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

        return data;
    }
}

module.exports = {
    ControlRequest: ControlRequest,
    ControlRpcMessage: ControlRpcMessage
}