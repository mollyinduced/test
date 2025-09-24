// utils/FlareSolverr.js
const fetch = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));
const config = require('../config/config');
const Logger = require('./Logger');

class FlareSolverr {
    static async request(url) {
        const body = {
            cmd: "request.get",
            url: url,
            maxTimeout: 60000
        };

        try {
            const res = await fetch(config.flaresolverr.endpoint, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(body)
            });

            const json = await res.json();
            if (json.status !== "ok") {
                throw new Error("FlareSolverr failed: " + JSON.stringify(json));
            }

            Logger.info(`FlareSolverr solved challenge for ${url}`);
            return json.solution;
        } catch (err) {
            Logger.error(`FlareSolverr error: ${err.message}`);
            return null;
        }
    }
}

module.exports = FlareSolverr;
