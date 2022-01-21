#!/usr/bin/env bash

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
TLD_KEY="fmneqlr3nsxu7ipzxj3r5kvlejt5kqddu6zzzjmazuzomfoyhfyq" # hyperzone with TLD records
TLD_NS="$TLD_KEY._hyperzone._aliasing."

# SLD
NAME="bob"
SLD="$NAME.$TLD"
SLD_KEY="wgdku42pbm6wz7vjg5klpm5wkyh47pmdschw56s5iabntz2cm7tq" # hyperzone with SLD records
SLD_DIGEST="f42259a5a747b362c66f8093372a8c735a99563a9451c032263a3d927dcbb7ed" # digest for bob.handshake and public key $SLD_KEY
SLD_ALIAS=$(./get-alias "$NAME$TLD_KEY") # bob.handshake -> 337momokst44stq3zcc4sw4tox5behzcnd5ahjgqwevefi4mjclq
SLD_NS="$SLD_KEY._hyperzone."

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
# hsw-rpc sendupdate $SLD_ALIAS "{\"records\":[{\"type\":\"NS\", \"ns\":\"$SLD_NS\"}, {\"type\":\"DS\", \"keyTag\": 1, \"algorithm\": 15, \"digestType\": 2, \"digest\": \"$SLD_DIGEST\"}]}" > /dev/null # TODO: sign zone records

echo "Added NS record to $SLD_ALIAS."
hsw-rpc getnameresource $SLD_ALIAS

# dig @127.0.0.1 -p 25350 $TLD > /dev/null # fetch SLD hyperzone
dig @127.0.0.1 -p 25350 $SLD # fetch SLD hyperzone

sleep 2 # wait for hyperzone to replicate

echo ""
echo "BOTH $TLD AND $SLD SHOULD RETURN A RECORDS 66.42.108.201:"

dig @127.0.0.1 -p 25350 $TLD # serve hyperzone
dig @127.0.0.1 -p 25350 $SLD # serve hyperzone

sleep 2

hsd-rpc stop
