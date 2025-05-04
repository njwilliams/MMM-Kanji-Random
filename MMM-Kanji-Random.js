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
        maxDefinitions: 4
    },

    getStyles: function() {
        return ['MMM-Kanji-Random.css'];
    },    

    start: function() {
        Log.log(this.name + ': Starting module');
        var self = this;
        var request = { 
                          "level": self.config.level,
                          "file": this.file("jlpt_vocab.csv")
                      };
        self.sendSocketNotification('START', request);
        setInterval(function() {
            self.sendSocketNotification('START', request);
        }, self.config.minsBeforeChange * 1000 * 60);
    },

    getDom: function() {
        Log.log(this.name + ": Updating content");

        var wrapper = document.createElement("div");
        wrapper.className = "medium";
        if (this.kanji == null) {
            return wrapper;
        }

        var furigana = document.createElement("div");
        furigana.className = "furigana";
        furigana.innerHTML = this.furigana;
        wrapper.appendChild(furigana)

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
        }

        return wrapper;
    },

    socketNotificationReceived: function(notification, payload) {
        Log.log(this.name + ": Received " + notification + " from node helper")
        if (notification == "KANJI_RESULT") {
            this.kanji      = payload.kanji;
            this.definition = payload.definition;
            this.furigana   = payload.furigana;

            this.dict = null;
            this.updateDom();
        }

        if (notification == "DICT_RESULT") {
            this.dict = payload;
            this.updateDom();
        }
    }

});
