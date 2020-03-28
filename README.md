# Free R2

A Node.js Reverse Engineering Experiment to interact with [Sphero](https://www.sphero.com/starwars?utm_source=rss&utm_medium=rss) R2D2 droid using BLE 🤖

[The complete article of this experiment is on Dev.to](https://dev.to/astagi/reverse-engineering-sphero-r2d2-with-javascript-16ip)

## Install

⚠️ I installed a forked version of Noble to make it work on MacOS Catalina.

Clone this repository and run

```sh
npm install git://github.com/taoyuan/node-xpc-connection.git
npm install git://github.com/lzever/noble.git
```

I had some issues with XCode, see [this thread](https://github.com/nodejs/node-gyp/issues/1927) for more info

## Usage

```sh
node index.js
```

If you need to discover BLE devices use

```sh
node blescanner.js
```

## License

MIT - Copyright (c) Andrea Stagi - stagi.andrea@gmail.com
