// @flow

// Based on deepstream.io-msg-connector-template 
// https://github.com/deepstreamIO/deepstream.io-msg-connector-template

const uuid = require('uuid');
const EventEmitter = require('events');
const ClusterNode = require('../src/cluster-node');
const expect = require('chai').expect;

describe('The cluster node adapter has the correct structure', () => {
  var clusterNode;

  before(async () => {
    clusterNode = new ClusterNode({
      serverName: uuid.v4(),
      natsOptions: {}
    });
    expect(clusterNode.isReady).to.equal(false);
    await new Promise((resolve, reject) => {
      clusterNode.on('ready', resolve);
      clusterNode.on('error', reject);
    });
    expect(clusterNode.isReady).to.equal(true);
  });

  before(async () => {
    await clusterNode.close();
  });

  it('implements the clusterNode interface', () => {
    expect(typeof clusterNode.sendDirect).to.equal('function');
    expect(typeof clusterNode.send).to.equal('function');
    expect(typeof clusterNode.subscribe).to.equal('function');
    expect(typeof clusterNode.getStateRegistry).to.equal('function');
    expect(typeof clusterNode.close).to.equal('function');
    expect(typeof clusterNode.isReady).to.equal('boolean');
    expect(clusterNode instanceof EventEmitter).to.equal(true);
  });
});