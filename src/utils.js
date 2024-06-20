const os = require('os');

function getPlatform() {
    const values = { 'Darwin': 'macos' };
    const key = os.type();

    return values[key];
}

function writeBigInt64BE(value) {
    const buf = Buffer.alloc(8);
    buf.writeBigInt64BE(value);
    return buf;
}

function writeInt32BE(value) {
    const buf = Buffer.alloc(4);
    buf.writeInt32BE(value);
    return buf;
}

function formatAddress({ type = 4, address, port }) {
    if (type === 6) address = `[${address}]`;
    return [address, port].join(':');
}

function readAddress(buffer, offset) {
    const type = buffer.readUInt8(offset);
    let address;
    offset += 1;

    if (type === 4) {
        const ip_parts = buffer.slice(offset, offset + 4);
        address = Array.from(ip_parts).join('.');
        offset += 4;
    } else if (type === 6) {
        const ip_parts = buffer.slice(offset, offset + 16);
        address = Array.from({ length: 8 }, (_, i) => ip_parts.readUInt16BE(i * 2).toString(16)).join(':');
        address = address.replace(/(^|:)0(:0)*:0(:|$)/, '$1::$3').replace(/:{3,4}/, '::');
        offset += 16;

    } else return console.trace("unknown ip type", type);

    const port = buffer.readUInt16BE(offset);
    offset += 2;

    return {
        type: type,
        address: address,
        port: port
    }
}

const AgentSessionId = {
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
    },
    writeTo(session) {
        const buf = Buffer.alloc(24);

        //session_id
        buf.writeBigInt64BE(BigInt(session.session_id), 0);

        //account_id
        buf.writeBigInt64BE(BigInt(session.account_id), 8);

        //agent_id
        buf.writeBigInt64BE(BigInt(session.agent_id), 16);
        
        return buf;
    }
}

module.exports = {
    writeBigInt64BE: writeBigInt64BE,
    writeInt32BE: writeInt32BE,
    readAddress: readAddress,
    AgentSessionId: AgentSessionId,
    getPlatform: getPlatform,
    formatAddress: formatAddress
}