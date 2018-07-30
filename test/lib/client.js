const uuid = require('uuid');
const DeepstreamClient = require('deepstream.io-client-js/src/client');
const { CONSTANTS } = require('deepstream.io-client-js');

module.exports = async function getClient(address, username = uuid.v4()) {

    const client = DeepstreamClient(address);
    client.on('error', (errorMessage, errorType) => {
        console.log('error', errorMessage, errorType)
        if (errorType !== CONSTANTS.EVENT.UNSOLICITED_MESSAGE && errorType !== CONSTANTS.EVENT.NOT_SUBSCRIBED) {
            throw new Error(errorType);
          }
    });

    await new Promise((resolve, reject) => {
        client.on('connectionStateChanged', (connectionState) => {
            if (connectionState === CONSTANTS.CONNECTION_STATE.OPEN) {

                client.off('connectionStateChanged');
                resolve();
            } else if(connectionState === CONSTANTS.CONNECTION_STATE.ERROR) {
                reject(new Error('Connection Error.'));
            }
        });
        client.login({ username });
        client.username = username;
    });

    client.loginAgain = async () => {
        await new Promise((resolve, reject) => {
            client.on('connectionStateChanged', (connectionState) => {
                if(connectionState === CONSTANTS.CONNECTION_STATE.OPEN) {
                    client.off('connectionStateChanged');
                    resolve();
                } else if (connectionState ===  CONSTANTS.CONNECTION_STATE.ERROR) {
                    reject(new Error('Connection error'));
                }
            });
            client.login({ username: client.username });
        });
    };
    client.shutdown = async () => {
        await new Promise((resolve) => {
            const currentConnectionState = client.getConnectionState();
            if(currentConnectionState === CONSTANTS.CONNECTION_STATE.CLOSED || currentConnectionState === CONSTANTS.CONNECTION_STATE.ERROR) {
                client.off('connectionStateChanged');
                resolve();
            }
            client.on('connectionStateChanged',(connectionState) => {
                if (connectionState === CONSTANTS.CONNECTION_STATE.CLOSED || connectionState === CONSTANTS.CONNECTION_STATE.ERROR) {
                    client.off('connectionStateChanged');
                    resolve();
                  }
            });
            client.close();
        });
    };
    return client;
};