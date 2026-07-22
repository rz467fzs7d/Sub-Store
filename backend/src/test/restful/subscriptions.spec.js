import { expect } from 'chai';
import { after, before, beforeEach, describe, it } from 'mocha';

import { SUBS_KEY } from '@/constants';

let $;
let openApi;
let registerSubscriptionRoutes;
let originalRead;
let originalWrite;
let originalError;
let originalHTTP;
let state;

function createRouteApp() {
    const handlers = new Map();
    const app = {
        handlers,
        get(pattern, handler) {
            handlers.set(`GET ${pattern}`, handler);
            return app;
        },
        route(pattern) {
            const chain = {};
            chain.get = (handler) => {
                handlers.set(`GET ${pattern}`, handler);
                return chain;
            };
            chain.patch = (handler) => {
                handlers.set(`PATCH ${pattern}`, handler);
                return chain;
            };
            chain.post = (handler) => {
                handlers.set(`POST ${pattern}`, handler);
                return chain;
            };
            chain.put = (handler) => {
                handlers.set(`PUT ${pattern}`, handler);
                return chain;
            };
            chain.delete = (handler) => {
                handlers.set(`DELETE ${pattern}`, handler);
                return chain;
            };
            return chain;
        },
    };

    return app;
}

function createResponse(routePath) {
    return {
        body: null,
        req: {
            route: {
                path: routePath,
            },
        },
        statusCode: 200,
        status(code) {
            this.statusCode = code;
            return this;
        },
        json(payload) {
            this.body = payload;
            return this;
        },
    };
}

describe('subscription routes', function () {
    before(function () {
        ({ default: $ } = require('@/core/app'));
        openApi = require('@/vendor/open-api');
        ({ default: registerSubscriptionRoutes } = require(
            '@/restful/subscriptions'
        ));

        originalRead = $.read.bind($);
        originalWrite = $.write.bind($);
        originalError = $.error.bind($);
        originalHTTP = openApi.HTTP;
    });

    after(function () {
        $.read = originalRead;
        $.write = originalWrite;
        $.error = originalError;
        openApi.HTTP = originalHTTP;
    });

    beforeEach(function () {
        state = {
            [SUBS_KEY]: [
                {
                    name: 'static-flow',
                    source: 'remote',
                    url: 'https://example.com/sub',
                    subUserinfo:
                        'upload=1; download=2; total=10; expire=4115721600',
                },
            ],
        };
        $.read = (key) => state[key];
        $.write = (data, key) => {
            state[key] = data;
            return true;
        };
        $.error = () => {};
        openApi.HTTP = () => ({
            head: async () => {
                throw new Error('connect timeout');
            },
            get: async () => {
                throw new Error('connect timeout');
            },
        });
    });

    it('returns static sub-userinfo when remote flow probing fails', async function () {
        const app = createRouteApp();
        registerSubscriptionRoutes(app);
        const handler = app.handlers.get('GET /api/sub/flow/:name');
        const res = createResponse('/api/sub/flow/:name');

        await handler({ params: { name: 'static-flow' }, query: {} }, res);

        expect(res.statusCode).to.equal(200);
        expect(res.body.status).to.equal('success');
        expect(res.body.data.total).to.equal(10);
        expect(res.body.data.usage).to.deep.equal({
            upload: 1,
            download: 2,
        });
    });
});
