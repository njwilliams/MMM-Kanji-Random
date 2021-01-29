
/*
 * Magic Mirror MMM-Kanji-Random node_helper
 * Nick Williams
 * MIT Licensed
 */

const NodeHelper = require("node_helper");
const request = require("request");
// const jsdom = require("jsdom");
const cheerio = require("cheerio");
const he = require("he");

module.exports = NodeHelper.create({
    start: function() {
        console.log("MMM-Kanji-Random: node_helper started");
    },

    socketNotificationReceived: function(notification, payload) {
        console.log("MMM-Kanji-Random: node_helper received " + notification + " update");
        this.kanjiRequest(payload);
    },

    kanjiRequest: function(payload) {
        var self = this;
        var info = [];
        var url = "http://kanji.fm4dd.com/kanji-random.php";
        switch(payload.type.toLowerCase()) {
        case "elementary":
            level = parseInt(payload.level);
            if (level < 1) {
                level = 1;
                info.push("capped Elementary level up to 1");
            }
            if (level > 6) {
                level = 6;
                info.push("capped Elementary level down to 6");
            }
            url = url + "?type='ElemClass&level=" + level;
            break;

        case "jlpt":
            var level = payload.level;
            var match = level.match(/^n(\d+)$/i);
            if (match !== null) {
                level = parseInt(match[1]);
                if (level < 1) {
                    level = 1;
                    info.push("capped JLPT level up to 1");
                }
                if (level > 5) {
                    level = 5;
                    info.push("capped JLPT level down to 5");
                }
                url = url + "?type='JLPT&level=N" + level;
            }
            break;

        case "minna no nihongo":
            level = parseInt(payload.level);
            if (level === null) {
                info.push("set level to 1");
                level = 1;
            }
            if (level < 1) {
                level = 1;
                info.push("capped level up to 1");
            }
            if (level > 2) {
                level = 2;
                info.push("capped level down to 2");
            }
            url = url + "?type='Minna_No_Nihongo'&level=" + level;
            break;

        case "random":
            break;

        default:
            info.push("didn't match type, so using default random");
            break;
        }
        if (info.length > 0) {
            console.log("MMM-Kanji-Random: " + info.join("; "));
        }

        console.log("MMM-Kanji-Random: requesting " + url);
        request({ url:url, method: 'GET' }, function(error, response, body) {
            if (!error && response.statusCode == 200) {
                // var dom = new jsdom.JSDOM(body);
                const $ = cheerio.load(body);
                var glyph = he.decode($(".kanji").html()).trim();
                console.log("MMM-Kanji-Random: got Kanji " + glyph);

                var reply = { kanji: '', description: []};
                reply.kanji = glyph;

                arr = [];
                $(".description").each(function(i, elem) {
                    arr.push($(elem).text().trim())
                });
                reply.definition = arr[0];
                reply.kun = arr[1];
                reply.on  = arr[2];
                self.sendSocketNotification('KANJI_RESULT', reply);

                url = new URL("http://jisho.org/api/v1/search/words?keyword=" + glyph);
                request({url:url, method:'GET'}, function(err, resp, content) {
                    if (!err && resp.statusCode == 200) {
                        json = JSON.parse(content);
                        self.sendSocketNotification('DICT_RESULT', json)
                    } else {
                        if (err) {
                            console.log("MMM-Kanji-Random: dictionary error " + err);
                        } else {
                            console.log("MMM-Kanji-Random: dictionary bad response " + resp.statusCode);
                        }
                    };
                });
            }
        });
    },
});
 

