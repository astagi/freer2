"use strict";
const noble = require('noble');


noble.on('discover', (peripheral) => {
    console.log("--------------------~--------------------");
    console.log('UUID: ' + peripheral.uuid);
    console.log('ADDR: ' + peripheral.address);
    console.log('NAME: ' + peripheral.advertisement.localName)
    console.log("--------------------~--------------------");
});


noble.on('stateChange', (state) => {
    if (state === 'poweredOn') {
        noble.startScanning();
    } else {
        noble.stopScanning();
    }
});
