# Hyperzone HIP-5 Protocol for Trustless SLDs and Decentralized Zone Storage

## Usage

```
➜ cd /path/to/hsd
➜ npm install hip5-hyperzone
```

To run a node with the extension, execute:

```
➜ NODE_PRESERVE_SYMLINKS=1 hsd --plugins hip5-hyperzone
```

To test the extension, run:

```
➜ node_modules/hip5-hyperzone/test.sh
```

NOTE: this test currently depends on availability of two hyperzones. I am currently replicating these from a remote server, but it is possible that my server will go down. I will update this later so that the test generates one-off, in-memory hyperzones on the fly.

## Introduction

Handshake provides a trustless, open, and globally consistent namespace that operates as a root DNS zone, but it is not intended to do more than that. As a result, there remains a gap between Handshake and other blockchain-based naming systems.

Here we propose two [HIP-5 protocols](https://github.com/handshake-org/HIPs/blob/master/HIP-0005.md) that glue together to fill the gap between Handshake and other naming systems, such as ENS for which SLDs are trustless and records are uncensorable, while eliminating drawbacks such as blockchain costs and slow update times of storing records on chain.

1. a protocol for decentralized authoritative record storage and resolution that preserves the main advantage to storing records on-chain and eliminates the main disadvantage, (near) uncensorability and slow TTL respectively.
1. a protocol for aliasing SLDs to TLDs dynamically to enable trustless SLDs on the Handshake blockchain

Handshake TLD owners can use this protocol to offer SLDs for registration via Vickrey auctions, and hsd nodes using this protocol can resolve records from an eventually consistent, cryptographically verifiable, distributed zone store with greater censorship resistance than what can be achieved with centralized nameservers.

A robust implementation of a protocol along these lines might facilitate wider adoption of Handshake and its positioning as an essential piece of infrastructure for a more decentralized internet.

### Decentralized Zone Storage

The main requirements for decentralized zone storage are: a public-key addressable data structure storing DNS records that is verifiably written by the owner of the public key and sparsely replicable, so that resolvers don't need to have the full data structure to locate (e.g. via the public key over a DHT or by querying connected protocol-capable hsd nodes) and verify individual records.

The [hypercore protocol](https://hypercore-protocol.org/) is one candidate distributed data structure with satisfactory properties, on top of which zone storage can be written. [Hyperzone](https://github.com/lukeburns/hyperzone) is an experimental implementation of such a data structure that can be replicated with peers discovered via a DHT using the [Replicator](https://github.com/lukeburns/replicator) library. Other distributed zone protocols might choose to use a different data structure and protocol.

If a Handshake TLD _{tld}_ sets a HIP-5 NS record "_{public-key}_._hyperzone", then any HIP-5 extension implementing the `hyperzone` protocol must upon receiving queries:

1. Locate a peer in possession of a replica of the hyperzone addressed by the public key _{public-key}_.
2. Verify and resolve records from that hyperzone.
3. Listen for peers with updates to the hyperzone.
4. Cache and replicate the hyperzone with peers.

We will leave the particular discovery mechanisms, caching strategies, and replication strategies used to individual implementations. Particular nodes should probably have control over some of these strategies, and experimentation may be required to optimize zone availability while minimizing replication and networking costs.

### TLD Aliases

If a Handshake TLD _{tld}_ sets a HIP-5 NS record "_{hip5data}_._aliasing", then any HIP-5 extension implementing the `aliasing` protocol must:

1. For any SLD _{label}.{tld}_, compute the _{alias}_: the [base32](https://github.com/bcoin-org/bs32) encoding of the [blake3](https://github.com/connor4312/blake3) hash of _{label}_ concatenated (as strings) with the _first_ label of _{hip5data}_.
2. Forward the original DNS query for _{label}.{tld}_ to _{alias}_ after substituting _{label}.{tld}_ for _{alias}_, then return the response after substituting _{alias}_ for _{label}.{tld}_.

A TLD owner wishing to open their TLD for SLD registration should set a single HIP-5 NS record as above with a unique public key as hip5 data, then [set their TLD to renew-only](https://github.com/handshake-org/hsd/pull/567). They can use the public key to prove that they originally owned the TLD.

A HIP-5 extension supporting the `aliasing` protocol might also resolve top-level records for the TLD using the public key as a decentralized zone address, as we do in the experimental implementation discussed below. If it does, it must specify the distributed zone protocol that it is using as a sublabel, such as: `{public-key}._hyper._aliasing`. For this reason, only the first label of _{hip5data}_ should be used to compute _{alias}_.
