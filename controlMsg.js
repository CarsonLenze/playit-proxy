const ControlMessages = require('./control.js');

class ControlRpcMessage {
    constructor(requestId, content) {
        this.requestId = requestId;
        this.content = content;
        this.offset = 0;
    }

    writeTo(buffer) {
        console.log(this.offset)
        this.offset = buffer.writeBigInt64BE(BigInt(this.requestId), this.offset);
        this.offset = this.content.writeId(buffer, this.offset);
        this.offset = this.content.writeTo(buffer, this.offset);
        console.log(this.offset)
    }

    readFrom(buffer) {
        throw new Error("failed to read message");
    }
}

module.exports = ControlRpcMessage;