const Deepstream = require('../../src');

module.exports = async function getServer(serverName, deepstreamPort, natServers) {

    const server = new Deepstream({
        connectionEndpoints: {
            websocket: {
              name: 'uws',
              options: {
                port: deepstreamPort,
              },
            },
            http: false,
          },
        serverName: serverName,
        natsOptions: { 
            servers: natServers 
        }
    });

    server.set('logger', {
        isReady: true,
        debug: () => {},
        error: () => {},
        info: () => {},
        warn: () => {},
    });
    server.set('logLevel', 'debug');
    server.set('serverName', serverName);
    server.set('showLogo', false);

    await new Promise((resolve, reject) => {
        server.once('started', resolve);
        server.once('error', reject);
        server.start();
    });

    server.shutdown = async () => {
        await new Promise((resolve, reject) => {
            server.on('error', reject);
            server.on('stopped', resolve);
            server.stop();
        });
    };

    return server;
};