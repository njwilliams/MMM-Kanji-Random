/* global Module */

/* Magic Mirror
 * Module: MMM-Kanji-Random
 *
 * By Nick Williams
 * MIT Licensed.
 */


Module.register('MMM-Kanji-Random',{
    
    defaults: {
        minsBeforeChange: 60, // update once an hour
        type: "random",
    },

    getStyles: function() {
        return ['MMM-Kanji-Random.css'];
    },    

    start: function() {
        console.log(this.name + ': Starting module');
        var self = this;
        var request = { type: self.config.type, level: self.config.level };
        self.sendSocketNotification('START', request);
        setInterval(function() {
            self.sendSocketNotification('START', request);
        }, self.config.minsBeforeChange * 1000 * 60);
    },

    getDom: function() {
        console.log(this.name + ": Updating content");

        var wrapper = document.createElement("div");
        if (this.kanji != null) {
            var kanji = document.createElement("div");
            kanji.className = "kanji bright";
            kanji.innerHTML = this.kanji;
            wrapper.appendChild(kanji);

            if (this.dict == null) {
                // basic description we got from the core random kanji site
                var definition = document.createElement("ul");
                definition.className = "definition dim";
                definition.innerHTML = this.definition;
                wrapper.appendChild(definition);

            } else {
                // more interesting description we got from the dictionary
                var core = this.dict.data[0];
                if (!core.is_common) {
                    kanji.className = "uncommon kanji"
                }

                var definition = document.createElement("div");
                definition.className = 'definition dim';
                var senses = document.createElement("ul");
                core.senses.forEach(function(sense) {
                    var li = document.createElement("li");
                    var text = sense.parts_of_speech.join(", ") + ": ";
                    text = text + sense.english_definitions.join(", ");
                    li.innerHTML = text;
                    senses.appendChild(li);
                });
                definition.appendChild(senses);
                wrapper.appendChild(definition);

                if (false) { // do we want to take the readings from the jisho API? Not yet - it's not quite right
                  var readings = document.createElement("ul");
                  readings.className = "readings";
                  var reading_dups = {};
                  core.japanese.forEach(function(word) {
                      if (reading_dups[word.reading] == null) {
                          li = document.createElement("li")
                          li.innerHTML = word.reading;
                          readings.appendChild(li);
                      }
                      reading_dups[word.reading] = 1;
                  });
                  wrapper.appendChild(readings);
                }

                // too much info to grab other compounds (this.dict.data[1..])
            }

            var readings = document.createElement("ul");
            readings.className = "readings";
            li = document.createElement('li');
            li.className = 'kun';
            li.innerHTML = this.kun;
            readings.appendChild(li);

            li = document.createElement('li');
            li.className = 'on';
            li.innerHTML = this.on;
            readings.appendChild(li);

            wrapper.appendChild(readings);

        }

        wrapper.className = "medium";
        return wrapper;
    },

    socketNotificationReceived: function(notification, payload) {
        Log.log(this.name + ": Received " + notification + " from node helper")
        if (notification == "KANJI_RESULT") {
            this.kanji = payload.kanji;
            this.definition = payload.definition;
            this.kun        = payload.kun;
            this.on         = payload.on;

            this.dict = null;
            this.updateDom();
        }

        if (notification == "DICT_RESULT") {
            this.dict = payload;
            this.updateDom();
        }
    }

});
