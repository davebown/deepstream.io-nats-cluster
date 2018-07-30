
const Deepstream = require('deepstream.io'),
 C = require('deepstream.io/src/constants/constants'),
 MessageProcessor = require('deepstream.io/src/message/message-processor'),
 MessageDistributor = require('deepstream.io/src/message/message-distributor'),
 EventHandler = require('deepstream.io/src/event/event-handler'),
 RpcHandler = require('deepstream.io/src/rpc/rpc-handler'),
 RecordHandler = require('deepstream.io/src/record/record-handler'),
 LockRegistry = require('deepstream.io/src/cluster/lock-registry'),
 DependencyInitialiser = require('deepstream.io/src/utils/dependency-initialiser'),
 PresenceHandler = require('./presence-handler'),
 ClusterNode = require('./cluster-node');

 module.exports = class NatsDeepstreamCluster extends Deepstream {

    constructor(config){
       
        super(config);
    }

    _pluginInit(){
        this._options.message = new ClusterNode(this._options);

        const infoLogger = (message) => this._options.logger.info(C.EVENT.INFO, message);

        // otherwise (no configFile) deepstream was invoked by API
        if (this._configFile != null) {
        infoLogger(`configuration file loaded from ${this._configFile}`);
        }

        if (global.deepstreamLibDir) {
        infoLogger(`library directory set to: ${global.deepstreamLibDir}`);
        }

        this._options.pluginTypes.forEach((pluginType) => {
            const plugin = this._options[pluginType];
            const initialiser = new DependencyInitialiser(this, this._options, plugin, pluginType);
            initialiser.once('ready', () => {
                this._checkReady(pluginType, plugin);
            });
            return initialiser;
        });
    }

    _serviceInit(){
        this._messageProcessor = new MessageProcessor(this._options);
        this._messageDistributor = new MessageDistributor(this._options);
        this._options.uniqueRegistry = new LockRegistry(this._options, this._options.message);

        this._eventHandler = new EventHandler(this._options);
        this._messageDistributor.registerForTopic(
        C.TOPIC.EVENT,
        this._eventHandler.handle.bind(this._eventHandler),
        );

        this._rpcHandler = new RpcHandler(this._options);
        this._messageDistributor.registerForTopic(
        C.TOPIC.RPC,
        this._rpcHandler.handle.bind(this._rpcHandler),
        );

        this._recordHandler = new RecordHandler(this._options);
        this._messageDistributor.registerForTopic(
        C.TOPIC.RECORD,
        this._recordHandler.handle.bind(this._recordHandler),
        );

        this._presenceHandler = new PresenceHandler(this._options);
        this._messageDistributor.registerForTopic(
        C.TOPIC.PRESENCE,
        this._presenceHandler.handle.bind(this._presenceHandler),
        );

        this._messageProcessor.onAuthenticatedMessage =
        this._messageDistributor.distribute.bind(this._messageDistributor);

        if (this._options.permissionHandler.setRecordHandler) {
        this._options.permissionHandler.setRecordHandler(this._recordHandler);
        }

        process.nextTick(() => this._transition('services-started'));
    }

    getPeers() {
        return this._options.message.getPeers().map((peer) => ({
            serverName: peer.name
          }));
    }

    onAddPeer(callback) {
        this._options.message.on('addPeer', (peer) => {
          callback({
            serverName: peer.name
          });
        }, true);
    }

    onRemovePeer(callback) {
        this._options.message.on('removePeer', (peer) => {
            callback({
            serverName: peer.name
            });
        }, true);
    }
};


