'use strict';

module.exports = (app, env = process.env) => {
  if (env.TRUSTED_PROXY_CIDRS) {
    app.set('trust proxy', env.TRUSTED_PROXY_CIDRS.split(',').map(value => value.trim()).filter(Boolean));
  } else if (env.TRUSTED_PROXY_HOPS) {
    const hops = Number(env.TRUSTED_PROXY_HOPS);
    if (!Number.isInteger(hops) || hops < 1 || hops > 2) throw new Error('TRUSTED_PROXY_HOPS must be 1 or 2');
    app.set('trust proxy', hops);
  } else {
    app.set('trust proxy', false);
  }
};
