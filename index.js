const PROTOCOL = '_hyper'
const Hip5 = require('hip5')
const Hyperzone = require('hyperzone')
const Replicator = require('@hyperswarm/replicator')
const base32 = require('bs32')
const { Zone, wire: { types, typesByVal, Question } } = require('bns')
const blake3 = require('blake3')
const { Struct } = require('bufio')
const { Environment } = require('nunjucks')

const env = new Environment()
env.addFilter('hash', str => base32.encode(blake3.hash(str)))

class Plugin extends Hip5 {
  static id = 'hip5-hyper'

  constructor (node) {
    super(PROTOCOL, node)
    this.pool = node.pool
    this.config = node.config

    this.replicator = new Replicator()
    this.hyperzones = new Map()

    this.ns.middle = this._hip5('_hyper', this.hyper, this._hip5(['_dynamic', '_hyper'], this.dynamic))

    this.logger.info('init hip5-hyper')
  }

  async hyper (key, name, type) {
     const zone = this.hyperzones.get(key)
     if (zone) {
       return await zone.resolve(name, type)
     } else {
       this.add(key, name)
       return null
     }
   }

   async add (key, name) {
     const zone = new Hyperzone(name, `${this.config.prefix}/hyperzones/${name}`, key, { Zone })
     this.hyperzones.set(key, zone)
     await this.replicator.add(zone.db, { client: true, server: false })
     return zone
   }

   async remove (key) {
     return await this.replicator.remove(zone)
   }

   async load () {
     // TODO: load hyperzones from disk
   }

   async close () {
     return await this.replicator.destroy()
   }

  // Dynamic template resolver
  async dynamic (protocol, data, name, type, req, tld, res) {
    // if we're here, it means the TLD set NS record to _dynamic
    const labels = name.split('.')
    const sld = labels[labels.length-3]

    const zone = new Zone()
    zone.setOrigin(tld)

    // TODO: how to serve tld records (should we return TXT records, proof of template?)
    if (name === tld) {
      return res
    }

    // fetch and compile TXT records to zone file
    const resource = await this.resource(tld)
    const records = resource.toTXT()
    records.forEach(answer => {
      const record = env.renderString(answer.data.txt.join(' ').replaceAll('\\"', ''), { name: sld, key: data, data, tld })
      zone.fromString(record)
    })

    // resolve and set cache
    try {
      const response = await zone.resolve(name, type)
    // this.ns.cache.set(name, type, response)
      return response
    } catch (err) {
      this.logger.error(err)
      return null
    }
  }

  static init = node => new Plugin(node)
}

exports.id = Plugin.id
exports.init = Plugin.init
