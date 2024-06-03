const ControlMessages = require('./control');
const dgram = require('dgram');
const ControlRpcMessage = require('./controlMsg');


class Channel {
    constructor(controlAddress) {
        this.version = '0.0.1'

        this.socket = dgram.createSocket('udp4');
        this.controlAddress = controlAddress;
        this.port = 5525;

        //temp
        this.sessionId = null
        this.currentPing = 0
        this.requestId = 1

        this.socket.addListener('listening', () => this.onListening());
        this.socket.addListener('message', (...args) => this.onMessage(...args));
    }
    onListening(args) {

        this.ping();
        console.log('pingged')
    }
    onMessage(msg, rinfo) {
        console.log('GOT MESSAGE', msg, rinfo)
    }
    start() {
        // const lis = this.ping
        // this.socket.on('listening', function (buffer, rinfo) {
        //     lis();
        // })

        this.socket.bind();
    }
    ping() {
        const msg = new ControlMessages.Ping();
        msg.now = Date.now();
        msg.sessionId = this.sessionId;
        msg.currentPing = this.currentPing;
        const test = new ControlRpcMessage(this.id(), msg)
        this.send(test)
       //console.log('ping')
    }
    send(data) {
        const buffer = Buffer.alloc(1024);
        data.writeTo(buffer);

        console.log('hex', buffer.toString('hex'))

        console.log(buffer, 0, buffer.length, this.port, this.controlAddress)
        this.socket.send(buffer, 0, buffer.length, this.port, this.controlAddress, (err) => {
            console.log(err)
        })
    }
    onMessage(buffer, rinfo) {
        decode(buffer)
        //console.log(buffer, rinfo)
    }
    id() {
        const val = this.requestId;
        this.requestId++
        return val;
    }
}

const channel = new Channel('209.25.140.1');
channel.start();

function decode(buffer = Buffer.alloc(22)) {
    let offset = 0
    const feedType = buffer.readInt32BE(0);
    offset += 4;

    /* response */
    if (feedType === 1) {
        const requestId = buffer.readBigInt64BE(offset);
        offset += 8;
        const messageType = buffer.readInt32BE(offset);
        offset += 4;

        switch (messageType) {
            case 1:
                let requestNow = buffer.readBigInt64BE(offset);
                offset += 8;
                let serverNow = buffer.readBigInt64BE(offset);
                offset += 8;
                let serverId = buffer.readBigInt64BE(offset);
                offset += 8;
                let dataCenterId = buffer.readInt32BE(offset);
                offset += 4;
                console.log(requestNow, serverNow, serverId, dataCenterId)
                // this.clientAddr = readInet(buffer);
                // this.tunnelAddr = readInet(buffer);
            break;
            default:

            break;
        }
    } else if (feedType == 2) {

    }
    // switch (feedType) {
    //     case 1:
    //         const requestNow = buffer.readBigInt64BE(offset);
    //         offset += 8;
    //         const serverNow = buffer.readBigInt64BE(offset);
    //         offset += 8;
    //         const serverId = buffer.readBigInt64BE(offset);
    //         offset += 8;
    //         console.log(requestNow, serverNow, serverId)

    //     break;
    //     default:
    //         console.log(id)
    //     break;
    // }
}

// let offset = 0;
// const buffer = Buffer.alloc(22);

// const id = 3000
// const time = Date.now()

// offset = buffer.writeBigInt64BE(BigInt(id), offset);
// offset = buffer.writeInt32BE(6, offset);
// offset = buffer.writeBigInt64BE(BigInt(time), offset);

// console.log(buffer.toString('hex'))

// const t = buffer.readBigInt64BE(0);

// const t2 = buffer.readInt32BE(8);
// const t3 = buffer.readBigInt64BE(12);
// console.log(Number(t), t2, t3)