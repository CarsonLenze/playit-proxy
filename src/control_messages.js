const utils = require('./utils.js');

class Message {
    constructor(args) {
        this.id = this.constructor.id;
        for (const key in args) this[key] = args[key];
    }
}

//ControlRequest

//ControlResponse

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

        console.log(buffer.length, offset)
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
        if (this.session_id !== null) {
            const buffer = utils.AgentSessionId.writeTo(this.session_id);
            // const json = utils.AgentSessionId.readFrom(buffer, 0);
            // console.log(buffer, json)
            buffers.push(buffer);
        }
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

        data.session = utils.AgentSessionId.readFrom(buffer, offset);
        offset += 24;

        data.expires_at = Number(
            buffer.readBigInt64BE(offset)
        );
        offset += 8;

        return data
    }
}



// class NewClient extends Message {
//     static id = 20;

//     constructor(args) {
//         super(args);
//     }

//     readFrom(buffer, offset) {
//         const data = new Object();

//         data.connect_addr = utils.readAddress(buffer, offset);
//         offset += (data.connect_addr.type === 4 ? 7 : 19);

//         data.peer_addr = utils.readAddress(buffer, offset);
//         offset += (data.peer_addr.type === 4 ? 7 : 19);

//         data.claim_instructions = {}

//         data.claim_instructions.address = utils.readAddress(buffer, offset);
//         offset += (data.claim_instructions.address.type === 4 ? 7 : 19);

//         const length = Number(
//             buffer.readBigInt64BE(offset)
//         );
//         offset += 8;

//         const token = buffer.slice(offset, offset + length);
//         data.claim_instructions.token = token
//         //.toString('hex');
//         offset += length;

//         data.tunnel_server_id = Number(
//             buffer.readBigInt64BE(offset)
//         );
//         offset += 8;

//         data.data_center_id = buffer.readInt32BE(offset)
//         offset += 4;

//         return data
//     }
// }

/*
connect_addr: SocketAddr::read_from(read)?,
            peer_addr: SocketAddr::read_from(read)?,
            claim_instructions: ClaimInstructions::read_from(read)?,
            tunnel_server_id: read.read_u64::<BigEndian>()?,
            data_center_id: read.read_u32::<BigEndian>()?,
*/

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
        const feedType = this.content.readInt32BE();
        this.offset += 4;

        if (feedType == 1) {
            this.request_id = Number(
                this.content.readBigInt64BE(this.offset)
            );
            this.offset += 8;
            const message_id = this.content.readInt32BE(this.offset);
            this.offset += 4;

            let data = {};
            switch (message_id) {
                case ControlRequest.Pong.id:
                    const pong = new ControlRequest.Pong();
                    data = pong.readFrom(this.content, this.offset);
                    break;
                case ControlRequest.AgentRegistered.id:
                    const agentRegistered = new ControlRequest.AgentRegistered();
                    data = agentRegistered.readFrom(this.content, this.offset);
                    break;
                case ControlRequest.UdpChannelDetails.id:
                    const udpChannelDetails = new ControlRequest.UdpChannelDetails();
                    data = udpChannelDetails.readFrom(this.content, this.offset);
                    break;
                case ControlRequest.RequestQueued.id:
                    break;
                default:
                    console.log('unknow: ', message_id)
            }
            data.id = message_id;

            return data;
        }
        /* new client */
        // else if (feedType == 2) {
        //     let data = {};

        //     const newClient = new ControlRequest.NewClient();
        //     data = newClient.readFrom(this.content, this.offset);

        //     data.id = 20;

        //     return data;
        // }
  }
}

const ControlRequest = {
    Pong: Pong, /* 1 */
    RequestQueued: RequestQueued, /* 4 */
    SetupUdpChannel: SetupUdpChannel, /* 4 */
    AgentRegistered: AgentRegistered, /* 6 */
    Ping: Ping, /* 6 */
    UdpChannelDetails: UdpChannelDetails, /* 8 */
    // NewClient: NewClient
}

const ControlResponse = {
    [Pong.id]: Pong,
    Pong: Pong, /* 1 */
}

class Response extends Message {
    static id = 1;

    constructor(args) {
        super(args);

        this.offset = 0;
    }
    toJSON() {
        const response = new Object();

        this.request_id = Number(this.content.readBigInt64BE(this.offset));
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