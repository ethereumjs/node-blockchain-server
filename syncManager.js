const BN = require('ethereumjs-util').BN
const genesisHash = require('ethereum-common').genesisHash.v.slice(2)
const async = require('async')
const ethUtil = require('ethereumjs-util')

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
  console.log('downloading');
  peer.sendBlockHashesFromNumber(startHeight,  this.maxNumToDownload)
  peer.once('blockHashes', function(hashes){
    console.log('got blockHashes');
    peer.fetchBlocks(hashes, function(blocks){
      self.blockchain.putBlocks(blocks, function(){
        console.log('added blocks');
        console.log(self.blockchain.meta);

        var lastHash = hashes[hashes.length - 1]
        if(lastHash && lastHash.toString('hex') === peer.status.bestHash.toString('hex'))
          return cb()
        else{
          console.log(startHeight);
          self.downloadChain(peer, startHeight + self.maxNumToDownload, cb)
        }
      })
    })
  })
}
