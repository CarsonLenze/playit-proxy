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

        const bool = buffer.readUInt8(offset);
        offset += 1;

        if (bool == 1) {
            data.session_expire_at = Number(
                buffer.readBigInt64BE(offset)
            );
            offset += 8;
        }

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

        if (this.current_ping !== null) {
            buffers.push(utils.writeUInt8(1))
            buffers.push(utils.writeInt32BE(this.current_ping))
        } else buffers.push(utils.writeUInt8(0));

        if (this.session_id !== null) {
            buffers.push(utils.writeUInt8(1))
            const buffer = utils.AgentSessionId.writeTo(this.session_id);
            buffers.push(buffer)
        } else buffers.push(utils.writeUInt8(0));

        return Buffer.concat(buffers);
    }
}

class SetupUdpChannel extends Message {
    static id = 4;

    constructor(args) {
        super(args);
    }

    writeTo() {
        return utils.AgentSessionId.writeTo(this.session_id);
    }
}

class UdpChannelDetails extends Message {
    static id = 8;

    constructor(args) {
        super(args);
    }

    readFrom(buffer, offset) {
        const data = new Object();

        data.tunnel_addr = utils.readAddress(buffer, offset);
        offset += (data.tunnel_addr.type === 4 ? 7 : 19);

        const length = Number(
            buffer.readBigInt64BE(offset)
        );
        offset += 8;

        const token = buffer.slice(offset, offset + length);
        data.token = token
        //.toString('hex');
        offset += length;

        return data;
    }
}

class RequestQueued extends Message {
    static id = 4;

    constructor(args) {
        super(args);
    }

    readFrom(buffer, offset) {
        return new Object()
    }
}

class AgentRegistered extends Message {
    static id = 6;

    constructor(args) {
        super(args);
    }

    readFrom(buffer, offset) {
        const data = new Object();

        data.session = utils.AgentSessionId.readFrom(buffer, offset);
        offset += 24;

        data.expires_at = Number(
            buffer.readBigInt64BE(offset)
        );
        offset += 8;

        return data
    }
}

class ControlRpcMessage {
    constructor({ request_id = null, content }) {
        this.request_id = request_id;
        this.content = content;
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
}

const ControlRequest = {
    Ping: Ping, /* 6 */
    SetupUdpChannel: SetupUdpChannel, /* 4 */
}

const ControlResponse = {
    [Pong.id]: Pong,
    [RequestQueued.id]: RequestQueued,
    [AgentRegistered.id]: AgentRegistered, /* 6 */
    Pong: Pong, /* 1 */
    RequestQueued: RequestQueued, /* 4 */
    AgentRegistered: AgentRegistered, /* 6 */
    // UdpChannelDetails: UdpChannelDetails, /* 8 */
}

class Response extends Message {
    static id = 1;

    constructor(args) {
        super(args);

        this.offset = 0;
    }
    toJSON() {
        const response = new Object();

        response.request_id = Number(this.content.readBigInt64BE(this.offset));
        this.offset += 8;

        response.id = this.content.readInt32BE(this.offset);
        this.offset += 4;

        if (!ControlResponse[response.id]) return null;
        const Event = new ControlResponse[response.id]();
        if (!Event) return null;

        response.name = Event.constructor.name;

        response.data = Event.readFrom(this.content, this.offset);
        if (!response.data) return null;

        return response;
    }
}

class NewClient extends Message {
    static id = 2;

    constructor(args) {
        super(args);

        this.offset = 0;
    }
    toJSON() {
        const data = new Object();

        data.connect_addr = utils.readAddress(this.content, this.offset);
        this.offset += (data.connect_addr.type === 4 ? 7 : 19);

        data.peer_addr = utils.readAddress(this.content, this.offset);
        this.offset += (data.peer_addr.type === 4 ? 7 : 19);

        data.claim_instructions = {};

        data.claim_instructions.address = utils.readAddress(this.content, this.offset);
        this.offset += (data.claim_instructions.address.type === 4 ? 7 : 19);

        const length = Number(
            this.content.readBigInt64BE(this.offset)
        );
        this.offset += 8;

        const token = this.content.slice(this.offset, this.offset + length);
        data.claim_instructions.token = token.toString('hex');
        this.offset += length;

        data.tunnel_server_id = Number(
            this.content.readBigInt64BE(this.offset)
        );
        this.offset += 8;

        data.data_center_id = this.content.readInt32BE(this.offset);
        this.offset += 4;

        return data;
    }
}

const ControlFeed = {
    Response: Response,
    NewClient: NewClient
}

module.exports = {
    ControlFeed: ControlFeed,
    ControlRequest: ControlRequest,
    ControlResponse: ControlResponse,
    ControlRpcMessage: ControlRpcMessage
}