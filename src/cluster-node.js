const NatsClient = require('nats'),
    NodeCache = require('node-cache'),
    events = require('events'),
    StateRegistry = require('./state-registry'),
    C = require('deepstream.io/src/constants/constants');

module.exports = class ClusterNode extends events.EventEmitter {

    constructor(options) {
        super();
        this.options = options;
        this.peerTTL = options.peerTTL || 30; //Number of seconds after receiving last advertisement that a peer is removed from cache
        this.advertisementInterval = options.advertisementInterval || 2; //Number of seconds between sending advertisement messages
        this.natsOptions = options.natsOptions;
        this.stateRegistries = {};
        this.closed = false;
        this.isReady = false;
        this.peerCache = new NodeCache({ checkperiod: this.peerTTL }); //All other peer servers that have sent _advertisePeer messages in last 30 seconds
        this.advertiseIntervalObject = null;
        this.directServerCallbacks = {};
        this.logger = options.logger || { info: (event, logMessage) => { console.log(`${event} | ${logMessage}`); }, warn: (event, logMessage) => { console.log(`${event} | ${logMessage}`); }, error: (event, logMessage) => { console.error(`${event} | ${logMessage}`);}}
        
        var clusterNode = this;

        var natsConnectOptions = { 
            servers: this.natsOptions.servers,
            name: this.options.serverName,
            json: true,
            waitOnFirstConnect: true,
            reconnect: true,
            reconnectTimeWait: 2000,
            maxReconnectAttempts: -1,
            noRandomize: false,
            user: this.natsOptions.user,
            pass: this.natsOptions.pass || this.natsOptions.password,
            tls: this.natsOptions.tls
        };

        this.natsClient = NatsClient.connect(natsConnectOptions);

        this.natsClient.on('connect', (client) => {

            clusterNode.logger.info('NATS_CONNECTION_ESTABLISHED',`Connected to NATS host: ${client.currentServer.url.host}`);

            clusterNode.createSystemSubscriptions();
            //Advertise this server (node) to others
            clusterNode.sendAdvertisement();
            //Request other servers to send their state
            clusterNode.sendRequestState();

            //Advertise server once per second
            clusterNode.advertiseIntervalObject = setInterval(() => {
                clusterNode.sendAdvertisement();
            }, clusterNode.advertisementInterval * 1000);

            setImmediate(() => {
                this.isReady = true;
                this.emit('ready');
            });
        });

        this.natsClient.on('error', (err) => {
            clusterNode.logger.error('NATS_CONNECTION_ERROR', `NATS error has occurred: ${err}`);
            setImmediate(() => {
                this.emit('error', err);
            });
        });

        this.natsClient.on('disconnect', () => {
            clusterNode.logger.warn('NATS_DISCONNECTED', `Disconnected from NATS.`);
            setImmediate(() => {
                this.emit('error', 'Disconnected from NATS');
            });
        });

        this.natsClient.on('reconnecting', () => {
            clusterNode.logger.info('NATS_RECONNECTING', `Attempting to reconnect to NATS.`);
        });

        this.natsClient.on('reconnect', (client) => {
            clusterNode.logger.info('NATS_CONNECTION_ESTABLISHED',`Reconnected to NATS host: ${client.currentServer.url.host}`);
            setImmediate(() => {
                this.isReady = true;
                this.emit('ready');
            });
        });

        this.natsClient.on('close', () => {
            clusterNode.logger.warn('NATS_CLOSED', `NATS connection is permanently closed and will not reconnect.`);
        });

        //Setup event handlers

        //Generate removePeer event when peer is deleted from cache
        this.peerCache.on( "del", function( serverName, peer ){
            clusterNode.emit('removePeer', peer);
        }, true);

        //Handle removePeer event
        this.on('removePeer', (peer) => {
            const serverName = peer.name;
            clusterNode.logger.info(C.EVENT.CLUSTER_LEAVE,`Peer node ${serverName} has been removed from the deepstream cluster.`);

            if (serverName) {
              Object.keys(clusterNode.stateRegistries).forEach((topic) => clusterNode.stateRegistries[topic].removeAll(serverName));
            }
          });
      
        //Handle addPeer event
        this.on('addPeer', (peer) => {
            clusterNode.logger.info(C.EVENT.CLUSTER_JOIN,`Peer node ${peer.name} has been added to the deepstream cluster.`);        
            if (clusterNode.requestStateTimeout) {
                clearTimeout(clusterNode.requestStateTimeout);
            }
            clusterNode.requestStateTimeout = setTimeout(() => { //Send request state message once after 100ms period
                try {                                    
                    clusterNode.sendRequestState();
                } catch(e) {
                    if(!clusterNode.closing) {
                        throw e;
                    }
                }
            }, 100);
        });
    }

    //Create all the system subscriptions i.e. those used by clusterNode
    createSystemSubscriptions() {
        var clusterNode = this;

        // Messaging about topics to add to the state registry
        this.subscribe('_clusterTopicAdd', (message) => {
            const [serverName, topic, name] = message;
            const stateRegistry = clusterNode.getStateRegistry(topic);
            stateRegistry.add(name, serverName);
        });
    
        // Messaging about topics to remove from the state registry
        this.subscribe('_clusterTopicRemove', (message) => {
            const [serverName, topic, name] = message;
            const stateRegistry = clusterNode.getStateRegistry(topic);
            stateRegistry.remove(name, serverName);
        });

        // Messaging state sync
        this.subscribe('_clusterRequestState', (message) => {
            const { serverName } = message;
            if(serverName === clusterNode.options.serverName) {
                return;
            }

            clusterNode.sendState(serverName);
        });

        //Subscribe to cluster state being sent out directly to this server only
        this.subscribe('_clusterState', (message) => {            
            const { topic, name, serverNames } = message;
            const stateRegistry = clusterNode.getStateRegistry(topic);
            serverNames.forEach((serverName) => stateRegistry.add(name, serverName));
        }, true);

        //Subscribe to direct sever topics and route messages to callbacks registered against the local topic map
        this.natsClient.subscribe(`deepstream._serverDirect.${this.options.serverName}`, (natsMessage, reply, subject) => {
            var callbacks = clusterNode.directServerCallbacks[natsMessage.topic];

            //If there are callback for the topic excute each one
            if(callbacks && Array.isArray(callbacks)) {
                callbacks.forEach(callback => {
                    callback(natsMessage.message, natsMessage.fromServer);       
                })
            }
        });

        //Subscribe to peer advertisements
        this.subscribe('_advertisePeer', (message) => {
            const { serverName } = message;

            if(serverName === clusterNode.options.serverName) {
                return;
            }

            //Register new peers and update existing ones
            var peer = clusterNode.peerCache.get(serverName);

            if(!peer) { //If the peer isn't already registered create a new one and fire event
                peer = { name: serverName, firstSeen: new Date().getTime() };
                clusterNode.emit('addPeer', peer); //Fire addPeer event because the server is new
            }

            //Update the lastSeen time of the peer
            peer.lastSeen = new Date().getTime();

            //Store the peer server in our cache with TTL
            clusterNode.peerCache.set(serverName, peer, this.peerTTL); 
        });

        //Subscribe to peer leaving events
        this.subscribe('_peerLeaving', (message) => {
            const { serverName } = message;

            if(serverName === clusterNode.options.serverName) {
                return;
            }

            clusterNode.peerCache.del(serverName);
        });
    }

    //Send message directly to another individual server
    sendDirect(serverName, topic, message, metaData) {
        var natsMessage = {
            topic: topic,
            message: message,
            metaData: metaData,
            fromServer: this.options.serverName
        };
        this.natsClient.publish(`deepstream._serverDirect.${serverName}`, natsMessage);
    }

    //Send message to cluster wide topics
    send(topic, message, metaData) {
        var natsMessage = {
            message: message,
            metaData: metaData,
            fromServer: this.options.serverName
        };
        this.natsClient.publish(`deepstream.${topic}`, natsMessage);
    }

    //Setup subscriptions for cluster wide and direct sever topics
    subscribe(topic, callback, directOnly = false) {
        var clusterNode = this;
        
        //Add callback to locally held list of topic callbacks for the direct server channel
        this.directServerCallbacks[topic] = this.directServerCallbacks[topic] || [];
        this.directServerCallbacks[topic].push(callback);

        if(!directOnly) {
            //Subscribe to cluster-wide topic
            this.natsClient.subscribe(`deepstream.${topic}`, (natsMessage, reply, subject) => {
                if(natsMessage.fromServer !== clusterNode.options.serverName) {
                    callback(natsMessage.message, natsMessage.fromServer);
                }
            });
        }
    }

    //Send state to other named server directly
    sendState(serverName) {
        Object.keys(this.stateRegistries).forEach((topic) => {
          Object.keys(this.stateRegistries[topic].data).forEach((name) => {
            const serverNames = Array.from(this.stateRegistries[topic].data[name]);
            const message = {
              topic,
              name,
              serverNames
            };

            this.sendDirect(serverName, '_clusterState', message);
          });
        });
      }

    //Intialsied and get state registry and related events
    getStateRegistry(topic) {
        if (this.stateRegistries[topic]) {
          return this.stateRegistries[topic];
        }
        const stateRegistry = new StateRegistry(topic, this.options);
        stateRegistry.on('clusterAdd', (name) => {
          this.send('_clusterTopicAdd', [this.options.serverName, topic, name]);
        });
        stateRegistry.on('clusterRemove', (name) => {
          this.send('_clusterTopicRemove',  [this.options.serverName, topic, name]);
        });
        this.stateRegistries[topic] = stateRegistry;
        return stateRegistry;
      }


    //Get all registered peers
    getPeers() {
        var peerServerNames = this.peerCache.keys(); //Get cache keys as array of server names
        //Map keys to actual peers and return
        return peerServerNames.map(peerName => { 
            return this.peerCache.get(peerName);
        });
    }

    //Advertise this peer to other nodes
    sendAdvertisement() {
        this.send('_advertisePeer', { serverName: this.options.serverName });
    }

    //Send peer leaving message to other nodes to let them know we are going
    sendPeerLeaving() {
        this.send('_peerLeaving', { serverName: this.options.serverName });
    }

    //Send a message to other nodes to request them send their state to us
    sendRequestState() {
        this.send('_clusterRequestState', { serverName: this.options.serverName });
    }
    
    //Called to close down the server and depdencies
    close(callback) {

        this.closing = true;

        if(this.closed) {
            throw new Error('ClusterNode already closed.');
        }

        //Clear advertise interval timer to stop sending advertisements
        if(this.advertiseIntervalObject) {
            clearInterval(this.advertiseIntervalObject);
        }

        //Tell other nodes we're leaving
        this.sendPeerLeaving();

        var natsClient = this.natsClient;

        //Flush nats messages
        natsClient.flush(() => {
            //Close down the nats connection
            natsClient.close();

            //Mark as closed and fire event
            this.closed = true;
            this.emit('close');
            if(callback) {
                callback();
            }
        });       
    }
}