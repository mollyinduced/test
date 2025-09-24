module.exports = {
    server: {
        port: 8087,
        debug: true,
        version: '1.1',
        useHttps: false, // Default: false
    },
    proxy: {
        scrape: true, // Default: 'false' | Set to true to enable proxy scraping | false use proxies.txt
        protocol: 'http', // Default: 'http' | Proxy protocol, can be 'http', 'https', 'socks4', 'socks5'
        timeout: 5000
    },
    minionsName: 'CART',
    minionsAmount: 15
}