#!/usr/bin/env bash

pgrep -f replicate-zones | xargs kill -9 # kill old replicator process if still running

DIR=$(dirname $0)

set -e
export NODE_PRESERVE_SYMLINKS=1
export HSD_NETWORK=regtest

hsd \
  --network=regtest \
  --plugins=hip5-hyperzone \
  --daemon

sleep 2

# TLD
TLD="handshake"
TLD_KEY=$(node $DIR/create-dummy-zones $TLD) # hyperzone with TLD records
TLD_NS="$TLD_KEY._hyperzone._aliasing."

echo TLD=$TLD
echo TLD_KEY=$TLD_KEY

# SLD
NAME="bob"
SLD="$NAME.$TLD"
SLD_KEY=$(node $DIR/create-dummy-zones $SLD) # hyperzone with SLD records
SLD_ALIAS=$(node $DIR/get-alias "$NAME$TLD_KEY") # bob.handshake alias
SLD_NS="$SLD_KEY._hyperzone."

echo SLD=$SLD
echo SLD_KEY=$SLD_KEY
echo SLD alias from blake3 hash of $NAME$TLD_KEY:
echo SLD_ALIAS=$SLD_ALIAS

node $DIR/replicate-zones $TLD $SLD & # start replicator process
PID=$!
echo "Launched replicator process (pid=$PID) — if the test fails, you may need to kill this manually."

echo "Generating a new address and registering TLD: $TLD"
hsd-rpc generatetoaddress 100 `hsw-rpc getnewaddress` > /dev/null
hsw-rpc sendopen $TLD > /dev/null
hsd-rpc generatetoaddress 10 `hsw-rpc getnewaddress` > /dev/null
hsw-rpc sendbid $TLD 1 1 > /dev/null
hsd-rpc generatetoaddress 10 `hsw-rpc getnewaddress` > /dev/null
hsw-rpc sendreveal > /dev/null
hsd-rpc generatetoaddress 10 `hsw-rpc getnewaddress` > /dev/null
hsw-rpc sendupdate $TLD "{\"records\":[{\"type\":\"NS\", \"ns\":\"$TLD_NS\"}]}" > /dev/null
hsd-rpc generatetoaddress 10 `hsw-rpc getnewaddress` > /dev/null

echo "Added NS record to $TLD."
hsw-rpc getnameresource $TLD

echo "Generating a new address and registering TLD: $SLD_ALIAS"
hsd-rpc generatetoaddress 100 `hsw-rpc getnewaddress` > /dev/null
hsw-rpc sendopen $SLD_ALIAS > /dev/null
hsd-rpc generatetoaddress 10 `hsw-rpc getnewaddress` > /dev/null
hsw-rpc sendbid $SLD_ALIAS 1 1 > /dev/null
hsd-rpc generatetoaddress 10 `hsw-rpc getnewaddress` > /dev/null
hsw-rpc sendreveal > /dev/null
hsd-rpc generatetoaddress 10 `hsw-rpc getnewaddress` > /dev/null
hsw-rpc sendupdate $SLD_ALIAS "{\"records\":[{\"type\":\"NS\", \"ns\":\"$SLD_NS\"}]}" > /dev/null
hsd-rpc generatetoaddress 10 `hsw-rpc getnewaddress` > /dev/null

echo "Added NS record to $SLD_ALIAS."
hsw-rpc getnameresource $SLD_ALIAS

dig @127.0.0.1 -p 25350 $SLD > /dev/null # trigger resolver to fetch TLD and SLD hyperzones

sleep 4 # wait for hyperzones to replicate

echo ""
echo "BOTH $TLD AND $SLD SHOULD RETURN A RECORDS 66.42.108.201:"

dig @127.0.0.1 -p 25350 $TLD # serve hyperzone
dig @127.0.0.1 -p 25350 $SLD # serve hyperzone

sleep 2

hsd-rpc stop
kill -9 $PID # kill replicator process
