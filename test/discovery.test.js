const uuid = require('uuid');
const ip = require('ip');
const expect = require('chai').expect;
const getServer = require('./lib/server');
const getClient = require('./lib/client');

const HOST = 'localhost';
const DEEPSTREAM_SEED_PORT = 6020;
//const NATS_SERVERS = ['nats://192.168.113.211:4222','nats://192.168.113.212:4222','nats://192.168.113.213:4222'];
const NATS_SERVERS = ['nats://127.0.0.1:4222'];

describe('Discovery', function () {
  this.timeout(10000);
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
    const seedServer = await getServer(
      'server-0',
      DEEPSTREAM_SEED_PORT,
      NATS_SERVERS
    );

    const seedClient = await getClient(`${HOST}:${DEEPSTREAM_SEED_PORT}`, 'client-0');
    servers.push(seedServer);
    clients.push(seedClient);
    for (let i = 1; i < 4; i += 1) {
      const server = await getServer(
        `server-${i}`,
        DEEPSTREAM_SEED_PORT + (i * 3),
        NATS_SERVERS
      );

      const client = await getClient(`${HOST}:${DEEPSTREAM_SEED_PORT + (i * 3)}`, `client-${i}`);
      servers.push(server);
      clients.push(client);
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  });

  after(async () => {
    for (let i = 0; i < servers.length; i += 1) {
      await clients[i].shutdown();
      await servers[i].shutdown();
    }
  });

  it('Should share record state.', async () => {
    const name = `subscription-${uuid.v4()}`;
    const value = uuid.v4();
    const [clientA, clientB] = getRandomClients();
    const subscribeAPromise = new Promise((resolve) => {
      const recordA = clientA.record.getRecord(name);
      recordA.subscribe((data) => {
        if (data.value === value) {
          recordA.unsubscribe();
          recordA.discard();
          resolve();
        }
      });
    });
    const recordB = clientB.record.getRecord(name);
    recordB.set({ value });
    await subscribeAPromise;
    recordB.unsubscribe();
    recordB.discard();
  });

  it('Should make RPC calls.', async () => {
    const name = `rpc-${uuid.v4()}`;
    const value = `rpc-prefix-${uuid.v4()}`;
    const [clientA, clientB] = getRandomClients();
    clientA.rpc.provide(name, (data, response) => {
      response.send(data + value);
    });
    await new Promise((resolve) => setTimeout(resolve, 500));
    await new Promise((resolve, reject) => {
      const prefixB = uuid.v4();
      clientB.rpc.make(name, prefixB, (errorMessage, result) => {
        if (errorMessage) {
          reject(new Error(errorMessage));
          return;
        }
        if (result !== prefixB + value) {
          reject(new Error('RPC value does not match'));
          return;
        }
        resolve();
      });
    });
    clientA.rpc.unprovide(name);
  });

  it('Should listen.', async () => {
    const name = `listen/${uuid.v4()}`;
    const value = `listen-response-${uuid.v4()}`;
    const [clientA, clientB] = getRandomClients();
    clientA.record.listen('listen/*', (match, isSubscribed, response) => {
      if (!isSubscribed) {
        return;
      }
      const recordA = clientA.record.getRecord(match);
      response.accept();
      recordA.set({ value }, () => {
        recordA.discard();
      });
    });
    await new Promise((resolve) => {
      const recordB = clientB.record.getRecord(name);
      recordB.subscribe((data) => {
        if (data.value === value) {
          recordB.unsubscribe();
          recordB.on('discard', resolve);
          recordB.discard();
        }
      });
    });
    clientA.record.unlisten('listen/*');
  });

  it('Should listen for events.', async () => {
    const name = `event-${uuid.v4()}`;
    const value = `event-value-${uuid.v4()}`;
    const [clientA, clientB] = getRandomClients();
    const eventAPromise = new Promise((resolve) => {
      clientA.event.subscribe(name, (data) => {
        if (data.value === value) {
          clientA.event.unsubscribe(name);
          resolve();
        }
      });
    });
    clientB.event.emit(name, { value });
    await eventAPromise;
  });

  it('Should share presence.', async () => {
    const allUsernames = [];
    for (let i = 0; i < clients.length; i += 1) {
      allUsernames.push(`client-${i}`);
    }
    for (let i = 0; i < clients.length; i += 1) {
      const client = clients[i];
      const expectedUsernames = allUsernames.filter((x) => x !== `client-${i}`);
      const usernames = await new Promise((resolve) => client.presence.getAll(resolve));
      usernames.sort();
      expectedUsernames.sort();
      expect(usernames).to.eql(expectedUsernames);
    }
  });
});
