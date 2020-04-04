const noble = require('noble');

const CONNECT_SERVICE = "00020001574f4f2053706865726f2121";
const CONNECT_CHAR = "00020005574f4f2053706865726f2121";

const HANDLE_CHAR = "00020002574f4f2053706865726f2121"

const MAIN_SERVICE = "00010001574f4f2053706865726f2121";
const MAIN_CHAR = "00010002574f4f2053706865726f2121";

const MSG_CONNECTION = [0x75, 0x73, 0x65, 0x74, 0x68, 0x65, 0x66, 0x6F, 0x72, 0x63, 0x65, 0x2E, 0x2E, 0x2E, 0x62, 0x61, 0x6E, 0x64];
const MSG_INIT = [0x0A, 0x13, 0x0D];
const MSG_OFF = [0x0A, 0x13, 0x01];
const MSG_ROTATE = [0x0A, 0x17, 0x0F];
const MSG_ANIMATION = [0x0A, 0x17, 0x05];
const MSG_CARRIAGE = [0x0A, 0x17, 0x0D];

const MSG_MOVE = [0x0A, 0x16, 0x07]

const ESC = 0xAB;
const SOP = 0x8D;
const EOP = 0xD8;
const ESC_ESC = 0x23;
const ESC_SOP = 0x05;
const ESC_EOP = 0x50;

const MSG_ACCELEROMETER = [0x0A, 0x18, 0x00];

const CONVERSIONS = {
  INTEGER: 'i',
  FLOAT: 'f',
};

let seq = 0;


let calculateChk = (buff) => {
  let ret = 0x00;
  for (let i = 0; i < buff.length; i++) {
    ret += buff[i];
  }
  ret = ret & 255;
  return (ret ^ 255);
}


let buildPacket = (init, payload = []) => {
  let packet = [SOP];
  let body = [];
  let packetEncoded = [];

  body.push(...init);
  body.push(seq);
  body.push(...payload);

  body.push(calculateChk(body));

  for (let i = 0; i < body.length; i++) {
    if (body[i] == ESC) {
      packetEncoded.push(...[ESC, ESC_ESC]);
    } else if (body[i] == SOP) {
      packetEncoded.push(...[ESC, ESC_SOP]);
    } else if (body[i] == EOP) {
      packetEncoded.push(...[ESC, ESC_EOP]);
    } else {
      packetEncoded.push(body[i])
    }
  }

  packet.push(...packetEncoded);
  packet.push(EOP);
  seq = (seq + 1) % 140;

  return packet;
}


// ----


let connectTheDroid = (address) => {
  return new Promise((resolve, reject) => {
    noble.on('discover', (peripheral) => {
      if (peripheral.address === address) {
        noble.stopScanning();
        peripheral.connect((e) => {
          peripheral.discoverServices([CONNECT_SERVICE], (error, services) => {
            services[0].discoverCharacteristics([HANDLE_CHAR], (error, characteristics) => {
              characteristics[0].notify(true);
              characteristics[0].subscribe(async (error) => {

              });
              services[0].discoverCharacteristics([CONNECT_CHAR], (error, characteristics) => {
                characteristics[0].write(Buffer.from(MSG_CONNECTION), true, (error) => {
                  peripheral.discoverServices([MAIN_SERVICE], (error, services) => {
                    services[0].discoverCharacteristics([MAIN_CHAR], (error, characteristics) => {
                      resolve(characteristics[0]);
                    });
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

let enableAccelerometerInspection = (characteristic, callback) => {
  let dataRead = [];
  let dataToCheck = [];
  let eopPosition = -1;
  characteristic.write(Buffer.from(buildPacket(MSG_ACCELEROMETER, [0x00, 0x96, 0x00, 0x00, 0x07, 0xe0, 0x78])));
  characteristic.on('data', (data) => {
    dataRead.push(...data);
    eopPosition = dataRead.indexOf(EOP);
    dataToCheck = dataRead.slice(0);
    if (eopPosition !== dataRead.length - 1) {
      dataRead = dataRead.slice(eopPosition + 1);
    } else {
      dataRead = [];
    }
    if (eopPosition !== -1) {
      if (dataToCheck.slice(0, 5).every((v) => [0x8D, 0x00, 0x18, 0x02, 0xFF].indexOf(v) >= 0)) {
        // Decode packet
        let packetDecoded = [];
        for (let i = 0; i < dataToCheck.length - 1; i++) {
          if (dataToCheck[i] == ESC && dataToCheck[i + 1] == ESC_ESC) {
            packetDecoded.push(ESC);
            i++;
          } else if (dataToCheck[i] == ESC && dataToCheck[i + 1] == ESC_SOP) {
            packetDecoded.push(SOP);
            i++;
          } else if (dataToCheck[i] == ESC && dataToCheck[i + 1] == ESC_EOP) {
            packetDecoded.push(EOP);
            i++;
          } else {
            packetDecoded.push(dataToCheck[i])
          }
        }

        let x = Buffer.from(packetDecoded.slice(5, 9)).readFloatBE(0);
        let y = Buffer.from(packetDecoded.slice(9, 13)).readFloatBE(0);
        let z = Buffer.from(packetDecoded.slice(13, 17)).readFloatBE(0);
        callback(x, y, z);
      }
    }
  });
}

// ----

let writePacket = (characteristic, buff, waitForNotification = false, timeout = 0) => {
  return new Promise(function (resolve, reject) {

    let dataRead = [];
    let dataToCheck = [];
    let eopPosition = -1;

    let checkIsAValidRequest = (dataRead) => {
      if (dataRead[5] != 0x00) {
        characteristic.removeListener('data', listenerForRead);
        reject(dataRead[5]);
      }
    }

    let finish = () => {
      dataRead = [];
      setTimeout(() => {
        characteristic.removeListener('data', listenerForRead);
        resolve(true);
      }, timeout);
    }

    let isActionResponse = (data) => {
      let valid = false;
      valid |= data.slice(0, 2).every((v) => [0x8D, 0x09].indexOf(v) >= 0);
      valid |= data.slice(0, 2).every((v) => [0x8D, 0x08].indexOf(v) >= 0);
      valid |= data.slice(0, 3).every((v) => [0x8D, 0x00, 0x17].indexOf(v) >= 0);
      return valid;
    }

    let listenerForRead = (data) => {
      dataRead.push(...data);
      eopPosition = dataRead.indexOf(EOP);
      dataToCheck = dataRead.slice(0);
      if (eopPosition !== dataRead.length - 1) {
        dataRead = dataRead.slice(eopPosition + 1);
      } else {
        dataRead = [];
      }
      if (eopPosition !== -1) {
        // Check Package is for me
        if (isActionResponse(dataToCheck)) {
          if (waitForNotification) {
            if (dataToCheck[1] % 2 == 0) {
              finish();
            } else {
              checkIsAValidRequest(dataToCheck);
            }
          } else {
            checkIsAValidRequest(dataToCheck);
            finish();
          }
        }
      }
    };
    characteristic.on('data', listenerForRead);
    characteristic.write(Buffer.from(buff));
  });
}

// ----

let convertDegreeToHex = (degree, format = CONVERSIONS.INTEGER) => {
  var view = new DataView(new ArrayBuffer(4));
  format === CONVERSIONS.FLOAT ? view.setFloat32(0, degree) : view.setUint16(0, degree)
  return Array
    .apply(null, {
      length: format === CONVERSIONS.FLOAT ? 4 : 2
    })
    .map((_, i) => view.getUint8(i))
}

// ---- MAIN FUNCTION

let droidAddress = 'd7:1b:52:17:7b:d6';


connectTheDroid(droidAddress).then(characteristic => {
  characteristic.subscribe(async (error) => {
    if (error) {
      console.error('Error subscribing to char.');
    } else {
      console.log('Wait for init!');
      await writePacket(characteristic, buildPacket(MSG_INIT), true, 5000);

      console.log('Enable accelerometer inspection');
      enableAccelerometerInspection(characteristic, (x, y, z) => {
        console.log('----------------------')
        console.log("X:" + x);
        console.log("Y:" + y);
        console.log("Z:" + z);
      });

      console.log('Tripod transformation');
      await writePacket(
        characteristic,
        buildPacket(MSG_CARRIAGE, [0x01]),
        false,
        2000
      );

      console.log('Make a square 🔳');
      for (let i = 0; i < 4; i++) {
        await writePacket(
          characteristic,
          buildPacket(MSG_MOVE, [0xFF, ...convertDegreeToHex(i * 90), 0x00])
        );
        await new Promise(resolve => setTimeout(resolve, 200));
        await writePacket(
          characteristic,
          buildPacket(MSG_MOVE, [0x00, ...convertDegreeToHex(i * 90), 0x00])
        );
        await new Promise(resolve => setTimeout(resolve, 200));
        console.log('DONE')
      }

      console.log('Bipod transformation');
      await writePacket(
        characteristic,
        buildPacket(MSG_CARRIAGE, [0x02]),
        false,
        2000
      );

      console.log('Rotate the droid top!');
      for (let degrees = -160; degrees <= 180; degrees += 5) {
        await writePacket(
          characteristic,
          buildPacket(MSG_ROTATE, convertDegreeToHex(degrees, CONVERSIONS.FLOAT)),
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
      process.exit();

    }
  });
});
