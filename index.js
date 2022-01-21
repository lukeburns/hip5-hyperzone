const Hip5 = require('hip5')
const Hyperzone = require('hyperzone')
const Replicator = require('@hyperswarm/replicator')
const base32 = require('bs32')
const { util, wire: { types, typesByVal, Question } } = require('bns')
const blake3 = require('blake3')
const { Struct } = require('bufio')

class Plugin extends Hip5 {
  static id = 'hyperzone'

  constructor (node) {
    super(null, node)
    this.pool = node.pool
    this.config = node.config

    this.replicator = new Replicator()
    this.hyperzones = new Map()

    // middleware pipeline
    this.ns.middle = this._hip5('_aliasing', this.aliasing)
    this.ns.middle = this._hip5('_hyperzone', this.hyper, this.ns.middle)
  }

  // aliasing
  async aliasing (data, name, type, req, tld, res) {
    // if we're here, it means the TLD set NS record to _aliasing
    const dataLabels = data.split('.')
    const hip5data = dataLabels[0]
    if (name === tld) {
      const soa = await this.sendSOA()

      // want to serve TLD records without overriding SLD records
      if (dataLabels[dataLabels.length-1] === '_hyperzone' && hip5data.length === 52) {
        const result = await this.hyper(hip5data, name, type)
        if (result && result.answer) {
          soa.answer = result.answer.filter(answer => {
            return answer.type !== types.NS && answer.type !== types.SOA
          })
        }
      }
      this.logger.debug('ALIASING', soa)
      return soa
    }

    // compute alias
    const nameLabels = name.split('.')
    const sldLabel = nameLabels[nameLabels.length-3]
    const alias = util.fqdn(base32.encode(blake3.hash(sldLabel+hip5data)))

    // query alias
    try {
      const question = [new Question(alias, type), new Question(name, type)]
      const response = await this.ns.response({ question })
      response.question = question
      response.answer = response.answer.map(answer => {
        answer.name = name
        return answer
      })
      response.authority = response.authority.map(answer => {
        answer.name = name
        return answer
      })
    // this.ns.cache.set(name, type, response)
      return response
    } catch (err) {
      this.logger.debug('ALIASING ERROR', err)
      return null
    }
  }

  // hyper
  async hyper (key, name, type) {
     let hyperzone = this.hyperzones.get(key)
     if (hyperzone) {
         return await hyperzone.resolve(name, type)
     } else {
       hyperzone = this.add(key, name)
       return await hyperzone.resolve(name, type)
     }
   }

   add (key, name) {
     const zone = new Hyperzone(name, `${this.config.prefix}/hyperzones/${name}`, key)
     this.hyperzones.set(key, zone)
     this.replicator.add(zone.db, { client: true, server: false })
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

   static init = node => new Plugin(node)
}

exports.id = Plugin.id
exports.init = Plugin.init
