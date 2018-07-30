const EventEmitter = require('events');

module.exports = class DistributedStateRegistry extends EventEmitter {
    
    constructor(topic, options) {
        super();
        this.topic = topic;
        this.options = options;
        this.data = {}
    }

    /**
     * Checks if a given entry exists within the registry
     */
    has(name) {
        return !!this.data[name];
    }


    /**
     * Add a name/entry to the registry. If the entry doesn't exist yet,
     * this will notify the other nodes within the cluster
     */
    add(name, serverName = this.options.serverName) {
        if(!this.data[name]){
            this.emit('add', name);
        }
        if(serverName === this.options.serverName) {
            this.emit('clusterAdd', name);
        }
        setImmediate(() => {
            this.data[name] = this.data[name] || new Set([]);
            this.data[name].add(serverName);
        })
    }

    /**
     * Removes a name/entry from the registry. If the entry doesn't exist,
     * this will exit silently
     *
     * @param {String} name any previously added name
     *
     * @public
     * @returns {void}
     */    
    remove(name, serverName = this.options.serverName) {
        if(!this.data[name]) {
            return;
        }
        if(serverName === this.options.serverName){
            this.emit('clusterRemove', name);
        }
        this.data[name].delete(serverName);
        if(this.data[name].size === 0) {
            delete this.data[name];
            this.emit('remove', name);
        }
    }

    /**
     * Removes all entries for a given serverName. This is intended to be called
     * whenever a node leaves the cluster
     */    
    removeAll(serverName) {
        Object.keys(this.data).forEach(name => {
            if(!this.data[name]) {
                return;
            }
            this.data[name].delete(serverName);
            if(this.data[name].size === 0) {
                delete this.data[name];
            }
        })
    }

    /**
     * Returns all the servers that hold a given state
     */    
    getAllServers(name) {
        if(!this.data[name]) {
            return [];
        }
        const servers = Array.from(this.data[name]);
        return servers;
    }

  /**
  * Returns all currently registered entries
  *
  * @public
  * @returns {Array} entries
  */
    getAll(){
        return Object.keys(this.data);
    }


    getAllMap() {
        return this.data;
    }
}