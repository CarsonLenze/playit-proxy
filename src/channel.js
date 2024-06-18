const dgram = require('dgram');

class Channel {
    constructor(controlAddress) {
        this.socket = dgram.createSocket('udp4');
        this.controlAddress = controlAddress;
        this.port = 5525;

        this.socket.addListener('message', (...args) => this.handleMessage(...args));
        this.socket.addListener('listening', () => this.onListening());
        this.messageListener = null
    }
    handleMessage(msg, rinfo) {
        if (this.messageListener) this.messageListener(msg, rinfo);
    }
    onListening() {
        //start ping sending here
    }
    onMessage(cb) {
        if (typeof cb !== 'function') return console.trace('expected a callback');
        this.messageListener = cb;
    }
    start() {
        this.socket.bind();
    }
}

module.exports = Channel;