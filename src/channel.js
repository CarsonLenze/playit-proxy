const { ControlRpcMessage, ControlRequest } = require('./control_messages.js');
const EventEmitter = require('events');
const dgram = require('dgram');

class Channel extends EventEmitter {
    constructor(controlAddress) {
        super();

        this.socket = dgram.createSocket('udp4');
        this.controlAddress = controlAddress;
        this.port = 5525;

        //temp
        this.session = null
        this.current_ping = 0
        this.request_id = 1;

        this.pong = null;

        this.authenticated = false;
        this.lastSend = null;

        this.updateInterval = null;
        this.last_control_update = null;

        this.control_addr = null;
        this.control_channel = null
        this.udp_tunnel = null;
        this.last_keep_alive = null;
        this.last_ping = null;
        this.last_pong = null;
        this.last_udp_auth = null;
        this.last_control_targets = null;

        this.connections = new Map();

        this.socket.addListener('message', (...args) => this.onMessage(...args));
        this.socket.addListener('listening', () => this.onListening());
    }
    start() {
        this.socket.bind();
    }
    ping() {
        const now = Date.now();
        this.last_ping = now;

        const message = new ControlRpcMessage({
            request_id: this.request_id,
            content: new ControlRequest.Ping({
                now: now,
                current_ping: this.current_ping,
                session_id: this.session
            })
        });

        const buffer = message.toBuffer();
        this.send(buffer);
    }
    onListening() {
        console.log('Tunnel started listening');

        this.ping();
    }
    setup() {
        const message = new ControlRpcMessage({
            request_id: this.request_id,
            content: new ControlRequest.SetupUdpChannel({
                session_id: this.session
            })
        });

        const buffer = message.toBuffer();
        this.send(buffer);
    }
    update() {
        const now = Date.now();

        if (now - this.last_ping > 1_000) this.ping();


        // console.log(now <= this.last_ping) 
        // console.log('run')
    }
    onMessage(msg, rinfo) {
        if (rinfo.address !== this.controlAddress || rinfo.port !== this.port) return console.trace('Got message from invalid address', rinfo);

        const message = new ControlRpcMessage({ content: msg });
        const data = message.toJSON();

        //console.log('got message', data)
        if (!data?.id) {
            console.log(data);
            return;
        }
        switch (data.id) {
            case ControlRequest.RequestQueued.id:
                setTimeout(() => {
                    this.lastSend.writeBigInt64BE(BigInt(this.request_id), 0);
                    this.send(this.lastSend);
                }, 500)
                break;
            case ControlRequest.Pong.id:
                if (!this.pong) this.pong = { client_addr: data.client_addr, tunnel_addr: data.tunnel_addr };

                this.current_ping = (data.server_now - data.request_now);
                console.log('ping:', this.current_ping + 'ms');

                if (!this.authenticated) {
                    this.emit('authenticate', async (key) => {
                        const message = new ControlRpcMessage({
                            request_id: this.request_id,
                            content: Buffer.from(key, 'hex')
                        });

                        const buffer = message.toBuffer();
                        this.send(buffer);
                    });
                }
                break;
            case ControlRequest.AgentRegistered.id:
                this.emit('authenticated');
                this.session = data.session;
                console.log(data)
                this.authenticated = true;
                // this.last_udp_auth = Date.now();

                this.setup()

                this.updateInterval = setInterval(() => this.update(), 500);
                break;
            case ControlRequest.UdpChannelDetails.id:
                console.log(data)

                const sock = dgram.createSocket('udp' + data.tunnel_addr.type);

                sock.on('connect', () => {
                    console.log('idk')
                })

                //                 const REDIRECT_FLOW_4_FOOTER_ID_OLD = BigInt("0x5cb867cf788173b2");
                // const REDIRECT_FLOW_4_FOOTER_ID = BigInt("0x4448474f48414344");
                // const REDIRECT_FLOW_6_FOOTER_ID = BigInt("0x6668676f68616366");
                // const UDP_CHANNEL_ESTABLISH_ID = BigInt("0xd01fe6830ddce781");

                const V4_LEN = 20;
                // const V6_LEN = 48;

                const getFooter = (buf) => {
                    let offset = 0;
                    const footer = buf.readBigUInt64BE(buf.length - 8);
                    offset = + 8;

                    const slice = buf.slice(buf.length - V4_LEN);
                    console.log(slice)

                    function getIP(buff, offset) {
                        const ip_parts = buff.slice(offset, offset + 4);
                        return Array.from(ip_parts).join('.');
                    }

                    const obj = new Object();
                    //104.219.3.148

                    let offset2 = 0

                    obj.src_ip = getIP(slice, offset2);
                    offset2 += 4

                    obj.dst_ip = getIP(slice, offset2)
                    offset2 += 4

                    obj.src_port = slice.readUInt16BE(offset2)
                    offset2 += 2

                    obj.dst_port = slice.readUInt16BE(offset2)
                    offset2 += 2

                    obj.footer = slice.readBigUInt64BE(offset2);
                    obj.length = V4_LEN;

                    return obj;
                }

                sock.on('message', (msg, rinfo) => {

                    const footer = getFooter(msg);

                    const buf = msg.slice(0, msg.length - footer.length);
                    console.log(footer, buf, msg)
                });

                sock.on('listening', () => {
                    sock.send(data.token, data.tunnel_addr.port, data.tunnel_addr.address, (err, bytes) => {
                        console.log('send', err, bytes)
                    })
                });

                sock.bind();
                console.log(sock)
                break;
            case 20:
                console.log(data)
                // var key = data.peerAddr.address + "-" + data.connectAddr.address

                // if (!this.connections.has(key)) {
                //     //const sock = dgram.createSocket('udp' + tunnel_addr.type);
                // }


                //     const tunnel_addr = data.tunnel_addr;
                //     const sock = dgram.createSocket('udp' + tunnel_addr.type);
                //     sock.on('message', (buf, info) => {
                //         console.log(buf, info)
                //     });

                //     const buf = Buffer.from(data.token, 'hex');

                //     sock.on('listening', () => {
                //         sock.send(buf, 0, buf.length, tunnel_addr.port, tunnel_addr.address, (err, bytes) => {
                //             if (err) console.log(err);
                //             console.log('bytes', bytes)
                //     }
                // )
                //     });

                //     sock.bind();

                break;
        }
    }
    send(buffer) {
        this.request_id++;

        this.socket.send(buffer, 0, buffer.length, this.port, this.controlAddress, (err) => {
            if (err) return console.log(err);
            this.lastSend = buffer;
        });
    }
}

module.exports = Channel