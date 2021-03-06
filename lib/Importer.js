'use strict';

const fs = require('fs');

const csv = require('csv-parser');

const helpers = require('./helpers');

// Prefixes for redis sets. This is used in order to namespace
// the keys in redis and not conflict with other autocomplete
// features.
class Importer {
  constructor(namespace, redis, constructLine) {
    this.redis = redis;
    this.constructLine = constructLine || helpers.constructLine;
    this.namespace = namespace;
    this.zkey_autocomplete = 'autocomplete';
    this.zkey_docs_prefix = 'docs:';

    if (this.namespace) {
      this.zkey_autocomplete = `${this.namespace}:autocomplete`;
      this.zkey_docs_prefix = `${this.namespace}:docs:`;
    }
  }

  addCompletions(data, score, callback) {
    // Add completions for originalText to the completions trie.
    // Store the original text, prefixed by the optional 'key'
    if (typeof score === 'function') {
      callback = score;
      score = null;
    }

    score = score || 0;

    callback = callback || function () {};

    let lineObject = this.constructLine(data);

    if (!lineObject) {
      return console.error('You are trying to import empty phrase');
    }

    const words = lineObject.text.split(/\s+/);

    // Iterate all over the words and insert them to the key namespace:autocomplete
    words.forEach((word) => {
      // Iterate over the characters of the word and insert them in the namespace:autocomplete
      let i;
      for (i = 1; i <= word.length; i++) {
        const character = word.slice(0, i);
        this.redis.zadd(this.zkey_autocomplete, score, character, callback);
      }

      // Insert the word with the ending character in the namespace:autocomplete
      this.redis.zadd(this.zkey_autocomplete, score, `${word}*`, callback);

      // Insert the doc (namespace:autocomplete:docs:word) that contains the whole phrase
      this.redis.zadd(`${this.zkey_docs_prefix}${word}`, score, lineObject.phraseToStore, callback);
    });
  }

  addFromFile(fields, filename) {
    const stream = csv(fields);
    fs.createReadStream(filename)
      .pipe(stream)
      .on('data', (data) => {
        console.log(data);
        this.addCompletions(data);
      });
  }

}

module.exports = Importer;
