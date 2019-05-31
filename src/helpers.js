const Apify = require('apify');
const _ = require('underscore');

module.exports = {
    // Convert any inconsistencies to correct format
    cleanUrl: function(urls) {
        for (let i = 0; i < urls.length; i++) {
            let request = urls[i];
            if (typeof request === 'string') {
                request = {
                    url: request
                };
            }
            if (request.url.length < 1) {
                continue;
            }
            if (request.url.indexOf('http') < 0) {
                request.url = ((request.url.indexOf('//') == 0) ? 'http:' : 'http://') + request.url;
            }
            request.userData = {
                label: 'ROOT',
                depth: 1,
                referrer: null
            };
            request.uniqueKey = request.url,
                urls[i] = request;
        }
        return urls
    },

    getAttribute: async function(element, attr) {
        try {
            const prop = await element.getProperty(attr);
            return (await prop.jsonValue()).trim();
        } catch (e) {
            return null;
        }
    },

    getDomain: function(url) {
        const host1 = url.split('://')[1];
        if (!host1) {
            return null;
        }
        const host2 = host1.split('/')[0].split('.');
        return host2[host2.length - 2] + '.' + host2[host2.length - 1];
    },

    waitForAllElements: async function() {
        let count = 0;
        const timeout = ms => new Promise(resolve => setTimeout(resolve, ms));
        for (let i = 0; i < 10; i++) {
            await timeout(200);
            const cCount = document.getElementsByTagName('*').length;
            if (cCount != count) {
                count = cCount;
            } else {
                return;
            }
        }
    },

    enqueueElements: async ({
        page,
        requestQueue,
        request,
        input,
        selector,
        attr
    }) => {
        for (const elem of await page.$$(selector)) {
            const url = await module.exports.getAttribute(elem, attr);
            if (!url) {
                continue;
            }
            const domain = module.exports.getDomain(url);
            if (!domain) {
                continue;
            }

            // Check if same domain is required
            var isSameDomain = true
            if (input.sameDomain)
                isSameDomain = module.exports.getDomain(request.url) === domain;

            if (isSameDomain) {
                await requestQueue.addRequest(new Apify.Request({
                    url: url,
                    userData: {
                        label: 'BRANCH',
                        depth: request.userData.depth + 1,
                        referrer: request.url
                    }
                }));
            }
        }
    },

    crawlFrames: async (page) => {
        let socialHandles = {}
        for (let childFrame of page.mainFrame().childFrames()) {
            const html = await childFrame.content();
            let childSocialHandles = null;
            let childParseData = {};
            try {
                childSocialHandles = Apify.utils.social.parseHandlesFromHtml(html, childParseData);

                // Extract phones from links separately, they are high-certainty
                const childLinkUrls = await childFrame.$$eval('a', (linkEls) => {
                    return linkEls.map(link => link.href).filter(href => !!href);
                });

                ['emails', 'phones', 'phonesUncertain', 'linkedIns', 'twitters', 'instagrams', 'facebooks'].forEach((field) => {
                    socialHandles[field] = childSocialHandles[field];
                });
            } catch (e) {
                console.log(e)
            }
        }

        ['emails', 'phones', 'phonesUncertain', 'linkedIns', 'twitters', 'instagrams', 'facebooks'].forEach((field) => {
            socialHandles[field] = _.uniq(socialHandles[field]);
        });

        return new Promise((resolve, reject) => {
            resolve(socialHandles)
        })
    },

    mergeSocial: function(frames, main) {
        var output = main

        for (key in output) {
            main[key] = _.uniq(main[key].concat(frames[key]))
        }

        return output
    }
}