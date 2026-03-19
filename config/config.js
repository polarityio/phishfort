'use strict';

module.exports = {
  name: 'PhishFort',
  acronym: 'PF',
  description:
    'Domain takedown and incident management via the PhishFort CAPI. Supports real-time lookup of existing incidents and in-overlay actions: submit for takedown, submit for monitoring, mark safe, and add comments.',
  entityTypes: ['domain', 'url', 'IPv4', 'email'],
  defaultColor: 'light-pink',
  styles: ['./styles/styles.less'],
  onDemandOnly: false,
  block: {
    component: { file: './components/block.js' },
    template: { file: './templates/block.hbs' }
  },
  request: {
    cert: '',
    key: '',
    passphrase: '',
    ca: '',
    proxy: '',
    rejectUnauthorized: true
  },
  logging: { level: 'info' },
  options: [
    {
      key: 'apiKey',
      name: 'PhishFort API Key',
      description:
        'Your PhishFort CAPI key sent as the x-api-key header. Contact PhishFort support to obtain an API key.',
      default: '',
      type: 'password',
      userCanEdit: false,
      adminOnly: true
    },
    {
      key: 'maxConcurrent',
      name: 'Max Concurrent Requests',
      description:
        'The maximum number of concurrent requests to send to the PhishFort API. Defaults to 5.',
      default: 5,
      type: 'number',
      userCanEdit: false,
      adminOnly: true
    }
  ]
};
