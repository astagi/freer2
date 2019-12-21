const ESC = 0xAB;
const SOP = 0x8D;
const EOP = 0xD8;
const ESC_ESC = 0x23;
const ESC_SOP = 0x05;
const ESC_EOP = 0x50;


let seq = 0;


let calculateChk = (buff) => {
    let ret = 0x00;
    for (let i = 0 ; i < buff.length ; i++) {
		ret += buff[i];
    }
    ret = ret & 255;
    return (ret ^ 255);
}


let buildPacket = (init, payload=[]) => {
    let packet = [SOP];
    let body = [];
    let packetEncoded = [];

    body.push(...init);
    body.push(seq);
    body.push(...payload);

    body.push(calculateChk(body));

    for (let i = 0 ; i < body.length ; i++) {
        if (body[i] == ESC) {
            packetEncoded.push(...[ESC, ESC_ESC]);
        }
        else if (body[i] == SOP) {
            packetEncoded.push(...[ESC, ESC_SOP]);
        }
        else if (body[i] == EOP) {
            packetEncoded.push(...[ESC, ESC_EOP]);
        }
        else {
            packetEncoded.push(body[i])
        }
    }

    packet.push(...packetEncoded);
    packet.push(EOP);
    seq = (seq + 1) % 140;

    return packet;
}


console.log(buildPacket([0x0A,0x13,0x0D]))
console.log(buildPacket([0x0A,0x13,0x01]))

// ----

const CONNECT_SERVICE = "00020001574f4f2053706865726f2121";
const CONNECT_CHAR = "00020005574f4f2053706865726f2121";

const SPECIAL_SERVICE = "00010001574f4f2053706865726f2121";
const SPECIAL_CHAR = "00010002574f4f2053706865726f2121";

const MSG_CONNECTION = [0x75,0x73,0x65,0x74,0x68,0x65,0x66,0x6F,0x72,0x63,0x65,0x2E,0x2E,0x2E,0x62,0x61,0x6E,0x64];
const MSG_INIT = [0x0A,0x13,0x0D];
const MSG_OFF = [0x0A,0x13,0x01];

// ----

const noble = require('noble');

let connectTheDroid = (address) => {
    return new Promise((resolve, reject) => {
        noble.on('discover', (peripheral) => {
            if (peripheral.address === address) {
                noble.stopScanning();
                peripheral.connect( (e) => {
                    peripheral.discoverServices([CONNECT_SERVICE], (error, services) => {
                        services[0].discoverCharacteristics([CONNECT_CHAR], (error, characteristics) => {
                            characteristics[0].write(Buffer.from(MSG_CONNECTION), true, (error) => {
                                peripheral.discoverServices([SPECIAL_SERVICE], (error, services) => {
                                    services[0].discoverCharacteristics([SPECIAL_CHAR], (error, characteristics) => {
                                        resolve(characteristics[0]);
                                    });
                                });
                            });
                        });
                    });
                });
            }
        });

        noble.on('stateChange', (state) => {
            if (state === 'poweredOn') {
                noble.startScanning();
            } else {
                noble.stopScanning();
            }
        });
    });
}

// ----

let writePacket = (characteristic, buff, waitForNotification=false, timeout=0) => {
    return new Promise(function(resolve, reject) {
        let dataRead = [];

        let checkIsAValidRequest = (dataRead) => {
            if (dataRead[5] != 0x00) {
                reject(dataRead[5]);
            }
        }

        let finish = () => {
            setTimeout(() => {
                resolve(true);
            }, timeout);
        }

        let listenerForRead = (data, isNotification) => {
            dataRead.push(...data)
            if (data[data.length - 1] === EOP) {
                if (waitForNotification) {
                    if (dataRead[1] % 2 == 0) {
                        finish();
                    } else {
                        checkIsAValidRequest(dataRead);
                    }
                } else {
                    checkIsAValidRequest(dataRead);
                    finish();
                }
                dataRead = [];
            }
        };
        characteristic.removeAllListeners('data');
        characteristic.on('data', listenerForRead);
        characteristic.write(Buffer.from(buff));
    });
}

// ----

let droidAddress = 'd7:1b:52:17:7b:d6';

const MSG_ROTATE = [0x0A,0x17,0x0F];
const MSG_ANIMATION = [0x0A,0x17,0x05];

let convertDegreeToHex = (degree) => {
    var view = new DataView(new ArrayBuffer(4));
    view.setFloat32(0, degree);
    return Array
        .apply(null, { length: 4 })
        .map((_, i) => view.getUint8(i))

}


connectTheDroid(droidAddress).then(characteristic => {
    characteristic.subscribe(async(error) => {
        if (error) {
            console.error('Error subscribing to char.');
        } else {
            console.log("Wait for init!");
            await writePacket(characteristic, buildPacket(MSG_INIT), true, 5000);

            console.log('Rotate the droid!');
            for (let degrees = -160 ; degrees <= 180 ; degrees++) {
                await writePacket(
                    characteristic,
                    buildPacket(MSG_ROTATE, convertDegreeToHex(degrees)),
                    false,
                );
            }

            console.log('Show me what you can do!');
            await writePacket(
                characteristic,
                buildPacket(MSG_ANIMATION, [0x00, 7]),
                true
            );

            console.log('Wow! Anything else?');
            await writePacket(
                characteristic,
                buildPacket(MSG_ANIMATION, [0x00, 13]),
                true
            );

            console.log("Awesome! Turn off the droid now!");
            await writePacket(
                characteristic,
                buildPacket(MSG_OFF),
                true
            );
            console.log("Finish!");
        }
    });
});
