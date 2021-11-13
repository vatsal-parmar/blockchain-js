var sha256 = require("js-sha256").sha256;
const express = require("express");
const http = require("http");
const https = require("https");
const app = express();
const { v4: uuidv4 } = require("uuid");
var url = require("url");

app.use(express.json());

class Blockchain {
  constructor(chain = [], transactions = []) {
    this.chain = chain;
    this.transactions = transactions;
    this.createBlock(1, "0");
    this.nodes = new Set();
  }

  createBlock = (proof, previousHash) => {
    let block = {
      index: this.chain.length + 1,
      timeStamp: new Date().toString(),
      proof,
      previousHash,
      transactions: this.transactions,
    };
    this.transactions = [];
    this.chain.push(block);
    return block;
  };
  getPreviousBlock = () => {
    return this.chain[this.chain.length - 1];
  };
  proofOfWork = (previousProof) => {
    let newProof = 1;
    let checkProof = false;
    while (checkProof === false) {
      let hashOperation = sha256(
        (newProof * newProof - previousProof * previousProof).toString()
      );
      if (hashOperation.substring(0, 4) === "0000") {
        checkProof = true;
      } else {
        checkProof = false;
        newProof += 1;
      }
    }
    return newProof;
  };
  hash = (block) => {
    let encodedBlock = sha256(JSON.stringify(block));
    return encodedBlock;
  };
  isChainValid = (chain) => {
    let previousBlock = chain[0];
    let blockIndex = 1;
    while (blockIndex < chain.length) {
      let block = chain[blockIndex];
      if (block["previousHash"] !== this.hash(previousBlock)) {
        return false;
      }
      let previousProof = previousBlock["proof"];
      let proof = block["proof"];
      let hashOperation = sha256(
        (proof * proof - previousProof * previousProof).toString()
      );
      if (hashOperation.substring(0, 4) !== "0000") {
        return false;
      }
      previousBlock = block;
      blockIndex += 1;
      return true;
    }
  };
  addTransactions = (sender, receiver, amount) => {
    this.transactions.push({ sender, receiver, amount });
    let previousBlock = this.getPreviousBlock();
    return previousBlock["index"] + 1;
  };
  addNode = (address) => {
    let parsedUrl = url.parse(address, true, true);
    this.nodes.add(parsedUrl.host);
  };
  replaceChain = async () => {
    let network = this.nodes;
    var longestChain = null;
    var maxLength = this.chain.length;
    let myRequest = new Promise((resolve, reject) => {
      var client = http;
      var method = "http";
      if (url.toString().indexOf("https") === 0) {
        client = https;
        method = "https";
      }

      network.forEach((value) => {
        client
          .get(`${method}://${value}/`, (res) => {
            let data = "";
            res.on("data", (chunk) => {
              data += chunk;
            });
            res.on("end", () => {
              let chainData = JSON.parse(data);
              let length = parseInt(chainData.length);
              let chain = chainData.chain;
              if (length > maxLength && this.isChainValid(chain)) {
                maxLength = length;
                longestChain = chain;
              }
              resolve(true);
            });
          })
          .on("error", (err) => {
            console.log(err.message);
            reject(false);
          })
          .end();
      });
    });
    await myRequest;
    if (longestChain) {
      this.chain = longestChain;
      console.log(this.chain);
      return true;
    } else {
      return false;
    }
  };
}

let nodeAddress = uuidv4().replace("-", "").toString();

let blockchain = new Blockchain();

const mineBlock = (req, res) => {
  let previousBlock = blockchain.getPreviousBlock();
  let previousProof = previousBlock["proof"];
  let proof = blockchain.proofOfWork(previousProof);
  let previousHash = blockchain.hash(previousBlock);
  blockchain.addTransactions("mine-reward", nodeAddress, 1);
  let block = blockchain.createBlock(proof, previousHash);

  res.status(200).send({
    message: "successfully mined block",
    ...block,
  });
};

const getBlockChain = (req, res) => {
  res
    .status(200)
    .send({ chain: blockchain.chain, length: blockchain.chain.length });
};

const isChainValid = (req, res) => {
  let isVaild = blockchain.isChainValid(blockchain.chain);
  if (isVaild) {
    res.status(200).send("blockchain is valid");
  } else {
    res.status(200).send("blockchain is not valid");
  }
};

const addTransactions = (req, res) => {
  let data = req.body;
  let transactionKeys = ["sender", "receiver", "amount"];
  for (let i = 0; i < transactionKeys.length; i++) {
    if (!data[transactionKeys[i]])
      res.status(400).send("Some elements of the transaction are missing");
  }
  let index = blockchain.addTransactions(
    data["sender"],
    data["receiver"],
    data["amount"]
  );
  res
    .status(201)
    .send({ message: `this transaction will be added to block ${index}` });
};

const connectNode = (req, res) => {
  let data = req.body;
  let nodes = data["nodes"];
  if (!nodes) res.status(400).send("no node");
  for (let i = 0; i < nodes.length; i++) {
    blockchain.addNode(nodes[i]);
  }
  let updatedNodes = [];
  blockchain.nodes.forEach((node) => updatedNodes.push(node));
  res.status(200).send({
    message:
      "All the noeds are now connected.The vcoin blockChain now contains following nodes",
    totalNodes: updatedNodes,
  });
};

const replaceChain = async (req, res) => {
  let isChainReplaced = await blockchain.replaceChain();
  if (isChainReplaced) {
    res.status(200).send({
      message: "The node has different chains so the chain was replaced",
      newChain: blockchain.chain,
    });
  } else {
    res.status(200).send({
      message: "All good.The chain is the largest one",
      chain: blockchain.chain,
    });
  }
};

app.get("/mine-block", mineBlock);
app.get("/", getBlockChain);
app.get("/is-valid", isChainValid);
app.post("/add-transaction", addTransactions);
app.post("/connect-node", connectNode);
app.get("/replace-chain", replaceChain);

app.listen(3000, () => console.log("blockchain is running on port 3000"));
