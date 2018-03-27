var express = require('express')
var parse = require('url-parse')
var app = express()
var bodyParser = require('body-parser');  
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
var sha256 = require('sha256') //package to provide hashes
const requests = require('request')


class Blockchain {

  constructor() {
    this.current_transactions = []
    this.chain = new Array()
    this.nodes = new Set()
    // Create the genesis block
    this.newBlock({proof: 100, previous_hash: '1'})
  }
 
  lastBlock(){
    return this.chain[this.chain.length-1]
  }

  registerNode(address) {

    parsed_url = parse(address)
    this.nodes.push(parsed_url.host)
  }

    /*
    Determine if a given blockchain is valid
    */
  validChain(chain) {
    
    var lastBlock = chain[0]
    
    var currentIndex = 1

    while(currentIndex < chain.length) {
      var block = chain[currentIndex]
      console.log(`${lastBlock}`)
      console.log(`${block}`)
      console.log("\n------------\n")
      // Check that the hash of the block is correct
      if(block['previous_hash'] != this.hash(lastBlock)) {
        return false
      }
      
      // Check that the Proof of Work is correct
      if(!(this.constructor.validProof(lastBlock['proof'], block['proof']))){
        return false
      }

      lastBlock = block
      currentIndex += 1
    }
    return true
  }

  static hash(block){
    /*
    Creates a SHA-256 hash of a Block
    : param block: Block
    */
    // We must make sure that the Object is Ordered, or we'll have inconsistent hashes
    const blockString = JSON.stringify(block, Object.keys(block).sort())
    return sha256(blockString)
  }
  resolveConflicts() {
    /*
    This is our consensus algorithm, it resolves conflicts
    by replacing our chain with the longest one in the network.

    : return: True if our chain was replaced, False if not
    */
    neighbours = this.nodes
    newChain = null
    max_length = this.chain.length

 
    neighbours.forEach(function(node) {
      response = requests.get(`http://${node}/chain`)
                         .on('response', function(res) {
                          if(res.statusCode == 200){
                            length = res.json()['length']
                            chain = res.json()['chain']

                            // Check if the length is longer and the chain is valid
                            if(length > max_length && this.validChain(chain)) {
                               max_length = length
                               newChain = chain
                            }
                          }
                 })
    });

    if(newChain){ this.chain = newChain; return true}


    return false;
  }

  newBlock(proof, previous_hash){
    /* 
    Create a new Block in the Blockchain

    : param proof: The proof given by the Proof of Work algorithm
    : param previous_hash: Hash of previous Block
    : return: New Block
    */

    const block = {
      'index': this.chain.length + 1,
      'timestamp': Date.now(),
      'transactions': this.current_transactions,
      'proof': proof,
      'previous_hash': previous_hash !== null ?  previous_hash : this.constructor.hash(this.chain.slice(-1)[0]), //Optional funtion argument
    }

    this.current_transactions = []
     
    this.chain.push(block)
    
    return block
  }

   /* 
    Creates a new transaction to go into the next mined Block
    */
  newTransaction(sender, recipient, amount) {

    this.current_transactions.push({
      'sender': sender,
      'recipient': recipient,
      'amount': amount,
    })

    return this.lastBlock()['index'] + 1
  }

  proofOfWork(lastProof) {
    /*
    Simple Proof of Work Algorithm:
    - Find a number p' such that hash(pp') contains leading 4 zeroes, where p is the previous p'
    - p is the previous proof, and p' is the new proof
    */

    var proof = 0
    while(this.constructor.validProof(lastProof, proof) == false) {
       proof += 1
    }

    return proof
  }

  static validProof(lastProof, proof) {
    const guess = sha256(`${lastProof}${proof}`)
    return guess.slice(0,4) === "0000"
  }
}


// Make unique address for nodes
function uuidv4() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    var r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}
node_identifier = uuidv4()

blockChain = new Blockchain()

app.get('/mine', function mine(req, res) {

  lastBlock = blockChain.lastBlock()
  lastProof = blockChain.lastProof
  console.log(blockChain.chain)
  proof = blockChain.proofOfWork(lastProof)

  blockChain.newTransaction(
    sender="0",
    recipient=node_identifier,
    amount=1,
  )

  // Forge the new Block by adding it to the chain
  previousHash = blockChain.constructor.hash(lastBlock)
  block = blockChain.newBlock(proof, previousHash)
  console.log(lastBlock)
  response = {
    'message': "New Block Forged",
    'index': block['index'],
    'transactions': block['transactions'],
    'proof': block['proof'],
    'previous_hash': block['previous_hash'],
  }

  res.status(200).json(response)
})

app.get('/chain', function fullChain(req, res){
  response = {
    'chain': blockChain.chain,
    'length': blockChain.chain.length,
  }

  res.status(200).json(response)
})


//Still working on

app.get('/nodes/resolve', function consensus(req, res){
  replaced = blockChain.resolveConflicts()

  if(replaced) {
    response = {
      'message': "Our chain was replaced",
      'new_chain': blockChain.chain
    }
  }
  else {
    response = {
      'message': "Our chain is authoritative",
      'new_chain': blockChain.chain
    }
  }

  res.status(200).json(response)
})

app.listen(3000)
