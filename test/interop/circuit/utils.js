'use strict'

const chai = require('chai')
const expect = chai.expect
const waterfall = require('async/waterfall')
const IPFS = require('../../../src/core/index')
const createTempRepo = require('../../utils/create-repo-nodejs')
const relayConfig = require('../../utils/ipfs-factory-daemon/default-config.json')

exports.setupNode = function setupNode (addrs, circuitEnabled) {
  return new IPFS({
    repo: createTempRepo(),
    start: false,
    config: {
      Addresses: {
        Swarm: addrs
      },
      Bootstrap: [],
      EXPERIMENTAL: {
        Relay: {
          Enabled: circuitEnabled || false
        }
      }
    }
  })
}

exports.setupRelay = function setupRelay (addrs, factory, cb) {
  let relayPeer
  let relayAddrs

  waterfall([
    (pCb) => {
      factory.spawnNode(createTempRepo(), Object.assign(relayConfig, {
        Addresses: {
          Swarm: addrs
        },
        EXPERIMENTAL: {
          Relay: {
            Enabled: true,
            HOP: {
              Enabled: true,
              Active: false
            }
          }
        }
      }), (err, node) => {
        expect(err).to.not.exist()
        relayPeer = node
        pCb()
      })
    },
    (pCb) => {
      relayPeer.swarm.localAddrs((err, addrs) => {
        expect(err).to.not.exist()
        relayAddrs = addrs
        pCb()
      })
    }], (err) => {
    expect(err).to.not.exist()
    cb(null, relayPeer, relayAddrs)
  })
}

exports.addAndCat = function addAndCat (data, ipfsSrc, ipfsDst, callback) {
  waterfall([
    (cb) => ipfsDst.files.add(data, cb),
    (res, cb) => {
      expect(res[0]).to.not.be.null()
      cb(null, res[0].hash)
    },
    (hash, cb) => ipfsSrc.files.cat(hash, function (err, stream) {
      expect(err).to.be.null()

      var res = ''

      stream.on('data', function (chunk) {
        res += chunk.toString()
      })

      stream.on('error', function (err) {
        cb(err)
      })

      stream.on('end', function () {
        cb(null, res)
      })
    })
  ], callback)
}
