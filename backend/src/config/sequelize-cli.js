'use strict';
require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });

module.exports = {
  development: {
    username : process.env.DB_USER     || 'root',
    password : process.env.DB_PASSWORD || null,
    database : process.env.DB_NAME     || 'jugahoyweb',
    host     : process.env.DB_HOST     || 'localhost',
    port     : parseInt(process.env.DB_PORT || '3306'),
    dialect  : 'mysql',
    define   : { underscored: true, timestamps: true },
  },
  production: {
    username : process.env.DB_USER,
    password : process.env.DB_PASSWORD,
    database : process.env.DB_NAME,
    host     : process.env.DB_HOST,
    port     : parseInt(process.env.DB_PORT || '3306'),
    dialect  : 'mysql',
    define   : { underscored: true, timestamps: true },
  },
};
