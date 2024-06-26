const http = require('http');
const net = require('net');

const parse = (data) => {
    const lines = data.split('\n');
    const res = {};

    for (let i = 0; i < lines.length; ++i) {
        const line = lines[i].trim();
        if (line.length === 0) {
            continue;
        }

        const [key, value] = line.trim().split(': ');
        res[key] = value;
    }

    return res;
};

async function getDCInfo(addr, type, port = 80) {
    try {
        const request = new Promise((resolve, reject) => {
            const options = {
              hostname: addr,
              port: port,
              path: '/',
              method: 'GET',
              headers: {
                'Content-Type': 'text/plain'
              },
              family: type,
              insecureHTTPParser: true
            };
        
            const req = http.request(options, (res) => {
              let data = '';
        
              res.on('data', (chunk) => {
                data += chunk;
              });
        
              res.on('end', () => {
                resolve(data);
              });
            });
        
            req.on('error', (e) => {
              reject(e);
            });
        
            req.end();
          });

          const res = await request;
          const data = parse(res);
          return data;
    } catch (err) {
        console.log(err)
        return {}
    }
}

async function find_channel(addresses) {
    for (const address of addresses) {
        const type = net.isIP(address);
        if (!type) return;

        if (type === 4) return { addr: address, type: type };
    }
}

module.exports = {
    getDCInfo: getDCInfo,
    find_channel: find_channel
}