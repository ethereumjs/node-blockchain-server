const BN = require('ethereumjs-util').BN
const genesisHash = require('ethereum-common').genesisHash.v.slice(2)
const async = require('async')
const ethUtil = require('ethereumjs-util')
const Block = require('ethereumjs-block')

var SyncManager = module.exports = function(blockchain) {
  this.maxNumToDownload = 32 // the number of hashed to get per request TODO: vary on rating of peer
  this.syncingPeers = {}
  this.blockchain = blockchain

  /**
   * hash enum
   * fetching, fetched, needed
   */
  this.hashes = {}
}

SyncManager.prototype.sync = function(bctd, height, peer, cb) {
  var td = new BN(peer.status.td)
  var bestHash = peer.status.bestHash.toString('hex')
  if (new BN(bctd).cmp(td) < 0) {
    peer.doneSyncing = false //is the ordered hash list full?
    peer.skipList = [peer.status.bestHash]
    this.hashes[bestHash] = 'needed'
    this.hashes[genesisHash] = 'have'
    this.downloadChain(peer, ethUtil.bufferToInt(height) + 1, cb)
  } else {
    cb()
  }
}

SyncManager.prototype.downloadChain = function(peer, startHeight, cb){
  var self = this
  console.log('downloading', startHeight, this.maxNumToDownload);

  peer.fetchBlockHeaders(startHeight, this.maxNumToDownload, null, null, function(headers){
    
    const hashes = headers.map(function(header){
      return ethUtil.rlphash(header)
    })

    peer.fetchBlockBodies(hashes, function(bodies){
      
      const blocks = bodies.map(function(body, index){
        body.unshift(headers[index])
        return new Block(body)
      })

      async.series(blocks.map(function(block, index){
        return function(done){
          console.log('put block', startHeight + index)
          self.blockchain.putBlock(block, done)
        }
      }), function(err){
        if(err){
          //TODO: Drop peer
          console.log(err)
          return cb(err)
        }

        var lastHash = hashes[hashes.length - 1]

        if(lastHash && lastHash.toString('hex') === peer.status.bestHash.toString('hex'))
          return cb()
        else{
          self.downloadChain(peer, startHeight + self.maxNumToDownload, cb)
        }
      })

    })
  })

}
