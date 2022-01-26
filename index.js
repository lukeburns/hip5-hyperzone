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
    this.ns.middle = middle.bind(this)
    async function middle (...args) {
      this.logger.debug('middle init')
      const res = await this._hip5('_hyperzone', this.hyper, this._hip5('_aliasing', this.aliasing))(...args)
      this.logger.debug('middle response', res)
      return res
    }
  }

  // aliasing
  async aliasing (data, name, type, req, tld, res) {
    this.logger.debug('aliasing init', name)
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
    this.logger.debug('ALIAS hashing', sldLabel+hip5data)
    const alias = util.fqdn(base32.encode(blake3.hash(sldLabel+hip5data)))
    this.logger.debug('ALIAS result', alias)

    // query alias
    const question = [new Question(alias, type), new Question(name, type)]
    let response
    try {
      response = await this.ns.response({ question })
    } catch (err) {
      this.logger.debug('ALIASING ERROR', err)
      return null
    }
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
    this.logger.debug('ALIASING response', response)
    return response
  }

  // hyper
  async hyper (key, name, type, timeout=1500) {
     this.logger.debug('hyper init', name)
     let hyperzone = this.hyperzones.get(key)
     if (!hyperzone) {
       hyperzone = this.add(key, name)
       this.logger.debug('hyper NOEXIST')
       return null
     }

     let result = null
     try {
       return await new Promise((resolve, reject) => {
         this.logger.debug('hyper resolving...')
         hyperzone.resolve(name, type).then(resolve).catch(error => this.logger.debug(error))
         sleep(timeout).then(reject)
       })
     } catch (err) {
       // timeout
       this.logger.debug('hyper timeout')
       return null
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

function sleep (ms) {
  return new Promise((resolve => setTimeout(() => resolve(), ms)))
}
