const dgram = require('dgram');
const dns = require('dns');

const LOCAL_PORT = 5523;
const host = '209.25.140.1';

const socket = dgram.createSocket('udp4');

const buffer = Buffer.alloc(1024);