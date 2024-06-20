const hex = "010000000000022c8b00ffff00fefefefefdfdfdfd12345678a1dc775f91c693f8ac5d84b193b9dd10de376c775cb867cf788173b2";
//5cb867cf788173b2

const V4_LEN = 20;

const buffer = Buffer.from(hex, 'hex')
// console.log(buffer)
// const reverse = buffer.reverse()
// console.log(buffer, reverse)

const slice = buffer.slice(buffer.length - V4_LEN);

//27767
const obj = new Object();

let offset = 0

obj.src_ip = getIP(slice, offset);
offset += 4

obj.dst_ip = getIP(slice, offset)
offset += 4

obj.src_port = slice.readUInt16BE(offset)
offset += 2

obj.dst_port = slice.readUInt16BE(offset)
offset += 2

obj.footer = slice.readBigUInt64BE(offset);
console.log(obj)


function getIP(buff, offset) {
    const ip_parts = buff.slice(offset, offset + 4);
    return Array.from(ip_parts).join('.');
}