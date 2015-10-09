const leveldb = require('level')
const VM = require('ethereumjs-vm')
const Blockchain = require('ethereumjs-blockchain')
const StateTrie = require('merkle-patricia-tree/secure')

var blockchainDb = leveldb('./blockchaindb')
var stateDb = leveldb('./statedb')
var blockchain = new Blockchain(blockchainDb, false)
var stateTrie = new StateTrie(stateDb)
var vm = new VM(stateTrie, blockchain)

var blockNumber
var blockHash

vm.on('step', function (info) {
  console.log(info.opcode.opcode, info.address.toString('hex'))
})

vm.on('beforeTx', function (tx) {
  console.log('tx.hash:', tx.hash().toString('hex'))
})

vm.on('beforeBlock', function (block) {
  blockNumber = block.header.number.toString('hex')
  blockHash = block.hash().toString('hex')
})

vm.on('afterBlock', function (results) {
  // if (results.error) console.log(results.error)
  var out = blockNumber
  out += ' hash: ' + blockHash
  out += ' error: ' + results.error
  out += ' txs: ' + results.receipts.length
  console.log(results)
  console.log(out)
  if (results.error) {
    process.exit()
  }
})

// console.log('generateGenesis - before')
// vm.generateCanonicalGenesis(function(){
//   console.log('generateGenesis - after')
console.log('runBlockchain - before')
vm.runBlockchain(function () {
  console.log('runBlockchain - after')
})
// })

// 010b25
