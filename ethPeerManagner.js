const util = require('util')
const EventEmitter = require('events').EventEmitter
const Transaction = require('ethereumjs-tx')
const Block = require('ethereumjs-block')
const ethUtil = require('ethereumjs-util')
const rlp = ethUtil.rlp

const OFFSET = 0x10
const TYPES = {
  0x0: 'status',
  0x1: 'newBlockHashes',
  0x2: 'transactions',
  0x3: 'getBlockHeaders',
  0x4: 'blockHeaders',
  0x5: 'getBlockBodies',
  0x6: 'blockBodies',
  0x7: 'newBlock',
}

const OFFSETS = {
  'status': 0x0,
  'newBlockHashes': 0x1,
  'transactions': 0x2,
  'getBlockHeaders': 0x3,
  'blockHeaders': 0x4,
  'getBlockBodies': 0x5,
  'blockBodies': 0x6,
  'newBlock': 0x7,
}

var Manager = module.exports = function(stream) {
  // Register as event emitter
  EventEmitter.call(this)
  var self = this
  this.version = 62
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
  getBlockHeaders: function(payload) {
    const parsed = {
      maxBlocks: ethUtil.bufferToInt(payload[1]),
      skip: ethUtil.bufferToInt(payload[2]),
      reverse: (payload[3][0] === 1) ? true : false
    };

    if(payload[0].length < 6)
      parsed.startNumber = ethUtil.bufferToInt(payload[0])
    else
      parsed.startHash = payload[0]

    return parsed
  },
  blockHeaders: function(payload) {
    return payload
  },
  getBlockBodies: function(payload) {
    return payload;
  },
  newBlockHashes: function(payload) {
    return payload;
  },
  blockBodies: function(payload) {
    return payload;
  },
  newBlock: function(payload) {
    return {
      block: new Block(payload[0]),
      td: payload[1]
    };
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

Manager.prototype.sendNewBlockHashes = function(blockHashes, cb) {
  blockHashes = blockHashes.slice()
  this.send(OFFSETS.newBlockHashes, blockHashes, cb);
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
    msg.push(tx.serialize(false));
  });
  this.send(OFFSETS.transactions, msg, cb);
};

Manager.prototype.sendGetBlockHeaders = function(startHeight, maxHeaders, skip, reverse, cb) {
  var msg = [
    startHeight,
    maxHeaders || 255,
    skip || 0,
    reverse ? 1 : 0
  ];
  this.send(OFFSETS.getBlockHeaders, msg, cb);
};


/**
 * Specify (a) block(s) that the peer should know about.
 * @method sendBlocks
 * @param {Array.<Block>} blocks
 * @param {Function} cb
 */
Manager.prototype.sendBlockHeaders = function(headers, cb) {
  var msg = headers.slice()
  this.send(OFFSETS.blockHeaders, msg, cb);
};

Manager.prototype.sendGetBlockBodies = function(hashes, cb) {
  var msg = hashes.slice()
  this.send(OFFSETS.getBlockBodies, msg, cb);
};

Manager.prototype.sendBlockBodies = function(blocks, cb) {
  var msg = [];

  blocks.forEach(function(block, index) {
    var body = block.serialize(false)
    body.shift()
    msg.push(body);
  });

  this.send(OFFSETS.blockBodies, msg, cb);
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


Manager.prototype.fetchBlockHeaders = function(startHeight, maxHeaders, skip, reverse, cb) {
  this.once('blockHeaders', cb);
  this.sendGetBlockHeaders(startHeight, maxHeaders, skip, reverse);
};

Manager.prototype.fetchBlockBodies = function(hashes, cb) {
  this.once('blockBodies', cb);
  this.sendGetBlockBodies(hashes);
};


