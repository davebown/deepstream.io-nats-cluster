const uuid = require('uuid');
const expect = require('chai').expect;
const getServer = require('./lib/server');
const getClient = require('./lib/client');

const NATS_SERVERS = ['nats://127.0.0.1:4222'];
const DEEPSTREAM_SEED_PORT = 6021;
const HOST = 'localhost';
const CLIENT_COUNT = 8;

describe('Cluster Messaging', function () {
  this.timeout(40000);
  const servers = [];
  const clients = [];

  const getRandomClients = () => {
    const clientA = clients[Math.floor(Math.random() * clients.length)];
    let clientB = clientA;
    while (clientB === clientA) {
      clientB = clients[Math.floor(Math.random() * clients.length)];
    }
    return [clientA, clientB];
  };


  before(async () => {

    const seedServer = await getServer('seed-server', DEEPSTREAM_SEED_PORT, NATS_SERVERS);
    const seedClient = await getClient(`${HOST}:${DEEPSTREAM_SEED_PORT}`, 'seed-client');
    servers.push(seedServer);
    clients.push(seedClient);
    
    for (let i = 1; i < CLIENT_COUNT; i += 1) {
      const server = await getServer(
        `server-${i}`,
        DEEPSTREAM_SEED_PORT + i,
        NATS_SERVERS
      );
      const client = await getClient(`${HOST}:${DEEPSTREAM_SEED_PORT + i}`, `client-${i}`);
      servers.push(server);
      clients.push(client);
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  });

  after(async () => {
    for (let i = 0; i < servers.length; i += 1) {
      await clients[i].shutdown();
      await servers[i].shutdown();
    }
  });

  it('Should share presence.', async () => {
    const [clientA, clientB] = getRandomClients();
    let clientC = clients[Math.floor(Math.random() * clients.length)];
    const randomizeClientC = () => {
      clientC = clients[Math.floor(Math.random() * clients.length)];
      if (clientC.username === clientA.username || clientC.username === clientB.username) {
        randomizeClientC();
      }
    };
    const presenceA = new Set(await new Promise((resolve) => clientA.presence.getAll(resolve)));
    const presenceB = new Set(await new Promise((resolve) => clientB.presence.getAll(resolve)));
    presenceA.add(clientA.username);
    presenceB.add(clientB.username);
    expect(presenceA.size).to.equal(CLIENT_COUNT);
    expect(presenceB.size).to.equal(CLIENT_COUNT);
    clientA.presence.subscribe((username, login) => {
      if (login) {
        presenceA.add(username);
      } else {
        presenceA.delete(username);
      }
    });
    clientB.presence.subscribe((username, login) => {
      if (login) {
        presenceB.add(username);
      } else {
        presenceB.delete(username);
      }
    });

    await new Promise((resolve) => setTimeout(resolve, 100));
    for (let i = 0; i < 5; i += 1) {
      randomizeClientC();
      await clientC.shutdown();
      await new Promise((resolve) => setTimeout(resolve, 50));
      expect(presenceA.size).to.equal(CLIENT_COUNT - 1);
      expect(presenceB.size).to.equal(CLIENT_COUNT - 1);
      await clientC.loginAgain();
      await new Promise((resolve) => setTimeout(resolve, 50));
      expect(presenceA.size).to.equal(CLIENT_COUNT);
      expect(presenceB.size).to.equal(CLIENT_COUNT);
    }
  });
});