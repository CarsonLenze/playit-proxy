const net = require('net');

class ControlMessages {
    static ResponseErrorCode = {
        InvalidSignature: 0,
        Unauthorized: 1,
        RequestQueued: 2,
        TryAgainLater: 3
    };

    static readInet(buffer) {
        const version = buffer.readUInt8();
        let ip;
        if (version === 4) {
            ip = buffer.slice(1, 5);
        } else if (version === 6) {
            ip = buffer.slice(1, 17);
        } else {
            throw new Error('invalid ip proto version: ' + version);
        }
        const port = buffer.readUInt16BE(version === 4 ? 5 : 17);
        return new net.SocketAddress({address: ip.join('.'), port});
    }

    static writeInet(buffer, addr) {
        const ip = addr.address.split('.');
        if (ip.length === 4) {
            buffer.writeUInt8(4);
        } else {
            buffer.writeUInt8(6);
        }
        buffer.write(ip.join(''), 'binary');
        buffer.writeUInt16BE(addr.port);
    }

    static Message = class {
        writeTo(buffer) {
            throw new Error("Not implemented");
        }

        readFrom(buffer) {
            throw new Error("Not implemented");
        }
    };

    static ControlRequest = class extends ControlMessages.Message {
        writeId(buffer) {
            throw new Error("Not implemented");
        }
    };

    static Ping = class extends ControlMessages.ControlRequest {
        constructor(now, currentPing, sessionId) {
            super();
            this.now = now;
            this.currentPing = currentPing;
            this.sessionId = sessionId;
        }

        writeId(buffer, offset) {
            console.log(offset)
            offset = buffer.writeInt32BE(6, offset);
            return offset;
        }

        writeTo(buffer, offset) {
            offset = buffer.writeBigInt64BE(BigInt(this.now), offset);
            offset = buffer.writeUInt8(this.currentPing === 0 ? 0 : 1, offset);
            if (this.currentPing !== 0) {
                offset = buffer.writeInt32BE(this.currentPing, offset);
            }
            offset = buffer.writeUInt8(this.sessionId ? 1 : 0, offset);
            if (this.sessionId) {
                this.sessionId.writeTo(buffer);
            }
            return offset;
        }

        readFrom(buffer) {
            this.now = buffer.readBigInt64BE();
            this.currentPing = buffer.readUInt8() === 0 ? 0 : buffer.readInt32BE();
            this.sessionId = buffer.readUInt8() === 0 ? null : new ControlMessages.AgentSessionId().readFrom(buffer);
        }
    };

    static AgentRegister = class extends ControlMessages.ControlRequest {
        constructor(accountId, agentId, agentVersion, timestamp, clientAddr, tunnelAddr, signature) {
            super();
            this.accountId = accountId;
            this.agentId = agentId;
            this.agentVersion = agentVersion;
            this.timestamp = timestamp;
            this.clientAddr = clientAddr;
            this.tunnelAddr = tunnelAddr;
            this.signature = signature;
        }

        writeId(buffer) {
            buffer.writeInt32BE(2);
        }

        writeTo(buffer) {
            buffer.writeBigInt64BE(BigInt(this.accountId));
            buffer.writeBigInt64BE(BigInt(this.agentId));
            buffer.writeBigInt64BE(BigInt(this.agentVersion));
            buffer.writeBigInt64BE(BigInt(this.timestamp));
            ControlMessages.writeInet(buffer, this.clientAddr);
            ControlMessages.writeInet(buffer, this.tunnelAddr);
            buffer.write(this.signature);
        }

        readFrom(buffer) {
            this.accountId = buffer.readBigInt64BE();
            this.agentId = buffer.readBigInt64BE();
            this.agentVersion = buffer.readBigInt64BE();
            this.timestamp = buffer.readBigInt64BE();
            this.clientAddr = ControlMessages.readInet(buffer);
            this.tunnelAddr = ControlMessages.readInet(buffer);
            this.signature = buffer.slice(buffer.offset, buffer.offset + 32);
        }
    };

    static AgentKeepAlive = class extends ControlMessages.ControlRequest {
        constructor(sessionId) {
            super();
            this.sessionId = sessionId;
        }

        writeId(buffer) {
            buffer.writeInt32BE(3);
        }

        writeTo(buffer) {
            this.sessionId.writeTo(buffer);
        }

        readFrom(buffer) {
            this.sessionId = new ControlMessages.AgentSessionId().readFrom(buffer);
        }
    };

    static SetupUdpChannel = class extends ControlMessages.ControlRequest {
        constructor(sessionId) {
            super();
            this.sessionId = sessionId;
        }

        writeId(buffer) {
            buffer.writeInt32BE(4);
        }

        writeTo(buffer) {
            this.sessionId.writeTo(buffer);
        }

        readFrom(buffer) {
            this.sessionId = new ControlMessages.AgentSessionId().readFrom(buffer);
        }
    };

    static AgentCheckPortMapping = class extends ControlMessages.ControlRequest {
        constructor(sessionId, portRange) {
            super();
            this.sessionId = sessionId;
            this.portRange = portRange;
        }

        writeId(buffer) {
            buffer.writeInt32BE(4);
            this.sessionId.writeTo(buffer);
            this.portRange.writeTo(buffer);
        }

        writeTo(buffer) {
            this.sessionId.writeTo(buffer);
            this.portRange.writeTo(buffer);
        }

        readFrom(buffer) {
            this.sessionId = new ControlMessages.AgentSessionId().readFrom(buffer);
            this.portRange = new ControlMessages.PortRange().readFrom(buffer);
        }
    };

    static PortRange = class extends ControlMessages.Message {
        constructor(ip, portStart, portEnd, proto) {
            super();
            this.ip = ip;
            this.portStart = portStart;
            this.portEnd = portEnd;
            this.proto = proto;
        }

        writeTo(buffer) {
            buffer.writeUInt8(this.ip.includes(':') ? 6 : 4);
            buffer.write(this.ip.split('.').map(num => parseInt(num, 10)).join(''), 'binary');
            buffer.writeUInt16BE(this.portStart);
            buffer.writeUInt16BE(this.portEnd);
            this.proto.writeTo(buffer);
        }

        readFrom(buffer) {
            const ipVersion = buffer.readUInt8();
            const ipData = buffer.slice(1, ipVersion === 4 ? 5 : 17);
            this.ip = ipData.join('.');
            this.portStart = buffer.readUInt16BE(ipVersion === 4 ? 5 : 17);
            this.portEnd = buffer.readUInt16BE(ipVersion === 4 ? 7 : 19);
            this.proto = new ControlMessages.PortProto().readFrom(buffer);
        }
    };

    static PortProto = class extends ControlMessages.Message {
        constructor(proto) {
            super();
            this.proto = proto;
        }

        writeTo(buffer) {
            buffer.writeUInt8(this.proto === PortType.TCP ? 1 : this.proto === PortType.UDP ? 2 : 3);
        }

        readFrom(buffer) {
            const value = buffer.readUInt8();
            this.proto = value === 1 ? PortType.TCP : value === 2 ? PortType.UDP : value === 3 ? PortType.BOTH : null;
        }
    };

    static AgentSessionId = class extends ControlMessages.Message {
        constructor(sessionId, accountId, agentId) {
            super();
            this.sessionId = sessionId;
            this.accountId = accountId;
            this.agentId = agentId;
        }

        writeTo(buffer) {
            buffer.writeBigInt64BE(BigInt(this.sessionId));
            buffer.writeBigInt64BE(BigInt(this.accountId));
            buffer.writeBigInt64BE(BigInt(this.agentId));
        }

        readFrom(buffer) {
            this.sessionId = buffer.readBigInt64BE();
            this.accountId = buffer.readBigInt64BE();
            this.agentId = buffer.readBigInt64BE();
        }
    };

    static Pong = class extends ControlMessages.Message {
        constructor(requestNow, serverNow, serverId, dataCenterId, clientAddr, tunnelAddr, sessionExpireAt) {
            super();
            this.requestNow = requestNow;
            this.serverNow = serverNow;
            this.serverId = serverId;
            this.dataCenterId = dataCenterId;
            this.clientAddr = clientAddr;
            this.tunnelAddr = tunnelAddr;
            this.sessionExpireAt = sessionExpireAt;
        }

        writeTo(buffer) {
            buffer.writeBigInt64BE(BigInt(this.requestNow));
            buffer.writeBigInt64BE(BigInt(this.serverNow));
            buffer.writeBigInt64BE(BigInt(this.serverId));
            buffer.writeInt32BE(this.dataCenterId);
            ControlMessages.writeInet(buffer, this.clientAddr);
            ControlMessages.writeInet(buffer, this.tunnelAddr);
            buffer.writeUInt8(this.sessionExpireAt === 0 ? 0 : 1);
            if (this.sessionExpireAt !== 0) {
                buffer.writeBigInt64BE(BigInt(this.sessionExpireAt));
            }
        }

        readFrom(buffer) {
            this.requestNow = buffer.readBigInt64BE();
            this.serverNow = buffer.readBigInt64BE();
            this.serverId = buffer.readBigInt64BE();
            this.dataCenterId = buffer.readInt32BE();
            this.clientAddr = ControlMessages.readInet(buffer);
            this.tunnelAddr = ControlMessages.readInet(buffer);
            this.sessionExpireAt = buffer.readUInt8() === 0 ? 0 : buffer.readBigInt64BE();
        }
    };

    static AgentRegistered = class extends ControlMessages.Message {
        constructor(sessionId, expiresAt) {
            super();
            this.sessionId = sessionId;
            this.expiresAt = expiresAt;
        }

        writeTo(buffer) {
            this.sessionId.writeTo(buffer);
            buffer.writeBigInt64BE(BigInt(this.expiresAt));
        }

        readFrom(buffer) {
            this.sessionId = new ControlMessages.AgentSessionId().readFrom(buffer);
            this.expiresAt = buffer.readBigInt64BE();
        }
    };

    static AgentPortMapping = class extends ControlMessages.Message {
        constructor(portRange, target) {
            super();
            this.portRange = portRange;
            this.target = target;
        }

        writeTo(buffer) {
            this.portRange.writeTo(buffer);
            buffer.writeUInt8(this.target ? 1 : 0);
            if (this.target) {
                buffer.writeInt32BE(1);
                this.target.writeTo(buffer);
            }
        }

        readFrom(buffer) {
            this.portRange = new ControlMessages.PortRange().readFrom(buffer);
            this.target = buffer.readUInt8() === 0 ? null : new ControlMessages.AgentSessionId().readFrom(buffer);
        }
    };

    static UdpChannelDetails = class extends ControlMessages.Message {
        constructor(tunnelAddress, token) {
            super();
            this.tunnelAddress = tunnelAddress;
            this.token = token;
        }

        writeTo(buffer) {
            ControlMessages.writeInet(buffer, this.tunnelAddress);
            buffer.writeBigInt64BE(BigInt(this.token.length));
            buffer.write(this.token);
        }

        readFrom(buffer) {
            this.tunnelAddress = ControlMessages.readInet(buffer);
            const length = buffer.readBigInt64BE();
            if (length > Number.MAX_SAFE_INTEGER) {
                throw new Error("token length too long");
            }
            this.token = buffer.slice(buffer.offset, buffer.offset + Number(length));
        }
    };

    static NewClient = class extends ControlMessages.Message {
        constructor(connectAddr, peerAddr, claimInstructions, tunnelServerId, dataCenterId) {
            super();
            this.connectAddr = connectAddr;
            this.peerAddr = peerAddr;
            this.claimInstructions = claimInstructions;
            this.tunnelServerId = tunnelServerId;
            this.dataCenterId = dataCenterId;
        }

        writeTo(buffer) {
            ControlMessages.writeInet(buffer, this.connectAddr);
            ControlMessages.writeInet(buffer, this.peerAddr);
            this.claimInstructions.writeTo(buffer);
            buffer.writeBigInt64BE(BigInt(this.tunnelServerId));
            buffer.writeInt32BE(this.dataCenterId);
        }

        readFrom(buffer) {
            this.connectAddr = ControlMessages.readInet(buffer);
            this.peerAddr = ControlMessages.readInet(buffer);
            this.claimInstructions = new ControlMessages.ClaimInstructions().readFrom(buffer);
            this.tunnelServerId = buffer.readBigInt64BE();
            this.dataCenterId = buffer.readInt32BE();
        }
    };

    static ClaimInstructions = class extends ControlMessages.Message {
        constructor(address, token) {
            super();
            this.address = address;
            this.token = token;
        }

        writeTo(buffer) {
            ControlMessages.writeInet(buffer, this.address);
            buffer.writeBigInt64BE(BigInt(this.token.length));
            buffer.write(this.token);
        }

        readFrom(buffer) {
            this.address = ControlMessages.readInet(buffer);
            const len = buffer.readBigInt64BE();
            if (len > Number.MAX_SAFE_INTEGER) {
                throw new Error("claim token too long: " + len);
            }
            this.token = buffer.slice(buffer.offset, buffer.offset + Number(len));
        }
    };
}

module.exports = ControlMessages;
