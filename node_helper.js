
/*
 * Magic Mirror MMM-Kanji-Random node_helper
 * Nick Williams
 * MIT Licensed
 */

const NodeHelper = require("node_helper");
const request = require("request");
const sync = require("csv-parse/sync");
const name = "MMM-Kanji-Random";
const fs = require("fs");

module.exports = NodeHelper.create({
    start: function() {
        console.log(name + ": node_helper started");
        this.kanji = {};
    },

    socketNotificationReceived: function(notification, payload) {
        console.log(name + ": node_helper received " + notification + " update");
        if (!('N5' in this.kanji) && notification === 'START') {
            // Load the kanji
            console.log(name + ": reading kanji from " + payload.file);
            fs.readFile(payload.file, "utf-8", (err, data) => {
                if (!err) {
                    var kanji = sync.parse(data, { columns: ['glyph','furigana','english','level'], skipLines: 1 })
                    for (var i = 0; i < kanji.length; i++) {
                        level = kanji[i].level;
                        if (!(level in this.kanji)) {
                            this.kanji[level] = [];
                            console.log(name + ": found level " + level)
                        }
                        this.kanji[level].push(kanji[i])
                    }
                    console.log(name + ": loaded " + kanji.length + " kanji")
                    this.kanjiRequest(payload);
                } else {
                    console.log(name + ": load error " + err)
                }
            });
        } else {
            if (Object.keys(this.kanji).length == 0) {
                console.log(name + ": skipping further processing, since kanji records aren't loaded");
                return;
            }
            this.kanjiRequest(payload);
        }
    },

    kanjiRequest: function(payload) {
        var self = this;
        var info = [];

        console.log(name + ": generating random kanji of level " + payload.level)

        // Pick a random kani and let the mirror know about it.
        k = Math.floor(Math.random() * self.kanji[payload.level].length);
        var glyph = self.kanji[payload.level][k].glyph;
        console.log(name + ": kanji random " + glyph + " (" + k + ")");
        var reply = { 
                        'kanji': glyph, 
                        'description': self.kanji[payload.level][k].english,
                        'furigana': self.kanji[payload.level][k].furigana
                    };
        self.sendSocketNotification('KANJI_RESULT', reply)

        // and asynchronously, go lookup the definition of the kanji
        url = new URL("http://jisho.org/api/v1/search/words?keyword=" + glyph);
        console.log(name + ": kanji random is requesting " + url);
        request({url:url, method:'GET'}, function(err, resp, content) {
            if (!err && resp.statusCode == 200) {
                json = JSON.parse(content);
                self.sendSocketNotification('DICT_RESULT', json)
                console.log(name + ": successfully looked up dictionary entry")
            } else {
                if (err) {
                    console.log(name + ": dictionary error " + err);
                } else {
                    console.log(name + ": dictionary bad response " + resp.statusCode);
                }
            };
        });
    },
});
 

