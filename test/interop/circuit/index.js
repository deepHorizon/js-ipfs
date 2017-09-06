/* eslint max-nested-callbacks: ["error", 8] */
/* eslint-env mocha */
'use strict'

const chai = require('chai')
const dirtyChai = require('dirty-chai')
const expect = chai.expect
const waterfall = require('async/waterfall')
const parallel = require('async/parallel')
const Factory = require('../../utils/ipfs-factory-daemon/index')
const GoDaemon = require('../daemons/go')

const utils = require('./utils')

chai.use(dirtyChai)

describe('circuit interop', function () {
  this.timeout(20 * 1000)

  let jsTCP
  let jsWS
  let jsRelayPeer
  let jsRelayAddrs
  let goTCP = new GoDaemon()
  let goRelayAddrs
  let factory = new Factory()

  beforeEach((done) => {
    jsTCP = utils.setupNode([
      '/ip4/0.0.0.0/tcp/9002'
    ])

    jsWS = utils.setupNode([
      '/ip4/0.0.0.0/tcp/9003/ws'
    ])

    waterfall([
      (pCb) => utils.setupRelay(['/ip4/127.0.0.1/tcp/61452/ws', '/ip4/127.0.0.1/tcp/61453'], factory, pCb),
      (peer, addr, pCb) => {
        jsRelayAddrs = addr
        jsRelayPeer = peer
        pCb()
      },
      (pCb) => jsWS.start(pCb),
      (pCb) => jsTCP.start(pCb),
      (pCb) => goTCP.start(pCb),
      (pCb) => {
        goTCP.api.id((err, peer) => {
          expect(err).to.not.exist()
          console.log(JSON.stringify(peer.addresses))

          goRelayAddrs = peer.addresses
          pCb()
        })
      }
    ], done)
  })

  afterEach((done) => {
    waterfall([
      (cb) => jsWS.stop(cb),
      (cb) => jsTCP.stop(cb),
      (cb) => goTCP.stop(cb),
      (cb) => factory.dismantle((err) => done(err))
    ], done)
  })

  it('jsES <-> js-relay <-> jsTCP', function (done) {
    let addr = goRelayAddrs.filter((a) => !a.toString().includes('/p2p-circuit'))
    parallel([
      (cb) => jsWS.swarm.connect(addr[0], cb),
      (cb) => jsTCP.swarm.connect(addr[1], cb)
    ], (err) => {
      expect(err).to.not.exist()
      waterfall([
        (cb) => jsTCP.swarm.connect(jsWS._peerInfo, cb),
        (conn, cb) => utils.addAndCat(new jsTCP.types.Buffer('Hello world over circuit!'),
          jsWS,
          jsTCP,
          (err, data) => {
            expect(err).to.not.exist()
            expect(data).to.be.equal('Hello world over circuit!')
            cb()
          })
      ], done)
    })
  })

  it('goTCP <-> js-relay <-> jsWS', function (done) {
    let addr = jsRelayAddrs.filter((a) => !a.toString().includes('/p2p-circuit'))
    parallel([
      (cb) => jsWS.swarm.connect(addr[0], cb),
      (cb) => goTCP.api.swarm.connect(addr[1], cb)
    ], (err) => {
      expect(err).to.not.exist()
      waterfall([
        (cb) => goTCP.api.swarm.connect(jsWS._peerInfo, cb),
        (conn, cb) => utils.addAndCat(new jsTCP.types.Buffer('Hello world over circuit!'),
          jsWS,
          goTCP.api,
          (err, data) => {
            expect(err).to.not.exist()
            expect(data).to.be.equal('Hello world over circuit!')
          })
      ], done)
    })
  })
})
