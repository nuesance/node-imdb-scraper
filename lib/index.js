const request = require('request-promise')
const cheerio = require('cheerio')
const qs = require('querystring')
const fs = require('fs')

const URL = 'http://www.imdb.com'
const PAGE_CHECK_STRING = '115109575169727'

const Title = require('./classes/Title')
const Media = require('./classes/Media')
const Search = require('./classes/Search')

class IMDBScraper {

    constructor(options) {

        this.req = request.defaults({
            headers: {
                'accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8',
                'accept-language': 'en-US,en;q=0.5',
                'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/63.0.3239.132 Safari/537.36',
                'host': 'www.imdb.com'
            }
        })
        this.maxRetries = 3

        Object.assign(this, options)   
    }

    request(url, retries) {
        if (retries === undefined) retries = this.maxRetries
        const options = {
            url,
            transform: body => {
                return cheerio.load(body)
            },
            transform2xxOnly: true
        }
        return this.req(options)
            .then($ => {
                // Some proxies return HTML when they fail
                // so we need to check if parsed HTML is valid.
                // If page doesn't contain identifier string we retry.
                if ($.html().indexOf(PAGE_CHECK_STRING) === -1) {
                    if (retries) {
                        return this.request(url, retries - 1)
                    }
                    // Failure
                    return Promise.reject('Received malformed body. If you are using proxies this could be due to bad proxies.')
                }
                // Body should be valid
                return $
            })
            .catch(err => {
                if (retries) {
                    return this.request(url, retries - 1)
                }
                return Promise.reject(err)
            })
    }

    title(id) {
        return this.request(`${URL}/title/${id}`)
            .then($ => {
                return new Title($)
            })
            .catch(err => Promise.reject(err))
    }

    media(id) {
        let imdbID = id
        if (id instanceof Title) {
            imdbID = id.imdbID
        }
        return this.request(`${URL}/title/${imdbID}/mediaviewer`)
            .then($ => {
                let IMDbReactInitialState = $('script').filter(function() {
                    return $(this).html().indexOf('IMDbReactInitialState') !== -1
                }).html()
                IMDbReactInitialState = IMDbReactInitialState.split('{"allImages":')[1].split(',"baseUrl"')[0]
                IMDbReactInitialState = JSON.parse(IMDbReactInitialState)

                const images = []
                IMDbReactInitialState.forEach(image => {
                    images.push(new Media(image))
                })

                return images
            })
            .catch(err => Promise.reject(err))
    }

    search(options) {
        if (typeof options === 'string') {
            options = {
                title: options
            }
        }
        // Advanced view
        if ( ! options.view) {
            options.view = 'advanced'
        }
        // Results per page
        if ( ! options.count) {
            options.count = 50
        }

        return this.request(`${URL}/search/title?${qs.stringify(options)}`)
            .then($ => {
                const results = []
                $('.lister-item').each(function() {
                    results.push(new Search($(this)))
                })

                let pages = $('.lister .nav .desc').first().clone().find('*').remove().end().text().trim()
                    pages = pages.replace('to', '').replace('of', '').replace('titles', '').trim()
                    pages = parseInt(pages)
                    pages = Math.floor(pages / options.count) || 1

                return {
                    pages,
                    results
                } 
            })
            .catch(err => Promise.reject(err))
    }

}

module.exports = IMDBScraper