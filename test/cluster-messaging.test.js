const expect = require('chai').expect;
const getServer = require('./lib/server');
const getClient = require('./lib/client');

const HOST = '127.0.0.1';
const NATS_SERVERS = ['nats://127.0.0.1:4222'];
const DEEPSTREAM_PORT_A = 6020;
const DEEPSTREAM_PORT_B = 7020;
const DEEPSTREAM_PORT_C = 8020;

describe('Cluster Messaging - Single Node', function () {
  this.timeout(30000);
  let serverA;
  let serverB;

  before(async () => {
    serverA = await getServer(
      'server-A',
      DEEPSTREAM_PORT_A,
      NATS_SERVERS
    );

    serverB = await getServer(
      'server-B',
      DEEPSTREAM_PORT_B,
      NATS_SERVERS
    );
  });

  after(async () => {
    await serverA.shutdown();
    await serverB.shutdown();
  });

  it('Should add and remove peers safely - Single Node', async () => {
    const presenceState = {
      SERVER_A: {},
    };


    // Presence
    const presenceClientA = await getClient(`${HOST}:${DEEPSTREAM_PORT_A}`, 'presenceA');
    presenceClientA.presence.subscribe((deviceId, login) => {
      if (!presenceState.SERVER_A[deviceId]) {
        presenceState.SERVER_A[deviceId] = [login];
      } else {
        presenceState.SERVER_A[deviceId].push(login);
      }
    });

    // Client A --> Server A
    let clientA = await getClient(`${HOST}:${DEEPSTREAM_PORT_A}`, 'client-A');
    await clientA.shutdown();

    // Client A --> Server B
    clientA = await getClient(`${HOST}:${DEEPSTREAM_PORT_A}`, 'client-A');
    await clientA.shutdown();

    // Client B --> Server B
    let clientB = await getClient(`${HOST}:${DEEPSTREAM_PORT_A}`, 'client-B');
    await clientB.shutdown();

    // Client A --> Server A
    clientA = await getClient(`${HOST}:${DEEPSTREAM_PORT_A}`, 'client-A');
    await clientA.shutdown();

    // Client B --> Server B
    clientB = await getClient(`${HOST}:${DEEPSTREAM_PORT_A}`, 'client-B');
    await clientB.shutdown();

    await new Promise((resolve) => setTimeout(resolve, 100));

    await presenceClientA.shutdown();

    // Client A connected, disconnected thrice
    expect(presenceState.SERVER_A['client-A'].length).to.equal(6);
    expect(presenceState.SERVER_A['client-A'][0]).to.equal(true);
    expect(presenceState.SERVER_A['client-A'][1]).to.equal(false);
    expect(presenceState.SERVER_A['client-A'][2]).to.equal(true);
    expect(presenceState.SERVER_A['client-A'][3]).to.equal(false);
    expect(presenceState.SERVER_A['client-A'][4]).to.equal(true);
    expect(presenceState.SERVER_A['client-A'][5]).to.equal(false);

    // Client B connected, disconnected twice
    expect(presenceState.SERVER_A['client-B'].length).to.equal(4);
    expect(presenceState.SERVER_A['client-B'][0]).to.equal(true);
    expect(presenceState.SERVER_A['client-B'][1]).to.equal(false);
    expect(presenceState.SERVER_A['client-B'][2]).to.equal(true);
    expect(presenceState.SERVER_A['client-B'][3]).to.equal(false);
  });
});


describe('Cluster Messaging - Cluster', function () {
  this.timeout(30000);
  let serverA;
  let serverB;

  before(async () => {
    serverA = await getServer(
      'server-A',
      DEEPSTREAM_PORT_A,
      NATS_SERVERS
    );

    serverB = await getServer(
      'server-B',
      DEEPSTREAM_PORT_B,
      NATS_SERVERS
    );
  });

  after(async () => {
    await serverA.shutdown();
    await serverB.shutdown();
  });
  it('Should add and remove peers safely - 3 Node Cluster', async () => {
    const presenceState = {
      SERVER_A: {},
      SERVER_B: {},
      SERVER_C: {},
    };

    const serverC = await getServer(
      'server-C',
      DEEPSTREAM_PORT_C,
      NATS_SERVERS
    );
    await new Promise((resolve) => setTimeout(resolve, 100));
    // Presence
    const presenceClientA = await getClient(`${HOST}:${DEEPSTREAM_PORT_A}`, 'presenceA');
    presenceClientA.presence.subscribe((deviceId, login) => {
      if (!presenceState.SERVER_A[deviceId]) {
        presenceState.SERVER_A[deviceId] = [login];
      } else {
        presenceState.SERVER_A[deviceId].push(login);
      }
    });
    const presenceClientB = await getClient(`${HOST}:${DEEPSTREAM_PORT_B}`, 'presenceB');
    presenceClientB.presence.subscribe((deviceId, login) => {
      if (!presenceState.SERVER_B[deviceId]) {
        presenceState.SERVER_B[deviceId] = [login];
      } else {
        presenceState.SERVER_B[deviceId].push(login);
      }
    });
    const presenceClientC = await getClient(`${HOST}:${DEEPSTREAM_PORT_C}`, 'presenceC');
    presenceClientC.presence.subscribe((deviceId, login) => {
      if (!presenceState.SERVER_C[deviceId]) {
        presenceState.SERVER_C[deviceId] = [login];
      } else {
        presenceState.SERVER_C[deviceId].push(login);
      }
    });

    await new Promise((resolve) => setTimeout(resolve, 100));

    // Client A --> Server A
    let clientA = await getClient(`${HOST}:${DEEPSTREAM_PORT_A}`, 'client-A');
    await clientA.shutdown();

    // Client A --> Server B
    clientA = await getClient(`${HOST}:${DEEPSTREAM_PORT_B}`, 'client-A');
    await clientA.shutdown();

    // Client B --> Server B
    let clientB = await getClient(`${HOST}:${DEEPSTREAM_PORT_B}`, 'client-B');
    await clientB.shutdown();

    // Client A --> Server A
    clientA = await getClient(`${HOST}:${DEEPSTREAM_PORT_A}`, 'client-A');
    await clientA.shutdown();

    // Client B --> Server B
    clientB = await getClient(`${HOST}:${DEEPSTREAM_PORT_B}`, 'client-B');
    await clientB.shutdown();

    await new Promise((resolve) => setTimeout(resolve, 100));

    await presenceClientA.shutdown();
    await presenceClientB.shutdown();
    await presenceClientC.shutdown();
    await serverC.shutdown();

    await new Promise((resolve) => setTimeout(resolve, 100));

    // Server A Presence
    // Client A connected, disconnected thrice
    expect(presenceState.SERVER_A['client-A'].length).to.equal(6);
    expect(presenceState.SERVER_A['client-A'][0]).to.equal(true);
    expect(presenceState.SERVER_A['client-A'][1]).to.equal(false);
    expect(presenceState.SERVER_A['client-A'][2]).to.equal(true);
    expect(presenceState.SERVER_A['client-A'][3]).to.equal(false);
    expect(presenceState.SERVER_A['client-A'][4]).to.equal(true);
    expect(presenceState.SERVER_A['client-A'][5]).to.equal(false);

    // Client B connected, disconnected twice
    expect(presenceState.SERVER_A['client-B'].length).to.equal(4);
    expect(presenceState.SERVER_A['client-B'][0]).to.equal(true);
    expect(presenceState.SERVER_A['client-B'][1]).to.equal(false);
    expect(presenceState.SERVER_A['client-B'][2]).to.equal(true);
    expect(presenceState.SERVER_A['client-B'][3]).to.equal(false);

    // Server B Presence
    // Client Å connected, disconnected thrice
    expect(presenceState.SERVER_B['client-A'].length).to.equal(6);
    expect(presenceState.SERVER_B['client-A'][0]).to.equal(true);
    expect(presenceState.SERVER_B['client-A'][1]).to.equal(false);
    expect(presenceState.SERVER_B['client-A'][2]).to.equal(true);
    expect(presenceState.SERVER_B['client-A'][3]).to.equal(false);
    expect(presenceState.SERVER_B['client-A'][4]).to.equal(true);
    expect(presenceState.SERVER_B['client-A'][5]).to.equal(false);

    // Client B connected, disconnected twice
    expect(presenceState.SERVER_B['client-B'].length).to.equal(4);
    expect(presenceState.SERVER_B['client-B'][0]).to.equal(true);
    expect(presenceState.SERVER_B['client-B'][1]).to.equal(false);
    expect(presenceState.SERVER_B['client-B'][2]).to.equal(true);
    expect(presenceState.SERVER_B['client-B'][3]).to.equal(false);

    // Server C Presence
    // Client A connected, disconnected thrice
    expect(presenceState.SERVER_C['client-A'].length).to.equal(6);
    expect(presenceState.SERVER_C['client-A'][0]).to.equal(true);
    expect(presenceState.SERVER_C['client-A'][1]).to.equal(false);
    expect(presenceState.SERVER_C['client-A'][2]).to.equal(true);
    expect(presenceState.SERVER_C['client-A'][3]).to.equal(false);
    expect(presenceState.SERVER_C['client-A'][4]).to.equal(true);
    expect(presenceState.SERVER_C['client-A'][5]).to.equal(false);

    // Client B connected, disconnected twice
    expect(presenceState.SERVER_C['client-B'].length).to.equal(4);
    expect(presenceState.SERVER_C['client-B'][0]).to.equal(true);
    expect(presenceState.SERVER_C['client-B'][1]).to.equal(false);
    expect(presenceState.SERVER_C['client-B'][2]).to.equal(true);
    expect(presenceState.SERVER_C['client-B'][3]).to.equal(false);
  });
});