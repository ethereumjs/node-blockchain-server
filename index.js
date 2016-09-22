const leveldb = require('level')
const async = require('async')
const semaphore = require('semaphore')
const ethUtils = require('ethereumjs-util')
const BN = ethUtils.BN
const Blockchain = require('ethereumjs-blockchain')
const Block = require('ethereumjs-block')
const Network = require('devp2p')
const genesisHash = require('ethereum-common').genesisHash.v.slice(2)
const EthPeerManager = require('devp2p-eth')
const SyncManager = require('./syncManager.js')

var db = leveldb('./blockchaindb')
var blockchain = new Blockchain(db, false)

var self = this
var port = 30304

doTheTango()

function doTheTango(){

  var network = new Network({
    address: '0.0.0.0',
    publicIp: '127.0.0.1',
    port: port,
    // peerDB: peerDB,
    secretKey: new Buffer('a153387bcc66f16b6aeaed404d3c3e2ec04f3a85c6942e9de107fb8b2f71e322', 'hex'),
    capabilities: {
      eth: 61
    }
  })

  var syncManager = new SyncManager(blockchain)

  network.on('connection', function (peer) {
    var stream = peer.createStream()
    var head
    var headDetails
    var readyLock = semaphore(1)

    stream.on('end', function () {
      console.log('stream ended')
    })

    var peerMan = new EthPeerManager(stream)
    setupPeerHandlers()

    // initialize
    // lock until initialization complete
    readyLock.take(function(){
      async.series([
        getHead,
        getDetails,
      ], function () {
        var td = new Buffer(new BN(headDetails.td).toArray())
        console.log( 'peerMan.sendStatus:', td, head.hash() )

        // process.exit()

        peerMan.sendStatus(new Buffer([01]), td, head.hash(), new Buffer(genesisHash, 'hex'))
        readyLock.leave()
      })
    })

    function setupPeerHandlers(){
      
      peerMan.on('status', function (status) {
        // wait until intialization is complete before processing
        console.log('got status');
        readyLock.take(function(){
          readyLock.leave()
          console.log('prcoessing status');
          //dissconect if wrong genesis
          if (genesisHash !== status.genesisHash.toString('hex')) {
            peer.sendDisconnect(peer.DISCONNECT_REASONS.SUBPROTOCOL_REASON)
          } else {
            console.log('td: ' + status.td.toString('hex'));
            console.log('headDetails: ' + headDetails);
            syncManager.sync(headDetails.td, head.header.number, peerMan, function(){
              console.log('done syncing'); 
            })
          }
        })
      })

      peerMan.on('blockHashesFromNumber', function (data) {
        console.log(data.startNumber.toString('hex'));
        console.log('exiting....');
        process.exit()
      })

    }

    function getHead(done) {
      console.log('getHead - before')
      blockchain.getHead(function (err, h) {
        console.log('getHead - after')
        head = h
        console.log('blockchain.meta:')
        console.log(blockchain.meta)
        done()
      })
    }

    function getDetails(done) {
      console.log('getDetails - before')
      blockchain.getDetails(head.hash(), function (err, d) {
        console.log('getDetails - after', d)
        headDetails = d
        done()
      })
    }

  })


  async.series([
    function (done) {
      network.listen(port, '0.0.0.0', done)
    },
    function (done) {
      network.connect({
        address: '127.0.0.1',
        port: 30303
      }, done)
    }
  ])

  network.on('disconnect', function (dis) {
    console.log('networking', 'dissconect: ' + dis.reason)
  })

  var dpt = network.dpt
  dpt.socket.on('message', function (msg, rinfo) {
    console.log('server got msg from ' + rinfo.address + ":" + rinfo.port)
  })

  dpt.on('ping', function (ping, peer) {
    console.log('got ping ---- ')
  })

  dpt.on('pong', function (pong, peer) {
    console.log('got pong----')
  })

  dpt.on('findNode', function (findNode, peer) {
    console.log('findNode----')
      // console.log(findNode.id.toString('hex'))
  })

  dpt.on('neighbors', function (neighbors, peer) {
    console.log('neighbors----')
      // neighbors.forEach(function(n) {
      //   console.log('adding: ' + n.id.toString('hex'))
      // })
  })

  dpt.on('newPeer', function (peer) {
    console.log('newPeer')
  })

  dpt.on('error', function () {
    console.log('eeeerorrr')
  })


}


