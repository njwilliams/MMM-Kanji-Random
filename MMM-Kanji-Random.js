/* global Module */

/* Magic Mirror
 * Module: MMM-Kanji-Random
 *
 * By Nick Williams
 * MIT Licensed.
 */


Module.register('MMM-Kanji-Random',{
    
    defaults: {
        level: "N5",                  // JLPT level of vocabulary to show (N1-N5)
        minsBeforeChange: 60,         // update once an hour
        maxDefinitions: 4,            // max dictionary senses to display
        dictTimeout: 8000,            // ms to wait for the dictionary lookup before giving up
        animateStrokeOrder: true,     // animate kanji stroke order with HanziWriter
        strokeSize: 80,               // px size of each animated character
        strokeAnimationSpeed: 1,      // 1 = normal, >1 = faster
        strokeDelay: 400,             // ms pause between strokes
        strokeLoopDelay: 2000,        // ms pause before the animation loops
        strokeColor: '#ffffff',       // color of drawn strokes
        strokeOutlineColor: '#444444', // color of the character outline
        strokeUncommonColor: 'orange' // stroke color used for uncommon kanji
    },

    getStyles: function() {
        return ['MMM-Kanji-Random.css'];
    },

    getScripts: function() {
        if (this.config.animateStrokeOrder) {
            return ['https://cdn.jsdelivr.net/npm/hanzi-writer@3/dist/hanzi-writer.min.js'];
        }
        return [];
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

        // The HanziWriter script loads asynchronously. Once it's available,
        // re-render so the loading screen switches to the animated kanji. If it
        // never loads (e.g. CDN unreachable), give up and fall back to plain text.
        if (self.config.animateStrokeOrder) {
            var attempts = 0;
            self._scriptCheck = setInterval(function() {
                if (typeof HanziWriter !== "undefined") {
                    clearInterval(self._scriptCheck);
                    self.updateDom();
                } else if (++attempts >= 50) { // ~10s
                    clearInterval(self._scriptCheck);
                    self._scriptFailed = true;
                    Log.warn(self.name + ": HanziWriter failed to load; showing plain text");
                    self.updateDom();
                }
            }, 200);
        }
    },

    getDom: function() {
        Log.log(this.name + ": Updating content");

        var wrapper = document.createElement("div");
        wrapper.className = "medium";

        var animate = this.config.animateStrokeOrder && typeof HanziWriter !== "undefined";

        // Show a loading screen until everything needed for the first clean
        // switch is ready: the first kanji, the HanziWriter script (when
        // animating), and the first dictionary lookup (or its timeout). This
        // avoids showing partially-populated content as the pieces stream in.
        var waitingForScript = this.config.animateStrokeOrder &&
                               typeof HanziWriter === "undefined" &&
                               !this._scriptFailed;
        if (this.kanji == null || waitingForScript || !this._firstPaintReady) {
            return this.getLoadingDom(wrapper);
        }

        var furigana = document.createElement("div");
        furigana.className = "furigana";
        furigana.textContent = this.furigana;
        wrapper.appendChild(furigana)

        var kanji;
        if (animate && this._kanjiNode && this._kanjiWord === this.kanji) {
            // Reuse the already-animating node so the dictionary update doesn't restart it
            kanji = this._kanjiNode;
        } else {
            kanji = document.createElement("div");
            kanji.className = "kanji bright";
            if (animate) {
                this.renderStrokeOrder(kanji, this.kanji);
            } else {
                kanji.textContent = this.kanji;
            }
            this._kanjiNode = animate ? kanji : null;
            this._kanjiWord = this.kanji;
        }
        wrapper.appendChild(kanji);

        var definition = document.createElement("div");
        definition.className = "definition dim";
        var senses = document.createElement("ul");

        var core = this.dict && this.dict.data ? this.dict.data[0] : null;
        if (core) {
            // richer definition from the dictionary lookup
            this.applyUncommon(kanji, animate, !core.is_common);

            core.senses.slice(0, this.config.maxDefinitions).forEach(function(sense) {
                var li = document.createElement("li");
                li.textContent = sense.parts_of_speech.join(", ") + ": " +
                                 sense.english_definitions.join(", ");
                senses.appendChild(li);
            });
        } else {
            // No dictionary entry (yet): show the local vocabulary definition
            var li = document.createElement("li");
            li.textContent = this.definition;
            senses.appendChild(li);

            // Make the failure visible to the user, not just in the logs
            if (this.dictTimedOut) {
                var err = document.createElement("li");
                err.className = "lookup-error";
                err.textContent = "⚠ Dictionary lookup timed out";
                senses.appendChild(err);
            } else if (this.dict) {
                var none = document.createElement("li");
                none.className = "lookup-error";
                none.textContent = "⚠ No dictionary entry found";
                senses.appendChild(none);
            }
        }

        definition.appendChild(senses);
        wrapper.appendChild(definition);

        return wrapper;
    },

    // Loading / splash screen shown before the first kanji (and script) are ready.
    getLoadingDom: function(wrapper) {
        wrapper.className = "medium loading";

        var logo = document.createElement("div");
        logo.className = "kanji bright";
        logo.textContent = "漢字";
        wrapper.appendChild(logo);

        var message = document.createElement("div");
        message.className = "definition dim";
        message.textContent = "Loading…";
        wrapper.appendChild(message);

        return wrapper;
    },

    // Highlight an uncommon kanji: recolor the live strokes when animating,
    // otherwise fall back to the CSS class used for plain text.
    applyUncommon: function(kanji, animate, uncommon) {
        if (!uncommon) { return; }
        if (animate && this._strokeWriters) {
            var color = this.config.strokeUncommonColor;
            this._strokeWriters.forEach(function(w) {
                w.updateColor("strokeColor", color);
            });
        } else {
            kanji.className = "uncommon kanji";
        }
    },

    // Stroke data is only available for kanji (CJK Unified Ideographs).
    // Kana and other characters have no animation, so we render them as plain text.
    isKanji: function(ch) {
        var code = ch.codePointAt(0);
        return (code >= 0x4E00 && code <= 0x9FFF) ||   // CJK Unified Ideographs
               (code >= 0x3400 && code <= 0x4DBF);     // CJK Extension A
    },

    renderStrokeOrder: function(container, word) {
        var self = this;
        // Bump the generation so any sequence from a previous word stops looping
        var generation = (this._strokeGeneration || 0) + 1;
        this._strokeGeneration = generation;

        var writers = [];
        // Array.from splits the word into individual characters
        Array.from(word).forEach(function(ch) {
            var box = document.createElement("div");
            box.className = "stroke-box";
            box.style.display = "inline-block";
            container.appendChild(box);

            var size = self.config.strokeSize;
            box.style.width = size + "px";
            box.style.height = size + "px";

            if (!self.isKanji(ch)) {
                // Kana / punctuation: show immediately, no animation,
                // sized and centred to line up with the animated kanji
                box.textContent = ch;
                box.style.lineHeight = size + "px";
                box.style.fontSize = Math.round(size * 0.7) + "px";
                box.style.textAlign = "center";
                return;
            }

            var writer = HanziWriter.create(box, ch, {
                width: size,
                height: size,
                padding: 4,
                showOutline: true,
                strokeColor: self.config.strokeColor,
                outlineColor: self.config.strokeOutlineColor,
                strokeAnimationSpeed: self.config.strokeAnimationSpeed,
                delayBetweenStrokes: self.config.strokeDelay,
                charDataLoader: function(char, onLoad, onError) {
                    fetch("https://cdn.jsdelivr.net/npm/hanzi-writer-data-jp@0/" +
                          encodeURIComponent(char) + ".json")
                        .then(function(res) {
                            if (!res.ok) { throw new Error("no stroke data"); }
                            return res.json();
                        })
                        .then(onLoad)
                        .catch(onError);
                },
                onLoadCharDataError: function() {
                    // No stroke data (e.g. some kana): fall back to the plain character
                    box.textContent = ch;
                }
            });

            writers.push(writer);
        });

        this._strokeWriters = writers;
        if (writers.length > 0) {
            this.animateSequence(writers, generation);
        }
    },

    // Animate each kanji in turn, starting the next once the previous completes,
    // then pause and loop. Stops if a newer word has been rendered.
    animateSequence: function(writers, generation) {
        var self = this;

        var step = function(i) {
            if (self._strokeGeneration !== generation) { return; }
            if (i >= writers.length) {
                setTimeout(start, self.config.strokeLoopDelay);
                return;
            }
            writers[i].animateCharacter({
                onComplete: function() { step(i + 1); }
            });
        };

        var start = function() {
            if (self._strokeGeneration !== generation) { return; }
            writers.forEach(function(w) { w.hideCharacter({ duration: 0 }); });
            step(0);
        };

        start();
    },

    socketNotificationReceived: function(notification, payload) {
        Log.log(this.name + ": Received " + notification + " from node helper")
        if (notification == "KANJI_RESULT") {
            this.kanji      = payload.kanji;
            this.definition = payload.description;
            this.furigana   = payload.furigana;

            this.dict = null;
            this.dictTimedOut = false;

            // Wait for the dictionary lookup, but don't wait forever: after the
            // timeout, show the kanji anyway with a visible error.
            var self = this;
            clearTimeout(this._dictTimer);
            this._dictTimer = setTimeout(function() {
                self.dictTimedOut = true;
                self._firstPaintReady = true;
                Log.warn(self.name + ": dictionary lookup timed out for " + self.kanji);
                self.updateDom();
            }, this.config.dictTimeout);

            this.updateDom();
        }

        if (notification == "DICT_RESULT") {
            clearTimeout(this._dictTimer);
            this.dict = payload;
            this.dictTimedOut = false;
            this._firstPaintReady = true;
            this.updateDom();
        }
    }

});
