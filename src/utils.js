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
    }
}

module.exports = {
    writeBigInt64BE: writeBigInt64BE,
    writeInt32BE: writeInt32BE,
    readAddress: readAddress,
    AgentSessionId: AgentSessionId,
}