const util = require('util')
const EventEmitter = require('events').EventEmitter
const Transaction = require('ethereumjs-tx')
const Block = require('ethereumjs-block')
const ethUtil = require('ethereumjs-util')
const rlp = ethUtil.rlp

const OFFSET = 0x10
const TYPES = {
  0x0: 'status',
  0x1: 'getTransactions',
  0x2: 'transactions',
  0x3: 'getBlockHashes',
  0x4: 'blockHashes',
  0x5: 'getBlocks',
  0x6: 'blocks',
  0x7: 'newBlock',
  0x8: 'blockHashesFromNumber'
}

const OFFSETS = {
  'status': 0x0,
  'getTransactions': 0x1,
  'transactions': 0x2,
  'getBlockHashes': 0x3,
  'blockHashes': 0x4,
  'getBlocks': 0x5,
  'blocks': 0x6,
  'newBlock': 0x7,
  'blockHashesFromNumber': 0x8
}

var Manager = module.exports = function(stream) {
  // Register as event emitter
  EventEmitter.call(this)
  var self = this
  this.version = 61
  this.stream = stream
  this.stream._prefix = false
  stream.on('data', function(data){
    self.parse(data)
  })

  stream.on('end', function(){
    self._end = true
  })

  stream.on('error', function(){
    self._end = true
  })
}

util.inherits(Manager, EventEmitter)

//parses an array of transactions
function parseTxs(payload) {
  var txs = []
  for (var i = 0; i < payload.length; i++) {
    txs.push(new Transaction(payload[i]));
  }
  return txs;
}

function parseBlocks(payload) {
  //blocks
  var blocks = [];
  for (var i = 0; i < payload.length; i++) {
    blocks.push(new Block(payload[i]));
  }
  return blocks;
}


//packet parsing methods
var parsingFunc = {
  status: function(payload) {
    return {
      ethVersion: payload[0][0],
      networkID: payload[1],
      td: payload[2],
      bestHash: payload[3],
      genesisHash: payload[4]
    };
  },
  transactions: function(payload) {
    return parseTxs(payload);
  },
  getBlockHashes: function(payload) {
    return {
      hash: payload[0],
      maxBlocks: payload[1]
    };
  },
  blockHashes: function(payload) {
    return payload;
  },
  getBlocks: function(payload) {
    return payload;
  },
  blocks: function(payload) {
    return parseBlocks(payload);
  },
  newBlock: function(payload) {
    return {
      block: new Block(payload[0]),
      td: payload[1]
    };
  },
  blockHashesFromNumber: function(payload) {
    return {
      startNumber: payload[0],
      max: payload[1] 
    } 
  }
};

Manager.prototype.parse = function(data) {
  var type = TYPES[data.slice(0, 1)[0] - OFFSET];
  //try{
  console.log('recieved: ' + type);
  var parsed = parsingFunc[type](rlp.decode(data.slice(1)))
  if(type === 'status'){
    this.status = parsed;  
  }

  this.emit(type, parsed);
  //}catch(e){
  //   this.emit('error', e);
  //}
};

Manager.prototype.send = function(type, data, cb){
  var msg = Buffer.concat([new Buffer([type + 16]), rlp.encode(data)])
  // console.log(msg.toString('hex'));
  this.stream.write(msg, cb);
};

//packet sending methods
Manager.prototype.sendStatus = function(id, td, bestHash, genesisHash, cb) {
  var msg = [
    new Buffer([this.version]),
    id,
    td,
    bestHash,
    genesisHash
  ]

  this.send(OFFSETS.status, msg, cb);
};

/**
 * Specify (a) transaction(s) that the peer should make sure is included on its
 * transaction queue.
 * @method sendTransactions
 * @param {Array.<Transaction>} transaction
 * @param {Function} cb
 */
Manager.prototype.sendTransactions = function(transactions, cb) {
  var msg = [];
  transactions.forEach(function(tx) {
    msg.push(tx.serialize());
  });
  this.send(OFFSETS.transactions, msg, cb);
};

Manager.prototype.sendGetBlockHashes = function(startHash, max, cb) {
  var msg = [startHash, ethUtil.intToBuffer(max)];
  this.send(OFFSETS.getBlockHashes, msg, cb);
};

// Manager.prototype.sendBlockHashes = function(hashes, cb) {
//   this.send(OFFSETS.blockHashes, cb)
// };

Manager.prototype.sendGetBlocks = function(hashes, cb) {
  hashes = hashes.slice();
  this.send(OFFSETS.getBlocks, hashes, cb);
};

/**
 * Specify (a) block(s) that the peer should know about.
 * @method sendBlocks
 * @param {Array.<Block>} blocks
 * @param {Function} cb
 */
Manager.prototype.sendBlocks = function(blocks, cb) {
  var msg = [];

  blocks.forEach(function(block) {
    msg.push(block.serialize());
  });

  this.send(OFFSETS.blocks, msg, cb);
};

/**
 * Specify (a) block(s) that the peer should know about.
 * @method sendBlocks
 * @param {Array.<Block>} block
 * @param {Number} td tottal difficulty
 * @param {Function} cb
 */
Manager.prototype.sendNewBlock = function(block, td) {
  var msg = [block.serialize(false), td];
  this.send(OFFSETS.newBlock, msg, cb);
}

Manager.prototype.sendBlockHashesFromNumber = function(startNumber, maxNumber, cb){
  var msg = [startNumber, maxNumber]
  this.send(OFFSETS.blockHashesFromNumber, msg, cb);
}

Manager.prototype.fetchBlockHashes = function(startHash, max, cb) {
  this.once('blockHashes', cb);
  this.sendGetBlockHashes(startHash, max);
};

Manager.prototype.fetchBlocks = function(hashes, cb) {
  this.once('blocks', cb);
  this.sendGetBlocks(hashes);
};


