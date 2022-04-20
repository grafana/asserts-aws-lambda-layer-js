/* globals jest */
/* eslint-disable no-underscore-dangle */

const http = jest.requireActual('http');

http.__mockServer = {
    listen: jest.fn((opts, cb) => cb && cb(null)),
    close: jest.fn((cb) => cb && cb(null)),
    delete: jest.fn(),
    request: jest.fn()
};

http.createServer = jest.fn(() => http.__mockServer);
http.request = jest.fn();
module.exports = http;