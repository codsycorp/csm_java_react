// Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/55.0.2883.87 Safari/537.36 OPR/42.0.2393.517
// Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/40.0.2214.115 Safari/537.36
window.fnBililiteRange = function () {
  let bililiteRange; // create one global variable
  (function () {
    const datakey = Symbol(); // use as the key to modify elements.
    bililiteRange = function (el) {
      var ret;
      if (el.setSelectionRange) {
        // Element is an input or textarea 
        // note that some input elements do not allow selections
        try {
          el.selectionStart = el.selectionStart;
          ret = new InputRange();
        } catch (e) {
          ret = new NothingRange();
        }
      } else {
        // Standards, with any other kind of element
        ret = new W3CRange();
      }
      ret._el = el;
      // determine parent document, as implemented by John McLear <john@mclear.co.uk>
      ret._doc = el.ownerDocument;
      ret._win = ret._doc.defaultView;
      ret._bounds = [0, ret.length];


      if (!(el[datakey])) { // we haven't processed this element yet	
        const data = createDataObject(el);
        startupHooks.forEach(hook => hook(el, ret, data));
      }
      return ret;
    }

    bililiteRange.version = 3.2;

    const startupHooks = new Set();
    bililiteRange.addStartupHook = fn => startupHooks.add(fn);
    startupHooks.add(trackSelection);
    startupHooks.add(fixInputEvents);
    startupHooks.add(correctNewlines);

    // selection tracking. We want clicks to set the selection to the clicked location but tabbing in or element.focus() should restore
    // the selection to what it was.
    // There's no good way to do this. I just assume that a mousedown (or a drag and drop
    // into the element) within 100 ms of the focus event must have caused the focus, and
    // therefore we should not restore the selection.
    function trackSelection(element, range, data) {
      data.selection = [0, 0];
      range.listen('focusout', evt => data.selection = range._nativeSelection());
      range.listen('mousedown', evt => data.mousetime = evt.timeStamp);
      range.listen('drop', evt => data.mousetime = evt.timeStamp);
      range.listen('focus', evt => {
        if ('mousetime' in data && evt.timeStamp - data.mousetime < 100) return;
        range._nativeSelect(range._nativeRange(data.selection))
      });
    }

    function fixInputEvents(element, range, data) {
      // DOM 3 input events, https://www.w3.org/TR/input-events-1/
      // have a data field with the text inserted, but that isn't enough to fully describe the change;
      // we need to know the old text (or at least its length)
      // and *where* the new text was inserted.
      // So we enhance input events with that information. 
      // the "newText" should always be the same as the 'data' field, if it is defined
      data.oldText = range.all();
      data.liveRanges = new Set();
      range.listen('input', evt => {
        const newText = range.all();
        if (!evt.bililiteRange) {
          evt.bililiteRange = diff(data.oldText, newText);
          if (evt.bililiteRange.unchanged) {
            // no change. Assume that whatever happened, happened at the selection point (and use whatever data the browser gives us).
            evt.bililiteRange.start = range.clone().bounds('selection')[1] - (evt.data || '').length;
          }
        }
        data.oldText = newText;

        // Also update live ranges on this element
        data.liveRanges.forEach(rng => {
          const start = evt.bililiteRange.start;
          const oldend = start + evt.bililiteRange.oldText.length;
          const newend = start + evt.bililiteRange.newText.length;
          // adjust bounds; this tries to emulate the algorithm that Microsoft Word uses for bookmarks
          let [b0, b1] = rng.bounds();
          if (b0 <= start) {
            // no change
          } else if (b0 > oldend) {
            b0 += newend - oldend;
          } else {
            b0 = newend;
          }
          if (b1 < start) {
            // no change
          } else if (b1 >= oldend) {
            b1 += newend - oldend;
          } else {
            b1 = start;
          }
          rng.bounds([b0, b1]);
        })
      });
    }

    function diff(oldText, newText) {
      // Try to find the changed text, assuming it was a continuous change
      if (oldText == newText) {
        return {
          unchanged: true,
          start: 0,
          oldText,
          newText
        }
      }

      const oldlen = oldText.length;
      const newlen = newText.length;
      for (var i = 0; i < newlen && i < oldlen; ++i) {
        if (newText.charAt(i) != oldText.charAt(i)) break;
      }
      const start = i;
      for (i = 0; i < newlen && i < oldlen; ++i) {
        let newpos = newlen - i - 1, oldpos = oldlen - i - 1;
        if (newpos < start || oldpos < start) break;
        if (newText.charAt(newpos) != oldText.charAt(oldpos)) break;
      }
      const oldend = oldlen - i;
      const newend = newlen - i;
      return {
        start,
        oldText: oldText.slice(start, oldend),
        newText: newText.slice(start, newend)
      }
    };
    bililiteRange.diff = diff; // expose

    function correctNewlines(element, range, data) {
      // we need to insert newlines rather than create new elements, so character-based calculations work
      range.listen('paste', evt => {
        if (evt.defaultPrevented) return;
        // windows adds \r's to clipboard!
        range.clone().bounds('selection').
          text(evt.clipboardData.getData("text/plain").replace(/\r/g, ''), { inputType: 'insertFromPaste' }).
          bounds('endbounds').
          select().
          scrollIntoView();
        evt.preventDefault();
      });
      range.listen('keydown', function (evt) {
        if (evt.ctrlKey || evt.altKey || evt.shiftKey || evt.metaKey) return;
        if (evt.defaultPrevented) return;
        if (evt.key == 'Enter') {
          range.clone().bounds('selection').
            text('\n', { inputType: 'insertLineBreak' }).
            bounds('endbounds').
            select().
            scrollIntoView();
          evt.preventDefault();
        }
      });
    }

    // convenience function for defining input events
    function inputEventInit(type, oldText, newText, start, inputType) {
      return {
        type,
        inputType,
        data: newText,
        bubbles: true,
        bililiteRange: {
          unchanged: (oldText == newText),
          start,
          oldText,
          newText
        }
      };
    }

    // base class
    function Range() { }
    Range.prototype = {
      // allow use of range[0] and range[1] for start and end of bounds 
      get 0() {
        return this.bounds()[0];
      },
      set 0(x) {
        this.bounds([x, this[1]]);
        return x;
      },
      get 1() {
        return this.bounds()[1];
      },
      set 1(x) {
        this.bounds([this[0], x]);
        return x;
      },
      all: function (text) {
        if (arguments.length) {
          return this.bounds('all').text(text, { inputType: 'insertReplacementText' });
        } else {
          return this._el[this._textProp];
        }
      },
      bounds: function (s) {
        if (typeof s === 'number') {
          this._bounds = [s, s];
        } else if (bililiteRange.bounds[s]) {
          this.bounds(bililiteRange.bounds[s].apply(this, arguments));
        } else if (s && s.bounds) {
          this._bounds = s.bounds(); // copy bounds from an existing range
        } else if (s) {
          this._bounds = s; // don't do error checking now; things may change at a moment's notice
        } else {
          // constrain bounds now
          var b = [
            Math.max(0, Math.min(this.length, this._bounds[0])),
            Math.max(0, Math.min(this.length, this._bounds[1]))
          ];
          b[1] = Math.max(b[0], b[1]);
          return b;
        }
        return this; // allow for chaining
      },
      clone: function () {
        return bililiteRange(this._el).bounds(this.bounds());
      },
      get data() {
        return this._el[datakey];
      },
      dispatch: function (opts = {}) {
        var event = new Event(opts.type, opts);
        event.view = this._win;
        for (let prop in opts) try { event[prop] = opts[prop] } catch (e) { }; // ignore read-only errors for properties that were copied in the previous line
        this._el.dispatchEvent(event); // note that the event handlers will be called synchronously, before the "return this;"
        return this;
      },
      get document() {
        return this._doc;
      },
      dontlisten: function (type, func = console.log, target) {
        target ??= this._el;
        target.removeEventListener(type, func);
        return this;
      },
      get element() {
        return this._el
      },
      get length() {
        return this._el[this._textProp].length;
      },
      live(on = true) {
        this.data.liveRanges[on ? 'add' : 'delete'](this);
        return this;
      },
      listen: function (type, func = console.log, target) {
        target ??= this._el;
        target.addEventListener(type, func);
        return this;
      },
      scrollIntoView() {
        var top = this.top();
        // note that for TEXTAREA's, this.top() will do the scrolling and the following is irrelevant.
        // scroll into position if necessary
        if (this._el.scrollTop > top || this._el.scrollTop + this._el.clientHeight < top) {
          this._el.scrollTop = top;
        }
        return this;
      },
      select: function () {
        var b = this.data.selection = this.bounds();
        if (this._el === this._doc.activeElement) {
          // only actually select if this element is active!
          this._nativeSelect(this._nativeRange(b));
        }
        this.dispatch({ type: 'select', bubbles: true });
        return this; // allow for chaining
      },
      selection: function (text) {
        if (arguments.length) {
          return this.bounds('selection').text(text).bounds('endbounds').select();
        } else {
          return this.bounds('selection').text();
        }
      },
      sendkeys: function (text) {
        this.data.sendkeysOriginalText = this.text();
        this.data.sendkeysBounds = undefined;
        function simplechar(rng, c) {
          if (/^{[^}]*}$/.test(c)) c = c.slice(1, -1);	// deal with unknown {key}s
          rng.text(c).bounds('endbounds');
        }
        text.replace(/{[^}]*}|[^{]+|{/g, part => (bililiteRange.sendkeys[part] || simplechar)(this, part, simplechar));
        this.bounds(this.data.sendkeysBounds);
        this.dispatch({ type: 'sendkeys', detail: text });
        return this;
      },
      text: function (text, { inputType = 'insertText' } = {}) {
        if (text !== undefined) {
          let eventparams = [this.text(), text, this[0], inputType];
          this.dispatch(inputEventInit('beforeinput', ...eventparams));
          this._nativeSetText(text, this._nativeRange(this.bounds()));
          this[1] = this[0] + text.length;
          this.dispatch(inputEventInit('input', ...eventparams));
          return this; // allow for chaining
        } else {
          return this._nativeGetText(this._nativeRange(this.bounds()));
        }
      },
      top: function () {
        return this._nativeTop(this._nativeRange(this.bounds()));
      },
      get window() {
        return this._win;
      },
      wrap: function (n) {
        this._nativeWrap(n, this._nativeRange(this.bounds()));
        return this;
      },
    };

    // allow extensions ala jQuery
    bililiteRange.prototype = Range.prototype;
    bililiteRange.extend = function (fns) {
      Object.assign(bililiteRange.prototype, fns);
    };

    bililiteRange.override = (name, fn) => {
      const oldfn = bililiteRange.prototype[name];
      bililiteRange.prototype[name] = function () {
        const oldsuper = this.super;
        this.super = oldfn;
        const ret = fn.apply(this, arguments);
        this.super = oldsuper;
        return ret;
      };
    }

    //bounds functions
    bililiteRange.bounds = {
      all: function () { return [0, this.length] },
      start: function () { return 0 },
      end: function () { return this.length },
      selection: function () {
        if (this._el === this._doc.activeElement) {
          this.bounds('all'); // first select the whole thing for constraining
          return this._nativeSelection();
        } else {
          return this.data.selection;
        }
      },
      startbounds: function () { return this[0] },
      endbounds: function () { return this[1] },
      union: function (name, ...rest) {
        const b = this.clone().bounds(...rest);
        return [Math.min(this[0], b[0]), Math.max(this[1], b[1])];
      },
      intersection: function (name, ...rest) {
        const b = this.clone().bounds(...rest);
        return [Math.max(this[0], b[0]), Math.min(this[1], b[1])];
      }
    };

    // sendkeys functions
    bililiteRange.sendkeys = {
      '{tab}': function (rng, c, simplechar) {
        simplechar(rng, '\t'); // useful for inserting what would be whitespace
      },
      '{newline}': function (rng) {
        rng.text('\n', { inputType: 'insertLineBreak' }).bounds('endbounds');
      },
      '{backspace}': function (rng) {
        var b = rng.bounds();
        if (b[0] == b[1]) rng.bounds([b[0] - 1, b[0]]); // no characters selected; it's just an insertion point. Remove the previous character
        rng.text('', { inputType: 'deleteContentBackward' }); // delete the characters and update the selection
      },
      '{del}': function (rng) {
        var b = rng.bounds();
        if (b[0] == b[1]) rng.bounds([b[0], b[0] + 1]); // no characters selected; it's just an insertion point. Remove the next character
        rng.text('', { inputType: 'deleteContentForward' }).bounds('endbounds'); // delete the characters and update the selection
      },
      '{rightarrow}': function (rng) {
        var b = rng.bounds();
        if (b[0] == b[1]) ++b[1]; // no characters selected; it's just an insertion point. Move to the right
        rng.bounds([b[1], b[1]]);
      },
      '{leftarrow}': function (rng) {
        var b = rng.bounds();
        if (b[0] == b[1]) --b[0]; // no characters selected; it's just an insertion point. Move to the left
        rng.bounds([b[0], b[0]]);
      },
      '{selectall}': function (rng) {
        rng.bounds('all');
      },
      '{selection}': function (rng) {
        // insert the characters without the sendkeys processing
        rng.text(rng.data.sendkeysOriginalText).bounds('endbounds');
      },
      '{mark}': function (rng) {
        rng.data.sendkeysBounds = rng.bounds();
      },
      '{ctrl-Home}': (rng, c, simplechar) => rng.bounds('start'),
      '{ctrl-End}': (rng, c, simplechar) => rng.bounds('end')
    };
    // Synonyms from the DOM standard (http://www.w3.org/TR/DOM-Level-3-Events-key/)
    bililiteRange.sendkeys['{Enter}'] = bililiteRange.sendkeys['{enter}'] = bililiteRange.sendkeys['{newline}'];
    bililiteRange.sendkeys['{Backspace}'] = bililiteRange.sendkeys['{backspace}'];
    bililiteRange.sendkeys['{Delete}'] = bililiteRange.sendkeys['{del}'];
    bililiteRange.sendkeys['{ArrowRight}'] = bililiteRange.sendkeys['{rightarrow}'];
    bililiteRange.sendkeys['{ArrowLeft}'] = bililiteRange.sendkeys['{leftarrow}'];

    // an input element in a standards document. "Native Range" is just the bounds array
    function InputRange() { }
    InputRange.prototype = new Range();
    InputRange.prototype._textProp = 'value';
    InputRange.prototype._nativeRange = function (bounds) {
      return bounds || [0, this.length];
    };
    InputRange.prototype._nativeSelect = function (rng) {
      this._el.setSelectionRange(rng[0], rng[1]);
    };
    InputRange.prototype._nativeSelection = function () {
      return [this._el.selectionStart, this._el.selectionEnd];
    };
    InputRange.prototype._nativeGetText = function (rng) {
      return this._el.value.substring(rng[0], rng[1]);
    };
    InputRange.prototype._nativeSetText = function (text, rng) {
      var val = this._el.value;
      this._el.value = val.substring(0, rng[0]) + text + val.substring(rng[1]);
    };
    InputRange.prototype._nativeEOL = function () {
      this.text('\n');
    };
    InputRange.prototype._nativeTop = function (rng) {
      if (rng[0] == 0) return 0; // the range starts at the top
      const el = this._el;
      if (el.nodeName == 'INPUT') return 0;
      const text = el.value;
      const selection = [el.selectionStart, el.selectionEnd];
      // hack from https://code.google.com/archive/p/proveit-js/source/default/source, highlightLengthAtIndex function
      // note that this results in the element being scrolled; the actual number returned is irrelevant
      el.value = text.slice(0, rng[0]);
      el.scrollTop = Number.MAX_SAFE_INTEGER;
      el.value = text;
      el.setSelectionRange(...selection);
      return el.scrollTop;
    }
    InputRange.prototype._nativeWrap = function () { throw new Error("Cannot wrap in a text element") };

    function W3CRange() { }
    W3CRange.prototype = new Range();
    W3CRange.prototype._textProp = 'textContent';
    W3CRange.prototype._nativeRange = function (bounds) {
      var rng = this._doc.createRange();
      rng.selectNodeContents(this._el);
      if (bounds) {
        w3cmoveBoundary(rng, bounds[0], true, this._el);
        rng.collapse(true);
        w3cmoveBoundary(rng, bounds[1] - bounds[0], false, this._el);
      }
      return rng;
    };
    W3CRange.prototype._nativeSelect = function (rng) {
      this._win.getSelection().removeAllRanges();
      this._win.getSelection().addRange(rng);
    };
    W3CRange.prototype._nativeSelection = function () {
      // returns [start, end] for the selection constrained to be in element
      var rng = this._nativeRange(); // range of the element to constrain to
      if (this._win.getSelection().rangeCount == 0) return [this.length, this.length]; // append to the end
      var sel = this._win.getSelection().getRangeAt(0);
      return [
        w3cstart(sel, rng),
        w3cend(sel, rng)
      ];
    };
    W3CRange.prototype._nativeGetText = function (rng) {
      return rng.toString();
    };
    W3CRange.prototype._nativeSetText = function (text, rng) {
      rng.deleteContents();
      rng.insertNode(this._doc.createTextNode(text));
      // Lea Verou's "super dirty fix" to #31
      if (text == '\n' && this[1] + 1 == this._el.textContent.length) {
        // inserting a newline at the end
        this._el.innerHTML = this._el.innerHTML + '\n';
      }
      this._el.normalize(); // merge the text with the surrounding text
    };
    W3CRange.prototype._nativeEOL = function () {
      var rng = this._nativeRange(this.bounds());
      rng.deleteContents();
      var br = this._doc.createElement('br');
      br.setAttribute('_moz_dirty', ''); // for Firefox
      rng.insertNode(br);
      rng.insertNode(this._doc.createTextNode('\n'));
      rng.collapse(false);
    };
    W3CRange.prototype._nativeTop = function (rng) {
      if (this.length == 0) return 0; // no text, no scrolling
      if (rng.toString() == '') {
        var textnode = this._doc.createTextNode('X');
        rng.insertNode(textnode);
      }
      var startrng = this._nativeRange([0, 1]);
      var top = rng.getBoundingClientRect().top - startrng.getBoundingClientRect().top;
      if (textnode) textnode.parentNode.removeChild(textnode);
      return top;
    }
    W3CRange.prototype._nativeWrap = function (n, rng) {
      rng.surroundContents(n);
    };

    // W3C internals
    function nextnode(node, root) {
      //  in-order traversal
      // we've already visited node, so get kids then siblings
      if (node.firstChild) return node.firstChild;
      if (node.nextSibling) return node.nextSibling;
      if (node === root) return null;
      while (node.parentNode) {
        // get uncles
        node = node.parentNode;
        if (node == root) return null;
        if (node.nextSibling) return node.nextSibling;
      }
      return null;
    }
    function w3cmoveBoundary(rng, n, bStart, el) {
      // move the boundary (bStart == true ? start : end) n characters forward, up to the end of element el. Forward only!
      // if the start is moved after the end, then an exception is raised
      if (n <= 0) return;
      var node = rng[bStart ? 'startContainer' : 'endContainer'];
      if (node.nodeType == 3) {
        // we may be starting somewhere into the text
        n += rng[bStart ? 'startOffset' : 'endOffset'];
      }
      while (node) {
        if (node.nodeType == 3) {
          var length = node.nodeValue.length;
          if (n <= length) {
            rng[bStart ? 'setStart' : 'setEnd'](node, n);
            // special case: if we end next to a <br>, include that node.
            if (n == length) {
              // skip past zero-length text nodes
              for (var next = nextnode(node, el); next && next.nodeType == 3 && next.nodeValue.length == 0; next = nextnode(next, el)) {
                rng[bStart ? 'setStartAfter' : 'setEndAfter'](next);
              }
              if (next && next.nodeType == 1 && next.nodeName == "BR") rng[bStart ? 'setStartAfter' : 'setEndAfter'](next);
            }
            return;
          } else {
            rng[bStart ? 'setStartAfter' : 'setEndAfter'](node); // skip past this one
            n -= length; // and eat these characters
          }
        }
        node = nextnode(node, el);
      }
    }
    var START_TO_START = 0; // from the w3c definitions
    var START_TO_END = 1;
    var END_TO_END = 2;
    var END_TO_START = 3;
    // from the Mozilla documentation, for range.compareBoundaryPoints(how, sourceRange)
    // -1, 0, or 1, indicating whether the corresponding boundary-point of range is respectively before, equal to, or after the corresponding boundary-point of sourceRange. 
    // * Range.END_TO_END compares the end boundary-point of sourceRange to the end boundary-point of range.
    // * Range.END_TO_START compares the end boundary-point of sourceRange to the start boundary-point of range.
    // * Range.START_TO_END compares the start boundary-point of sourceRange to the end boundary-point of range.
    // * Range.START_TO_START compares the start boundary-point of sourceRange to the start boundary-point of range. 
    function w3cstart(rng, constraint) {
      if (rng.compareBoundaryPoints(START_TO_START, constraint) <= 0) return 0; // at or before the beginning
      if (rng.compareBoundaryPoints(END_TO_START, constraint) >= 0) return constraint.toString().length;
      rng = rng.cloneRange(); // don't change the original
      rng.setEnd(constraint.endContainer, constraint.endOffset); // they now end at the same place
      return constraint.toString().length - rng.toString().length;
    }
    function w3cend(rng, constraint) {
      if (rng.compareBoundaryPoints(END_TO_END, constraint) >= 0) return constraint.toString().length; // at or after the end
      if (rng.compareBoundaryPoints(START_TO_END, constraint) <= 0) return 0;
      rng = rng.cloneRange(); // don't change the original
      rng.setStart(constraint.startContainer, constraint.startOffset); // they now start at the same place
      return rng.toString().length;
    }

    function NothingRange() { }
    NothingRange.prototype = new Range();
    NothingRange.prototype._textProp = 'value';
    NothingRange.prototype._nativeRange = function (bounds) {
      return bounds || [0, this.length];
    };
    NothingRange.prototype._nativeSelect = function (rng) { // do nothing
    };
    NothingRange.prototype._nativeSelection = function () {
      return [0, 0];
    };
    NothingRange.prototype._nativeGetText = function (rng) {
      return this._el[this._textProp].substring(rng[0], rng[1]);
    };
    NothingRange.prototype._nativeSetText = function (text, rng) {
      var val = this._el[this._textProp];
      this._el[this._textProp] = val.substring(0, rng[0]) + text + val.substring(rng[1]);
    };
    NothingRange.prototype._nativeEOL = function () {
      this.text('\n');
    };
    NothingRange.prototype._nativeTop = function () {
      return 0;
    };
    NothingRange.prototype._nativeWrap = function () { throw new Error("Wrapping not implemented") };


    // data for elements, similar to jQuery data, but allows for monitoring with custom events
    const monitored = new Set();

    function signalMonitor(prop, value, element) {
      const attr = `data-${prop}`;
      element.dispatchEvent(new CustomEvent(attr, { bubbles: true, detail: value }));
      try {
        element.setAttribute(attr, value); // illegal attribute names will throw. Ignore it			
      } finally { /* ignore */ }
    }

    function createDataObject(el) {
      return el[datakey] = new Proxy(new Data(el), {
        set(obj, prop, value) {
          obj[prop] = value;
          if (monitored.has(prop)) signalMonitor(prop, value, obj.sourceElement);
          return true; // in strict mode, 'set' returns a success flag 
        }
      });
    }

    var Data = function (el) {
      Object.defineProperty(this, 'sourceElement', {
        value: el
      });
    }

    Data.prototype = {};
    // for use with ex options. JSON.stringify(range.data) should return only the options that were
    // both defined with bililiteRange.option() *and* actually had a value set on this particular data object.
    // JSON.stringify (range.data.all) should return all the options that were defined.
    Object.defineProperty(Data.prototype, 'toJSON', {
      value: function () {
        let ret = {};
        for (let key in Data.prototype) if (this.hasOwnProperty(key)) ret[key] = this[key];
        return ret;
      }
    });
    Object.defineProperty(Data.prototype, 'all', {
      get: function () {
        let ret = {};
        for (let key in Data.prototype) ret[key] = this[key];
        return ret;
      }
    });
    Object.defineProperty(Data.prototype, 'trigger', {
      value: function () {
        monitored.forEach(prop => signalMonitor(prop, this[prop], this.sourceElement));
      }
    });

    bililiteRange.createOption = function (name, desc = {}) {
      desc = Object.assign({
        enumerable: true, // use these as the defaults
        writable: true,
        configurable: true
      }, Object.getOwnPropertyDescriptor(Data.prototype, name), desc);
      if ('monitored' in desc) monitored[desc.monitored ? 'add' : 'delete'](name);
      Object.defineProperty(Data.prototype, name, desc);
      return Data.prototype[name]; // return the default value
    }
  })();
  return bililiteRange;
}
window.strEvent = `
  function setNativeValue(element, value) {
    let lastValue = element.value;
    element.value = value;
    let event = new Event("input", {
      target: element, bubbles: true });
    // React 15
    event.simulated = true;
    // React 16
    let tracker = element._valueTracker;
    if (tracker) {
      tracker.setValue(lastValue);
    }
    element.dispatchEvent(event);
  }
  function setNativeBlur(element) {
    element.focus();
    let event = new Event("blur", {
      target: element, bubbles: true });
    // React 15
    event.simulated = true;
    element.dispatchEvent(event);
  }
  var keyboardEvent = document.createEvent("KeyboardEvent");
  var initMethod = typeof keyboardEvent.initKeyboardEvent !== "undefined" ? "initKeyboardEvent" : "initKeyEvent";
  keyboardEvent[initMethod](
                     "keydown", // event type : keydown, keyup, keypress
                      true,     // bubbles
                      true,     // cancelable  
                      window,   // viewArg: should be window  
                      false,    // ctrlKeyArg  
                      false,    // altKeyArg
                      false,    // shiftKeyArg
                      false,    // metaKeyArg
                      40,       // keyCodeArg : unsigned long the virtual key code, else 0  
                      0         // charCodeArgs : unsigned long the Unicode character associated with the depressed key, else 0
  );
  document.dispatchEvent(keyboardEvent); 
  function fireKey(el,key)
  {
      if(document.createEventObject)
      {
          var eventObj = document.createEventObject();
          eventObj.keyCode = key;
          el.fireEvent("onkeydown", eventObj);
          eventObj.keyCode = key;   
      }else if(document.createEvent)
      {
          var eventObj = document.createEvent("Events");
          eventObj.initEvent("keydown", true, true);
          eventObj.which = key; 
          eventObj.keyCode = key;
          el.dispatchEvent(eventObj);
      }
  }
  function CallMouseEvent(targetNode)
  {
    if (targetNode) {
        triggerMouseEvent (targetNode, "mouseover");
        triggerMouseEvent (targetNode, "mousedown");
        triggerMouseEvent (targetNode, "mouseup");
        triggerMouseEvent (targetNode, "click");
        bililiteRange(targetNode).sendkeys('{rightarrow}{enter}');
    }
    else
        console.log ("*** Target node not found!");
  }
  function triggerMouseEvent (node, eventType) {
      var clickEvent = document.createEvent ("MouseEvents");
      clickEvent.initEvent (eventType, true, true);
      node.dispatchEvent (clickEvent);
  }  
  function simulateClick(obj) {
    var evt = document.createEvent("MouseEvents");
    evt.initMouseEvent("click", true, true, window,
      0, 0, 0, 0, 0, false, false, false, false, 0, null);
    var canceled = !obj.dispatchEvent(evt);   
  }
  /**
   * Gửi một sự kiện tùy chỉnh tới GA4.
   * @param {string} eventName Tên sự kiện.
   * @param {object} eventParams Các tham số tùy chỉnh của sự kiện.
   * @param {string} sessionId ID của phiên hiện tại.
   * @param {number} engagementTime Thời gian tương tác cho sự kiện này (mili giây).
   */
  function sendGA4Event(eventName, eventParams = {}, sessionId, engagementTime) {
    const safeEngagementTime = Math.max(0, engagementTime);

    if (typeof gtag === 'function') {
      gtag('event', eventName, {
        ...eventParams,
        'session_id': sessionId,
        'engagement_time_msec': safeEngagementTime
      });
      console.log(JSON.stringify({ type: "su_kien", tabid: tabid, su_kien: "GA4: Đã gửi sự kiện " + eventName + " với session_id: " + sessionId + " và thời gian tương tác: " + safeEngagementTime + "ms." }));
      console.log("GA4: Đã gửi sự kiện '" + eventName + "' với session_id: " + sessionId + " và thời gian tương tác: " + safeEngagementTime + "ms.");
    } else {
      console.warn("GA4: Hàm 'gtag' không được tìm thấy. Vui lòng đảm bảo 'gtag.js' đã được cài đặt.");
    }
  }

  /**
   * Gửi sự kiện cuối cùng để tổng kết thời gian khi người dùng rời trang.
   * @param {string} sessionId ID của phiên hiện tại.
   * @param {number} startTime Thời gian bắt đầu của phiên.
   */
  function sendFinalEngagementEvent(sessionId, startTime) {
    if (!sessionId || !startTime) {
      return;
    }
    const finalEngagementTime = Date.now() - startTime;
    const safeFinalEngagementTime = Math.max(0, finalEngagementTime);
    sendGA4Event('user_engagement', { engaged_session_event: true }, sessionId, safeFinalEngagementTime);
    console.log("������ Phiên mô phỏng người dùng đã kết thúc. Tổng thời gian tương tác: " + Math.round(safeFinalEngagementTime / 1000) + " giây.");
    localStorage.removeItem('simulation_sessionId');
    localStorage.removeItem('simulation_startTime');
  }

  // Lắng nghe sự kiện trước khi trang bị dỡ tải để gửi sự kiện cuối cùng
  window.addEventListener('beforeunload', () => {
    const sessionId = localStorage.getItem('simulation_sessionId');
    const startTime = localStorage.getItem('simulation_startTime');
    if (sessionId && startTime) {
      sendFinalEngagementEvent(sessionId, startTime);
    }
  });

/**
 * 1. Hàm phát hiện ID GA4 (Của bạn)
 */
function detectGA4MeasurementId() {
    try {
        const scripts = Array.from(document.querySelectorAll('script'));
        for (const script of scripts) {
            const content = script.textContent || script.innerText;
            const configMatch = content.match(/gtag\\s*\\(\\s*["']config["']\\s*,\\s*["']?(G-[A-Z0-9]+)["']?/i);
            if (configMatch) return configMatch[1];
            const srcMatch = script.src && script.src.match(/\\/gtag\\/js\\?id=(G-[A-Z0-9]+)/i);
            if (srcMatch) return srcMatch[1];
        }
        if (window.dataLayer && Array.isArray(window.dataLayer)) {
            for (const item of window.dataLayer) {
                if (item && typeof item === 'object') {
                    for (const key in item) {
                        const val = item[key];
                        if (typeof val === 'string' && /^G-[A-Z0-9]+$/i.test(val)) return val;
                    }
                }
            }
        }
        if (window.google_tag_manager) {
            for (const key in window.google_tag_manager) {
                if (key.startsWith('G-')) return key;
            }
        }
        return null;
    } catch(e) { return null; }
}

/**
 * 2. Hàm lấy Client ID chính xác - Không bị treo Promise
 */
async function getAccurateClientId() {
    const measurementId = detectGA4MeasurementId();
    
    return new Promise((resolve) => {
        let hasResolved = false;

        // Hàm hỗ trợ kết thúc Promise
        const safeResolve = (id, method) => {
            if (!hasResolved) {
                hasResolved = true;
                if (id) console.log("[GA4] ✓ Lấy ID thành công qua: "+method+" ->", id);
                resolve(id);
            }
        };

        // --- CÁCH 1: Dùng API chính thức của gtag (Chính xác nhất) ---
        if (typeof gtag === 'function' && measurementId) {
            gtag('get', measurementId, 'client_id', (id) => {
                if (id) safeResolve(id, 'gtag_api');
            });
        }

        // --- CÁCH 2: Quét dataLayer (Dành cho GTM) ---
        setTimeout(() => {
            if (window.dataLayer) {
                const ga4Item = window.dataLayer.find(i => i.client_id || (i[0] === 'config' && i[2] && i[2].client_id));
                const idFromDL = ga4Item ? (ga4Item.client_id || ga4Item[2].client_id) : null;
                if (idFromDL) safeResolve(idFromDL, 'dataLayer');
            }
        }, 500);

        // --- CÁCH 3: Quét Cookie (Dự phòng cuối cùng) ---
        setTimeout(() => {
            const match = document.cookie.match(/_ga=(?:GA1\.\d+\.)?(\d+\.\d+)/);
            const idFromCookie = match ? match[1] : null;
            if (idFromCookie) safeResolve(idFromCookie, 'cookie_fallback');
        }, 1000);

        // --- CÁCH 4: Timeout - Ngắt chờ sau 2 giây để không bị treo ---
        setTimeout(() => {
            if (!hasResolved) {
                console.warn("[GA4] ⚠ Không thể lấy Client ID sau 2s.");
                safeResolve(null, 'timeout');
            }
        }, 2000);
    });
}
  /**
   * Mô phỏng hành vi người dùng thật và gửi các sự kiện tương tác để GA4 ghi nhận.
   * @param {number} so_phut_gioi_han Thời gian tối đa của phiên mô phỏng (phút).
   */
  async function simulateRealisticUserBehavior(so_phut_gioi_han = 5) {
    const startTime = Date.now();
    console.log("������ Bắt đầu mô phỏng hành vi người dùng thật cho GA4.");

    const ga_clientId = getAccurateClientId();
    if (!ga_clientId) {
      console.error("❌ Không thể lấy Client ID. Hủy mô phỏng GA4.");
      return;
    }

    console.log(JSON.stringify({ type: "title", tabid: tabid, title: "GA4 client id " + ga_clientId + "(" + ga_clientId + ")" + " - " + (document.title || location.href) }));

    // Thời gian phiên mô phỏng sẽ là một giá trị ngẫu nhiên
    const sessionDuration = (so_phut_gioi_han * 60000);
    const endTime = startTime + sessionDuration;

    const sessionId = Math.floor(Date.now() / 1000);

    localStorage.setItem('simulation_sessionId', sessionId);
    localStorage.setItem('simulation_startTime', startTime);

    console.log("GA4 client id: " + ga_clientId);
    console.log("⏳ Phiên này sẽ kéo dài khoảng " + Math.round(sessionDuration / 1000) + " giây.");

    // Ngưỡng thời gian để bắt đầu chuyển trang
    // Tỷ lệ thời gian muốn ở lại trên trang đầu tiên (ví dụ: 80% - 90%)
    const stayOnPageRatio = Math.random() * 0.1 + 0.8; // Ngẫu nhiên từ 80% đến 90%
    const navigationThreshold = sessionDuration * stayOnPageRatio;

    let lastEngagementTime = startTime;

    while (Date.now() < endTime) {
      const elapsedTime = Date.now() - startTime;
      console.log("Tổng thời gian đã trôi qua: " + Math.round(elapsedTime / 1000) + " giây.");

      // Kiểm tra xem đã đạt ngưỡng chuyển trang chưa
      if (elapsedTime >= navigationThreshold) {
        console.log("������ Đã đạt ngưỡng " + Math.round(stayOnPageRatio * 100) + "% thời gian. Bắt đầu mô phỏng hành vi chuyển trang.");
        // Lấy danh sách các liên kết nội bộ trên trang
        const internalLinks = Array.from(document.querySelectorAll('a[href^="/"], a[href^="' + window.location.origin + '"]'));

        if (internalLinks.length > 0) {
          const randomIndex = Math.floor(Math.random() * internalLinks.length);
          const targetUrl = internalLinks[randomIndex].href;

          console.log("➡️ Đang mô phỏng chuyển hướng tới trang: " + targetUrl);

          // Ghi lại sự kiện nhấp chuột trước khi chuyển hướng
          // Thời gian tương tác cho sự kiện này là thời gian từ hành động cuối cùng
          const currentEngagementTime = Date.now() - lastEngagementTime;
          sendGA4Event('internal_link_click', {
            'link_url': targetUrl,
            'link_text': internalLinks[randomIndex].innerText || 'N/A'
          }, sessionId, currentEngagementTime);

          window.location.href = targetUrl;
          break; 
        }
      }

      // --- Mô phỏng hành vi cuộn và đọc ---
      const scrollDuration = Math.random() * 4000 + 2000;
      const readingTime = Math.random() * 20000 + 10000;

      // Cuộn trang
      const scrollStart = Date.now();
      await new Promise(resolve => {
        const startScrollY = window.scrollY;
        const scrollDistance = window.innerHeight * (0.5 + Math.random() * 1.5);
        const animateScroll = () => {
          const elapsed = Date.now() - scrollStart;
          const progress = Math.min(elapsed / scrollDuration, 1);
          window.scrollTo(0, startScrollY + (scrollDistance * progress));
          if (progress < 1) {
            requestAnimationFrame(animateScroll);
          } else {
            resolve();
          }
        };
        requestAnimationFrame(animateScroll);
      });
      const scrollEnd = Date.now();
      sendGA4Event('scrolled', { scroll_depth: Math.min(100, Math.round((window.scrollY + window.innerHeight) / document.body.scrollHeight * 100)) + "%" }, sessionId, scrollEnd - scrollStart);
      lastEngagementTime = scrollEnd;
      console.log("✅ Đã cuộn trang.");

      // Dừng để đọc
      const readingStart = Date.now();
      await new Promise(resolve => setTimeout(resolve, readingTime));
      const readingEnd = Date.now();
      sendGA4Event('content_reading', { read_duration_seconds: Math.round((readingEnd - readingStart) / 1000) }, sessionId, readingEnd - readingStart);
      lastEngagementTime = readingEnd;
      console.log("������ Tạm dừng để đọc/tương tác nội dung trong " + Math.round(readingTime / 1000) + " giây.");
    }

    sendFinalEngagementEvent(sessionId, startTime);
  }
`;
window.strGoogleAds = strEvent + `
  // Tạo một hàm để gọi hành động tiếp theo
  // Tạo một hàm để gọi hành động tiếp theo
  // Khóa lưu trữ trong localStorage
  const STORAGE_KEY = 'google_auto_pagination_count';
  const MAX_PAGES = 20; // Giới hạn số trang tối đa

  // --- HÀM TIỆN ÍCH ---

  /**
   * Lấy số lần click hiện tại từ localStorage.
   * @returns {number} Số lần click đã thực hiện.
   */
  function getCurrentClickCount() {
      const count = localStorage.getItem(STORAGE_KEY);
      return parseInt(count, 10) || 0;
  }

  /**
   * Đặt lại bộ đếm phân trang và gửi lệnh đóng tab.
   */
  function resetPagingAndClose() {
      localStorage.removeItem(STORAGE_KEY);
      console.log('[RESET] Đã đặt lại bộ đếm phân trang.');

      // Gửi lệnh đóng tab tới nwjs main process
      console.log(JSON.stringify({type:"close", tabid:tabid}));
  }

  // --- HÀM CHÍNH ĐƯỢC TỐI ƯU ---

  /**
   * Mô phỏng hành vi của người dùng và duy trì trạng thái qua các lần tải trang (reload).
   */
  function simulateHumanBehavior() {
      const currentCount = getCurrentClickCount();

      // 1. Kiểm tra giới hạn số trang
      if (currentCount >= MAX_PAGES) {
          resetPagingAndClose(); // Thực hiện đặt lại và gửi lệnh đóng tab
          return;
      }

      // 2. Tìm nút "Trang tiếp theo"
      // Selector ổn định nhất: #pnnext hoặc aria-label
      const nextPage = document.querySelector('a#pnnext, a[aria-label*="Next page"], a[aria-label*="Trang tiếp theo"]');

      if (nextPage) {
          // 3. Tạo độ trễ ngẫu nhiên (5 đến 10 giây)
          const minDelaySeconds = 5;
          const maxDelaySeconds = 10;
          const randomDelay = (Math.random() * (maxDelaySeconds - minDelaySeconds) + minDelaySeconds) * 1000;

          const nextCount = currentCount + 1;

          setTimeout(function() {
              // QUAN TRỌNG: Lưu trạng thái MỚI (đã tăng) vào localStorage TRƯỚC khi nhấp.
              localStorage.setItem(STORAGE_KEY, nextCount.toString());
              // Thực hiện hành động nhấp chuột.
              // Hành động này sẽ gây ra việc tải lại trang.
              CallMouseEvent(nextPage);

          }, randomDelay);
      } else {
          // Nếu không còn nút "Tiếp theo" (kết quả đã hết trước khi đạt MAX_PAGES)
          resetPagingAndClose(); // Thực hiện đặt lại và gửi lệnh đóng tab
      }
  }
  window.google_click=function(tu_khoa,link_check,time_o_lai_trang,isRunAds){
    setTimeout(function(){console.log(JSON.stringify({type:"close",tabid:tabid}))},(Number(time_o_lai_trang)||1)*60000+30000);
    if(location.href.indexOf("chrome-error")!=-1)
      console.log(JSON.stringify({type:"close",tabid:tabid}));
    else if(location.href.indexOf("google.com/sorry/index")!=-1||(location.href.indexOf("google.com")===-1 && location.href!==link_check))
    {
      simulateRealisticUserBehavior(time_o_lai_trang);
    }
    else if(location.href.indexOf("google.com")!==-1)
    {
      var el=document.querySelector('form [name="q"]');
      if(el)
      {
        if(el.value=="")
        {
          try{
            if(!tu_khoa)
              return setTimeout(function() {location.href=link_check;},5000);
            else
            {
              bililiteRange(el).sendkeys(tu_khoa+'{enter}');
              setTimeout(function() {
                if(document.querySelector('[type="submit"]'))
                  CallMouseEvent(document.querySelector('[type="submit"]'));
              },1000);
            }
          }catch(e){}
        }
        else
        {
          var filterSTR='';
          if(1*isRunAds===1)
            filterSTR='*="/aclk?"';
          var caclinks=document.querySelectorAll('a[data-ved][href'+filterSTR+']');
          if(document.querySelector("#search"))
            caclinks=document.querySelectorAll('#search a[data-ved][href'+filterSTR+']');
          else if(document.querySelector("#main"))
            caclinks=document.querySelectorAll('#main a[data-ved][href'+filterSTR+']');
          else if(document.querySelectorAll('div:not([class]) a[data-ved][href'+filterSTR+'], a.fuLhoc[href'+filterSTR+']').length>0)
            caclinks=document.querySelectorAll('div:not([class]) a[data-ved][href'+filterSTR+'], a.fuLhoc[href'+filterSTR+']');
					caclinks=Array.from(caclinks).filter(el=>el.querySelector('h3'))
          // var timPT=Array.from(caclinks).filter(el => el.innerHTML.toLowerCase().includes(link_check));
          var timPT=caclinks.filter(el => el.href.toLowerCase().includes(link_check));
          var link_map=document.querySelector('[href*="'+link_check+'"]');
          var cTop=0;
          const regex = /start=(\\d+)/; // \d+ tìm một hoặc nhiều chữ số
          const match = location.href.match(regex);
          var gTop=0;
          if (match) 
            cTop= match[1]; 
          if(timPT.length>0)
          {
            var idxPage=Array.from(caclinks).findIndex(el => el.href.toLowerCase().includes(link_check));
            if(cTop>0)
              gTop="Vị trí "+(idxPage+1)+" trang "+(cTop/10);
            else
            {
							var vi_tri=idxPage+1;
              gTop="Vị trí "+vi_tri+" trang đầu";
            }
            console.log(JSON.stringify({type:"save",gTop:gTop,tu_khoa:tu_khoa,link_check:link_check,isRunAds:isRunAds}));
            timPT=timPT[0];
            setTimeout(function() {CallMouseEvent(timPT);},5000);
          }
          else if(link_map && gTop>=15)
          {
            console.log(JSON.stringify({type:"save",gTop:"Vị trí đầu từ Google Map",tu_khoa:tu_khoa,link_check:link_check,isRunAds:isRunAds}));
            setTimeout(function() {CallMouseEvent(link_map);},5000);
          }
          else if(1*isRunAds!==1)
          {
            // Bắt đầu chuỗi hành động lần đầu tiên
            simulateHumanBehavior();
          }
        }
      }
    }
    else
    {
      setTimeout(function(){
        simulateRealisticUserBehavior(time_o_lai_trang);
      },30000);
      if(1*isRunAds===2) {
        // Chờ trang tải hoàn toàn trước khi lấy links
        function waitForOpenLog() {
          const linksArray = Array.from(document.querySelectorAll('a')).filter(el=>el.href.indexOf(location.host)!==-1 && el.href.indexOf('login')===-1 && el.href.indexOf('#')===-1).map(el=>el.href);
          if (linksArray.length > 0) {
            console.log(JSON.stringify({type:"open",isRunAds:isRunAds,tabid:tabid,links:linksArray}));
          } else {
            // Chờ 2 giây và thử lại nếu chưa có links
            setTimeout(waitForOpenLog, 2000);
          }
        }
        waitForOpenLog();
      }
      setTimeout(function(){
        const allLinks = Array.from(document.querySelectorAll("a")).filter(link=>link.href.indexOf(location.hostname)!==-1 && link.href.indexOf("?")===-1 && link.href.trim()!==location.href.trim());
        // Kiểm tra xem có phần tử nào không trước khi truy cập
        if (allLinks.length > 0) {
          // Lấy phần tử cuối cùng bằng chỉ mục (index) là length - 1
          const lastElement = allLinks[allLinks.length - 1];
          console.log(JSON.stringify({type:"activetab",tabid:tabid}));
          CallMouseEvent(lastElement);
        } else {
          console.log("Không tìm thấy phần tử nào.");
        }
      },time_o_lai_trang*60000);
    }
  }
`;
// const {app} = require('electron');
// const { ipcRenderer } = require('electron');   
// global.pingHost = () => {
//   ipcRenderer.sendToHost('CHANNEL')
// }
// pingHost();
// ipcRenderer.on('CHANNEL', (event, data) =>{ console.log(data); })
if (window.hasOwnProperty("process")) {
  window.opsys = process.platform;
}
// Giả sử bạn có thẻ webview trong HTML: <webview id="myWebview" src="..."></webview>

// QUAN TRỌNG: Cấu hình proxy tối ưu
// Proxy: 60 phút/lần, tối thiểu 6 phút sử dụng
// -> Giới hạn runtime ở 59 phút để sử dụng hết thời gian mà tránh timeout
window.MAX_PROXY_RUNTIME = 3540000; // 59 phút (3540000ms)
window.PROXY_MAX_LIFETIME = 3600000; // 60 phút (3600000ms) - thời gian tối đa cho 1 proxy

// Tracking thời gian proxy và trạng thái
window.__proxyActivatedTime = 0; // Thời điểm proxy được kích hoạt
window.__proxyLifetimeTimer = null; // Timer để tự động reset sau 60 phút
window.__isProxyActive = false; // Trạng thái proxy có đang hoạt động không
window.__batchStartTime = 0; // Thời điểm bắt đầu chạy batch hiện tại
window.__nextProxyChangeTime = 0; // Thời điểm cần đổi proxy tiếp theo (dựa vào sophut_lamtuoi)
window.__proxyNeedsReset = false; // Đánh dấu proxy cần reset do authentication error hoặc hết hạn
window.__proxyFailureCount = 0; // Đếm số lần proxy thất bại liên tiếp

// QUAN TRỌNG: Proxy credentials cho event 'login' trong webview
window.__proxyUsername = ''; // Username của proxy (cần cấu hình khi lấy proxy)
window.__proxyPassword = ''; // Password của proxy (cần cấu hình khi lấy proxy)
window.__proxyAuthenticating = false; // Flag để kiểm soát quá trình xác thực proxy

// Cấu hình kết nối proxy
window.PROXY_CONFIG = {
  MIN_REQUEST_INTERVAL: 360000, // 6 phút - tối thiểu giữa các request đổi IP
  CONNECTION_TIMEOUT: 30000, // 30 giây timeout cho mỗi kết nối
  READ_TIMEOUT: 45000, // 45 giây timeout cho việc đọc dữ liệu
  RETRY_ATTEMPTS: 3, // Số lần retry nếu lỗi
  RETRY_DELAY: 15000, // 15 giây giữa các retry
  KEEP_ALIVE_TIMEOUT: 300000 // 5 phút keep-alive timeout
};

// ============================================
// WEBVIEW NETWORK HEALTH CHECK - Kiểm tra sức khỏe mạng của webview
// ============================================
window.checkWebviewNetworkHealth = function(webviewId, callback) {
  try {
    const wv = document.getElementById(webviewId);
    if (!wv) {
      console.warn(`[Network Health] Webview ${webviewId} không tồn tại`);
      callback({ healthy: false, reason: 'webview_not_found' });
      return;
    }
    
    // Thử load một URL test đơn giản để kiểm tra kết nối
    const testUrl = 'https://www.google.com/favicon.ico'; // Tài nguyên nhỏ để test nhanh
    const testStartTime = Date.now();
    
    const healthCheckListener = (event) => {
      const loadTime = Date.now() - testStartTime;
      
      // Nếu load thành công
      if (event.type === 'did-finish-load' || event.type === 'did-get-response-details') {
        wv.removeEventListener('did-finish-load', healthCheckListener);
        wv.removeEventListener('did-fail-load', healthCheckListener);
        wv.removeEventListener('did-get-response-details', healthCheckListener);
        
        console.log(`✅ [Network Health] Webview ${webviewId} healthy - Load time: ${loadTime}ms`);
        callback({ healthy: true, loadTime: loadTime });
      }
      
      // Nếu load thất bại
      if (event.type === 'did-fail-load') {
        wv.removeEventListener('did-finish-load', healthCheckListener);
        wv.removeEventListener('did-fail-load', healthCheckListener);
        wv.removeEventListener('did-get-response-details', healthCheckListener);
        
        console.error(`❌ [Network Health] Webview ${webviewId} unhealthy - Error: ${event.errorCode} ${event.errorDescription}`);
        
        // Kiểm tra các error code liên quan đến proxy
        if (event.errorCode === -301 || event.errorCode === -302 || event.errorCode === -324 || event.errorCode === -106) {
          callback({ healthy: false, reason: 'proxy_auth_required', errorCode: event.errorCode });
        } else {
          callback({ healthy: false, reason: 'network_error', errorCode: event.errorCode, errorDescription: event.errorDescription });
        }
      }
    };
    
    wv.addEventListener('did-finish-load', healthCheckListener);
    wv.addEventListener('did-fail-load', healthCheckListener);
    wv.addEventListener('did-get-response-details', healthCheckListener);
    
    // Timeout sau 10 giây nếu không có response
    setTimeout(() => {
      wv.removeEventListener('did-finish-load', healthCheckListener);
      wv.removeEventListener('did-fail-load', healthCheckListener);
      wv.removeEventListener('did-get-response-details', healthCheckListener);
      
      console.warn(`⚠️ [Network Health] Webview ${webviewId} timeout sau 10s`);
      callback({ healthy: false, reason: 'timeout' });
    }, 10000);
    
    // Bắt đầu test bằng cách load URL test
    wv.loadURL(testUrl);
    
  } catch (err) {
    console.error(`❌ [Network Health] Error checking webview ${webviewId}:`, err);
    callback({ healthy: false, reason: 'exception', error: err.message });
  }
};

// Kiểm tra định kỳ sức khỏe của tất cả webview đang chạy
window.startWebviewHealthMonitor = function() {
  if (window.__healthMonitorInterval) {
    clearInterval(window.__healthMonitorInterval);
  }
  
  console.log('🏥 Bắt đầu monitoring sức khỏe webview mỗi 2 phút...');
  
  window.__healthMonitorInterval = setInterval(() => {
    const activeWebviews = document.querySelectorAll('[id^="U_"]:not([id*="tabSetting"])');
    
    if (activeWebviews.length === 0) {
      console.log('🏥 [Health Monitor] Không có webview nào đang chạy');
      return;
    }
    
    console.log(`🏥 [Health Monitor] Kiểm tra ${activeWebviews.length} webview đang hoạt động...`);
    
    let unhealthyCount = 0;
    activeWebviews.forEach((webviewContainer) => {
      const webviewId = webviewContainer.id;
      const webview = document.getElementById(webviewId);
      
      if (!webview) return;
      
      // Đơn giản hóa: chỉ kiểm tra xem webview có bị crash không
      try {
        const processId = webview.getProcessId && webview.getProcessId();
        if (!processId) {
          console.warn(`⚠️ [Health Monitor] Webview ${webviewId} không có process ID - có thể đã crash`);
          unhealthyCount++;
        }
      } catch (err) {
        console.warn(`⚠️ [Health Monitor] Webview ${webviewId} error:`, err.message);
        unhealthyCount++;
      }
    });
    
    // Nếu quá nhiều webview unhealthy, cân nhắc reset proxy
    if (unhealthyCount > activeWebviews.length / 2) {
      console.error(`🚨 [Health Monitor] ${unhealthyCount}/${activeWebviews.length} webview không khỏe mạnh - Có thể proxy có vấn đề`);
      window.__proxyNeedsReset = true;
    }
    
  }, 120000); // Check mỗi 2 phút
};

// Dừng health monitor
window.stopWebviewHealthMonitor = function() {
  if (window.__healthMonitorInterval) {
    clearInterval(window.__healthMonitorInterval);
    window.__healthMonitorInterval = null;
    console.log('🏥 Đã dừng health monitor');
  }
};

// Log thông tin proxy để debug
window.logProxyStatus = function() {
  console.log('📊 ===== PROXY STATUS =====');
  console.log('Proxy Active:', window.__isProxyActive);
  console.log('Proxy Activated Time:', window.__proxyActivatedTime ? new Date(window.__proxyActivatedTime).toLocaleString() : 'N/A');
  
  if (window.__proxyActivatedTime > 0) {
    const proxyAge = Date.now() - window.__proxyActivatedTime;
    const proxyAgeMinutes = Math.floor(proxyAge / 60000);
    const remainingMinutes = Math.floor((window.PROXY_MAX_LIFETIME - proxyAge) / 60000);
    console.log('Proxy đã chạy:', proxyAgeMinutes, 'phút');
    console.log('Proxy còn lại:', remainingMinutes, 'phút (tối đa 60 phút)');
  }
  
  console.log('Batch Start Time:', window.__batchStartTime ? new Date(window.__batchStartTime).toLocaleString() : 'N/A');
  
  if (window.__batchStartTime > 0) {
    const batchAge = Date.now() - window.__batchStartTime;
    const batchAgeMinutes = Math.floor(batchAge / 60000);
    const sophutLamtuoi = getStayMinutes();
    const remainingBatch = sophutLamtuoi - batchAgeMinutes;
    console.log('Batch đã chạy:', batchAgeMinutes, 'phút');
    console.log('Batch còn lại:', remainingBatch, 'phút (sophut_lamtuoi:', sophutLamtuoi, 'phút)');
  }
  
  console.log('Proxy Needs Reset:', window.__proxyNeedsReset);
  console.log('Proxy Failure Count:', window.__proxyFailureCount);
  console.log('Last Reset IP Time:', window.__lastResetIP ? new Date(window.__lastResetIP).toLocaleString() : 'N/A');
  console.log('==========================');
};

window.fnClearWebviewCache = function (webviewId, killProcess = false) {
  try {
    const wv = document.getElementById(webviewId);
    
    if (!wv) {
      console.warn('[fnClearWebviewCache] Webview không tìm thấy:', webviewId);
      return;
    }

    console.log('[fnClearWebviewCache] ⏳ Bắt đầu xóa cache cho webview:', webviewId);

    // Lấy partition ID để xóa thư mục storage
    const partitionId = wv.dataset.partitionId;
    console.log('[fnClearWebviewCache] Partition ID:', partitionId);

    // Bước 1: Xóa tất cả dữ liệu browsing của webview
    try {
      wv.clearData(
        { since: 0 }, // Xóa toàn bộ từ đầu
        {
          appcache: true,
          cache: true,
          cookies: true,
          fileSystems: true,
          indexedDB: true,
          localStorage: true,
          webSQL: true
        },
        () => {
          console.log('[fnClearWebviewCache] ✅ clearData complete cho:', webviewId);
        }
      );
    } catch (clearErr) {
      console.warn('[fnClearWebviewCache] ⚠️ clearData error:', clearErr.message);
    }

    // Bước 2: Lấy Process ID của webview (NW.js)
    let processId = null;
    try {
      if (wv.getProcessId) {
        processId = wv.getProcessId();
        console.log('[fnClearWebviewCache] Process ID của webview:', processId, 'ID:', webviewId);
      }
    } catch (err) {
      console.warn('[fnClearWebviewCache] Không lấy được Process ID:', err.message);
    }

    // Bước 3: Terminate/Kill process nếu được yêu cầu
    if (killProcess && processId) {
      // QUAN TRỌNG: Kiểm tra processId KHÔNG phải là main process
      const mainProcessId = typeof process !== 'undefined' ? process.pid : null;
      
      if (processId === mainProcessId) {
        console.error('[fnClearWebviewCache] ❌ CẢNH BÁO: processId trùng với main process! Bỏ qua kill để tránh crash app');
        return;
      }
      
      setTimeout(() => {
        try {
          if (wv.terminate) {
            wv.terminate();
            console.log('[fnClearWebviewCache] ✅ Đã terminate webview process:', processId);
          } else {
            // Fallback: kill process trực tiếp - CHỈ KHI CHẮC CHẮN không phải main process
            if (typeof process !== 'undefined' && typeof process.kill === 'function') {
              try {
                process.kill(processId, 'SIGTERM');
                console.log('[fnClearWebviewCache] ✅ Đã kill process:', processId);
              } catch (killErr) {
                console.warn('[fnClearWebviewCache] ⚠️ Không thể kill process:', killErr.message);
                // KHÔNG thử force kill để tránh crash app
              }
            } else {
              console.warn('[fnClearWebviewCache] ⚠️ process.kill không khả dụng');
            }
          }
        } catch (killErr) {
          console.warn('[fnClearWebviewCache] ⚠️ Lỗi khi terminate:', killErr.message);
        }
      }, 500);
    }

    // Bước 4: Xóa thư mục partition storage (QUAN TRỌNG để dọn triệt để)
    // ⚠️ CHỈ XÓA PARTITION CỦA WEBVIEW, KHÔNG ĐỘNG ĐẾN DỮ LIỆU NW.JS APP
    // Kiểm tra option AUTO_CLEANUP_ON_CLOSE (mặc định: true)
    const autoCleanupOnClose = window.AUTO_CLEANUP_ON_CLOSE !== false;
    
    if (partitionId && window.hasOwnProperty("process") && autoCleanupOnClose) {
      setTimeout(() => {
        try {
          const gui = require('nw.gui');
          const Path = require('path');
          const userDataPath = gui.App.dataPath;
          
          // ⚠️ KIỂM TRA AN TOÀN: partitionId PHẢI là chuỗi hợp lệ
          if (!partitionId || partitionId.length < 5) {
            console.error('[fnClearWebviewCache] ❌ CẢNH BÁO: partitionId không hợp lệ, bỏ qua xóa để tránh xóa nhầm:', partitionId);
            return;
          }
          
          // Đường dẫn tới thư mục partition CỦA WEBVIEW
          // VD: C:\Users\Nhien\AppData\Local\CSM\User Data\Default\Partitions\persist_xxxxx
          const partitionPath = Path.join(userDataPath, 'Default', 'Partitions', partitionId);
          
          // ⚠️ KIỂM TRA AN TOÀN: Đường dẫn PHẢI chứa partitionId để tránh xóa thư mục root
          if (!partitionPath.includes(partitionId)) {
            console.error('[fnClearWebviewCache] ❌ CẢNH BÁO: Đường dẫn không chứa partitionId, bỏ qua xóa:', partitionPath);
            return;
          }
          
          console.log('[fnClearWebviewCache] 🗑️ Xóa thư mục partition CỦA WEBVIEW:', partitionPath);
          deleteFolderRecursive(partitionPath);
          console.log('[fnClearWebviewCache] ✅ Đã xóa thư mục partition:', partitionId);
          
          // ⚠️ XÓA thư mục Storage/ext/{partitionId} CỦA WEBVIEW (KHÔNG XÓA TOÀN BỘ Storage/ext)
          // Chỉ xóa thư mục cụ thể của partition này
          const storageExtPath = Path.join(userDataPath, 'Default', 'Storage', 'ext', partitionId);
          if (storageExtPath && storageExtPath.includes(partitionId)) {
            console.log('[fnClearWebviewCache] 🗑️ Xóa thư mục Storage/ext CỦA PARTITION:', storageExtPath);
            deleteFolderRecursive(storageExtPath);
            console.log('[fnClearWebviewCache] ✅ Đã xóa Storage/ext/' + partitionId);
          }
        } catch (storageErr) {
          console.warn('[fnClearWebviewCache] ⚠️ Không thể xóa partition storage:', storageErr.message);
        }
      }, 1000); // Delay 1s để đảm bảo process đã terminate
    } else if (!autoCleanupOnClose) {
      console.log('[fnClearWebviewCache] ⏭️ Auto cleanup bị tắt (AUTO_CLEANUP_ON_CLOSE = false)');
    }

    console.log('[fnClearWebviewCache] ✅ Hoàn tất xóa toàn bộ cache cho:', webviewId);
  } catch (err) {
    console.error('[fnClearWebviewCache] ❌ Lỗi:', err.message);
  }
};
window.fnClearCache = function () {
  window.nw.App.clearCache();
  const gui = require('nw.gui');
  gui.App.clearCache();
  // deleteFolderRecursive(getAppDataPath()+'/Cache');
  // deleteFolderRecursive(getAppDataPath()+'/Storage');
  if (opsys === "win32") {
    deleteFolderRecursive(gui.App.dataPath + '/Cache');
    deleteFolderRecursive(gui.App.dataPath + '/Storage');
  }
  else {
    deleteFolderRecursive('/Users/*/Library/Caches//CSM//Default/Cache');
    deleteFolderRecursive('/Users/*/Library/Caches//CSM//Default/Storage');
  }
  window.chrome.browsingData.remove({
    since: 0
  }, {
    appcache: true,
    cache: true,
    cookies: true,
    downloads: true,
    fileSystems: true,
    history: true,
    indexedDB: true,
    localStorage: true,
    pluginData: true,
    passwords: true,
    serverBoundCertificates: true,
    serviceWorkers: true,
    webSQL: true
  });
}

// Auto cleanup cache cho tất cả webview mỗi 30 giây - DỌN MEMORY LIÊN TỤC
if (!window.__cacheCleanupInterval) {
  window.__cacheCleanupInterval = setInterval(() => {
    const allWebviews = document.querySelectorAll('webview[id^="U_"]');
    
    if (allWebviews.length > 0) {
      console.log('[AUTO-CLEANUP] 🧹 Dọn cache cho ' + allWebviews.length + ' webview (chỉ cache, giữ tabs chạy)...');
      
      allWebviews.forEach(wv => {
        try {
          // Chỉ xóa browser cache, không xóa cookies/localStorage/indexedDB
          // Để các tabs tiếp tục chạy bình thường
          wv.clearData(
            { since: Date.now() - 30000 }, // Chỉ xóa dữ liệu 30s gần đây
            {
              appcache: true,   // Clear appcache
              cache: true,      // Clear browser cache (tự động download lại)
              cookies: false,   // GIỮ - cần cho session
              fileSystems: true,// Clear filesystem cache (tự động tạo lại)
              indexedDB: false, // GIỮ - cần cho dữ liệu
              localStorage: false, // GIỮ - cần cho dữ liệu
              webSQL: false     // GIỮ - cần cho dữ liệu
            },
            () => {
              // Silent - quá nhiều logs
              // console.log('[AUTO-CLEANUP] ✅ Cleared cache for:', wv.id);
            }
          );
        } catch (e) {
          console.warn('[AUTO-CLEANUP] ⚠️ Clear error:', wv.id, e.message);
        }
      });
    }
  }, 30000); // Mỗi 30 giây (tần suất cao hơn để dọn liên tục)
  console.log('[AUTO-CLEANUP] ✅ Auto cache cleanup started (every 30s) - giữ tabs chạy liên tục');
}
const deleteFolderRecursive = function (directoryPath) {
  if (window.hasOwnProperty("process")) {
    const fs = require('fs');
    const Path = require('path');
    try {
      if (fs.existsSync(directoryPath)) {
        fs.readdirSync(directoryPath).forEach((file, index) => {
          try {
            const curPath = Path.join(directoryPath, file);
            if (fs.lstatSync(curPath).isDirectory()) {
              // recurse
              deleteFolderRecursive(curPath);
            } else {
              // delete file
              fs.unlinkSync(curPath);
            }
          } catch (e) { }
        });
        fs.rmdirSync(directoryPath);
      }
    } catch (e) { }
  }
};

// QUAN TRỌNG: Dọn dẹp tất cả partition cũ khi khởi động app
// Điều này giải quyết vấn đề tích lũy storage từ các webview đã đóng
window.cleanupAllPartitions = function() {
  if (!window.hasOwnProperty("process")) return;
  
  try {
    const gui = require('nw.gui');
    const Path = require('path');
    const fs = require('fs');
    const userDataPath = gui.App.dataPath;
    
    // 1. Xóa tất cả partitions
    const partitionsPath = Path.join(userDataPath, 'Default', 'Partitions');
    if (fs.existsSync(partitionsPath)) {
      console.log('[CLEANUP-PARTITIONS] 🧹 Xóa tất cả partitions cũ:', partitionsPath);
      deleteFolderRecursive(partitionsPath);
      console.log('[CLEANUP-PARTITIONS] ✅ Đã xóa partitions');
    }
    
    // 2. Xóa Storage/ext (chứa extension data của webview)
    const storageExtPath = Path.join(userDataPath, 'Default', 'Storage', 'ext');
    if (fs.existsSync(storageExtPath)) {
      console.log('[CLEANUP-PARTITIONS] 🧹 Xóa Storage/ext:', storageExtPath);
      deleteFolderRecursive(storageExtPath);
      console.log('[CLEANUP-PARTITIONS] ✅ Đã xóa Storage/ext');
    }
    
    // 3. Xóa các cache folder khác
    const cachePaths = [
      Path.join(userDataPath, 'Cache'),
      Path.join(userDataPath, 'Default', 'Cache'),
      Path.join(userDataPath, 'Default', 'Code Cache'),
      Path.join(userDataPath, 'Default', 'GPUCache'),
    ];
    
    cachePaths.forEach(cachePath => {
      if (fs.existsSync(cachePath)) {
        console.log('[CLEANUP-PARTITIONS] 🧹 Xóa cache:', cachePath);
        deleteFolderRecursive(cachePath);
      }
    });
    
    console.log('[CLEANUP-PARTITIONS] ✅ Hoàn tất dọn dẹp toàn bộ storage cũ');
  } catch (err) {
    console.error('[CLEANUP-PARTITIONS] ❌ Lỗi:', err.message);
  }
};

// Tự động chạy cleanup khi app khởi động
if (!window.__initialCleanupDone) {
  window.__initialCleanupDone = true;
  
  // Kiểm tra option AUTO_CLEANUP_ON_STARTUP (mặc định: true)
  const autoCleanup = window.AUTO_CLEANUP_ON_STARTUP !== false;
  
  if (autoCleanup) {
    setTimeout(() => {
      console.log('[STARTUP] 🚀 Bắt đầu cleanup partitions cũ...');
      window.cleanupAllPartitions();
    }, 2000); // Delay 2s để app khởi động xong
  } else {
    console.log('[STARTUP] ⏭️ Auto cleanup bị tắt (AUTO_CLEANUP_ON_STARTUP = false)');
  }
}

// ============================================================
// HƯỚNG DẪN QUẢN LÝ WEBVIEW STORAGE
// ============================================================
// Vấn đề: Webview tạo nhiều file trong thư mục:
// - Windows: C:\Users\[User]\AppData\Local\CSM\User Data\Default\Storage\ext\...
// - Các folder này không tự động xóa khi đóng webview
//
// Giải pháp đã áp dụng:
// 1. Tự động cleanup khi khởi động app (cleanupAllPartitions)
// 2. Xóa partition storage khi đóng webview (fnClearWebviewCache)
// 3. Sử dụng partition ID không persist để dễ dọn dẹp
//
// Options để kiểm soát:
// - window.AUTO_CLEANUP_ON_STARTUP = true/false (mặc định: true)
// - window.AUTO_CLEANUP_ON_CLOSE = true/false (mặc định: true)
// - window.MAX_PROXY_RUNTIME = 300000 (5 phút, tự động đóng webview)
//
// Để tắt auto cleanup, thêm vào code trước khi load app:
// window.AUTO_CLEANUP_ON_STARTUP = false;
// window.AUTO_CLEANUP_ON_CLOSE = false;
//
// Để chạy cleanup thủ công:
// window.cleanupAllPartitions(); // Xóa tất cả partitions cũ
// ============================================================

// Log thông tin cấu hình khi load
console.log('╔════════════════════════════════════════════════════════════╗');
console.log('║        WEBVIEW STORAGE CLEANUP - CONFIGURATION             ║');
console.log('╠════════════════════════════════════════════════════════════╣');
console.log('║ AUTO_CLEANUP_ON_STARTUP:', (window.AUTO_CLEANUP_ON_STARTUP !== false ? '✅ Enabled ' : '❌ Disabled'), '            ║');
console.log('║ AUTO_CLEANUP_ON_CLOSE:  ', (window.AUTO_CLEANUP_ON_CLOSE !== false ? '✅ Enabled ' : '❌ Disabled'), '            ║');
console.log('║ MAX_PROXY_RUNTIME:      ', ((window.MAX_PROXY_RUNTIME || 300000)/60000) + ' phút', '                ║');
console.log('╠════════════════════════════════════════════════════════════╣');
console.log('║ Lệnh thủ công:                                             ║');
console.log('║ - window.cleanupAllPartitions() : Xóa tất cả partition     ║');
console.log('║ - window.fnClearWebviewCache(id, true) : Xóa cache 1 tab   ║');
console.log('╚════════════════════════════════════════════════════════════╝');


// Global periodic cleanup - dọn memory định kỳ mà không làm gián đoạn tabs
if (!window.__periodicCleanupInterval) {
  window.__periodicCleanupInterval = setInterval(() => {
    try {
      console.log('[PERIODIC-CLEANUP] 🧹 Performing periodic memory cleanup...');
      
      // 1. Clear arrays nếu quá lớn (giữ size hợp lý)
      if (window.openTab && window.openTab.length > 100) {
        // Giữ lại 50 items gần nhất
        window.openTab = window.openTab.slice(-50);
        console.log('[PERIODIC-CLEANUP] ✅ Trimmed openTab array');
      }
      
      // 2. Clear garbage từ window object
      if (window.__allTimers && Array.isArray(window.__allTimers)) {
        window.__allTimers = [];
        console.log('[PERIODIC-CLEANUP] ✅ Cleared timer tracking array');
      }
      
      // 3. Check closed webviews và remove references
      const activeWebviews = document.querySelectorAll('webview[id^="U_"]');
      const activeIds = new Set(Array.from(activeWebviews).map(w => 'customTabListeners_' + w.id.replace('U_', '')));
      
      // Cleanup listener references từ các tabs đã đóng
      Object.keys(window).forEach(key => {
        if (key.startsWith('customTabListeners_') && !activeIds.has(key)) {
          delete window[key];
        }
      });
      console.log('[PERIODIC-CLEANUP] ✅ Cleaned up references for closed tabs');
      
      // 4. Force garbage collection nếu khả dụng (Chrome/Node.js)
      if (global && global.gc) {
        global.gc();
        console.log('[PERIODIC-CLEANUP] ✅ Forced garbage collection');
      }
      
      // 5. Log hiện trạng memory (nếu khả dụng)
      if (typeof process !== 'undefined' && process.memoryUsage) {
        const memUsage = process.memoryUsage();
        const heapMB = (memUsage.heapUsed / 1024 / 1024).toFixed(2);
        const rssMB = (memUsage.rss / 1024 / 1024).toFixed(2);
        console.log(`[PERIODIC-CLEANUP] 📊 Memory: Heap ${heapMB}MB / RSS ${rssMB}MB`);
      }
      
      console.log('[PERIODIC-CLEANUP] ✅ Periodic cleanup completed');
    } catch (e) {
      console.error('[PERIODIC-CLEANUP] ❌ Error:', e.message);
    }
  }, 60000); // Mỗi 60 giây (1 phút)
  
  console.log('[PERIODIC-CLEANUP] ✅ Periodic cleanup started (every 60s)');
}
//Thread
var blob = new Blob([`self.addEventListener('message', function(e) { 
  self.postMessage(e.data); // Send data back to main script 
}, false);`], { type: 'text/javascript' });
var blobURL = (window.URL ? URL : webkitURL).createObjectURL(blob, {
  type: 'application/javascript; charset=utf-8'
});
var worker = new Worker(blobURL);
worker.addEventListener('message', function (e) {
  try {
    // Log the workers message.
    var data = e.data;
    if (data.type === "open")
      fnCreateTab(data.id_tab, data.url_open, data.script_code, data.multi_tab_name, data.auto_close);
    else if (data.type === "ip" && document.querySelector('#ipNew'))
      document.querySelector('#ipNew').textContent = data.ip;
  } catch { }
}, false);

// Helper: thời gian ở lại trang (phút) đọc từ Select antd; nếu không lấy được sẽ dùng mặc định 5
window.sophut_lamtuoi_value = window.sophut_lamtuoi_value || '5';
function getStayMinutes() {
  const raw = (window.sophut_lamtuoi_value ?? '').toString().trim();
  console.log('[getStayMinutes] window.sophut_lamtuoi_value:', window.sophut_lamtuoi_value, 'raw:', raw);
  const n = Number(raw);
  if (Number.isFinite(n) && n > 0) return n;
  return 5;
}

// ============================================
// KHÔNG DÙNG hàm importExcel cũ nữa
// Import Excel giờ xử lý qua CsmDynamicGrid (beforeImport + afterImport triggers)
// ============================================

// ============================================
// PROXY LIFETIME MANAGER - Quản lý thời gian sống của proxy
// ============================================
// Kiểm tra có cần đổi proxy dựa vào thời gian sophut_lamtuoi không
window.shouldChangeProxyNow = function() {
  if (!window.__isProxyActive || window.__batchStartTime === 0) {
    return false;
  }
  
  const sophutLamtuoi = getStayMinutes(); // Lấy số phút từ input
  const proxyRuntime = Date.now() - window.__batchStartTime;
  const sophutLamtuoiMs = sophutLamtuoi * 60000; // Chuyển sang milliseconds
  
  // Kiểm tra nếu đã chạy đủ thời gian sophut_lamtuoi
  if (proxyRuntime >= sophutLamtuoiMs) {
    console.log(`⏰ Đã chạy ${Math.ceil(proxyRuntime/60000)} phút >= ${sophutLamtuoi} phút (sophut_lamtuoi), cần đổi proxy`);
    return true;
  }
  
  return false;
};

window.forceResetProxyAfter60Minutes = function() {
  const proxyAge = Date.now() - window.__proxyActivatedTime;
  const remainingTime = window.PROXY_MAX_LIFETIME - proxyAge;
  
  if (remainingTime <= 0) {
    console.log('⏰ Proxy đã chạy 60 phút, bắt đầu force reset...');
    
    // KHÔNG đóng tabs ở đây, để fnResetIP xử lý
    // fnResetIP sẽ tự động đóng tất cả tabs ở đầu hàm
    
    // 1. Tắt proxy
    proxy_deactivate().then(function(success) {
      if (success) {
        console.log('✅ Đã tắt proxy');
        window.__isProxyActive = false;
      }
      
      // 2. Reset các biến tracking và credentials
      window.__proxyActivatedTime = 0;
      window.__getTMProxyRequestPool = null; // Clear cache để force lấy mới
      window.__proxyUsername = '';
      window.__proxyPassword = '';
      console.log('🔐 Đã clear proxy credentials');
      
      // 3. Chờ 2 giây rồi lấy proxy mới và tiếp tục chạy
      setTimeout(function() {
        console.log('🔄 Bắt đầu lấy proxy mới sau khi reset 60 phút...');
        const queueStats = window.LinkQueueManager.getStats();
        console.log(`📊 Queue stats: ${queueStats.processed}/${queueStats.total} đã xử lý, ${queueStats.pending} đang chờ`);
        fnResetIP(); // fnResetIP sẽ tự động đóng tabs ở đầu hàm
      }, 2000);
    }).catch(function(err) {
      console.error('❌ Lỗi khi tắt proxy:', err);
      // Vẫn cố gắng lấy proxy mới
      window.__isProxyActive = false;
      window.__proxyActivatedTime = 0;
      window.__getTMProxyRequestPool = null;
      window.__proxyUsername = '';
      window.__proxyPassword = '';
      setTimeout(fnResetIP, 2000); // fnResetIP sẽ tự động đóng tabs
    });
  } else {
    console.log('⏰ Proxy còn ' + Math.ceil(remainingTime/60000) + ' phút trước khi hết hạn');
  }
};

window.fnResetIP = function (force = false) {
  console.log('🔄 [fnResetIP] Bắt đầu reset IP...' + (force ? ' (FORCE mode - bỏ qua throttle)' : ''));
  
  if (!isRunning) {
    console.log('[fnResetIP] App đã dừng, không tiếp tục reset IP');
    return;
  }
  
  // QUAN TRỌNG: CHỈ ĐÓNG TABS KHI THỰC SỰ CẦN ĐỔI PROXY
  // KHÔNG đóng tabs khi chỉ đang chờ proxy active lần đầu hoặc throttle
  let shouldCloseTabs = false;
  let closeReason = '';
  
  // TRƯỜNG HỢP 1: Proxy bị lỗi, cần reset khẩn cấp
  if (window.__proxyNeedsReset) {
    shouldCloseTabs = true;
    closeReason = 'Proxy lỗi/authentication error';
    console.log('🚨 Proxy cần reset do authentication error hoặc hết hạn');
    
    // Tắt proxy hiện tại
    if (window.__isProxyActive) {
      proxy_deactivate().then(() => {
        console.log('✅ Đã tắt proxy lỗi');
        window.__isProxyActive = false;
        window.__proxyUsername = '';
        window.__proxyPassword = '';
      }).catch(err => {
        console.error('❌ Lỗi khi tắt proxy:', err);
        window.__isProxyActive = false;
        window.__proxyUsername = '';
        window.__proxyPassword = '';
      });
    }
    
    // Reset tracking
    window.__proxyNeedsReset = false;
    window.__proxyActivatedTime = 0;
    window.__batchStartTime = 0;
    window.__getTMProxyRequestPool = null;
    window.__proxyFailureCount++;
    console.log(`⚠️ Số lần proxy thất bại: ${window.__proxyFailureCount}`);
  }
  
  // TRƯỜNG HỢP 2: Đã đến thời điểm đổi proxy theo sophut_lamtuoi
  else if (window.shouldChangeProxyNow()) {
    shouldCloseTabs = true;
    closeReason = 'Đã đến thời điểm đổi proxy (sophut_lamtuoi)';
    console.log('⏰ Đã đến thời điểm đổi proxy theo sophut_lamtuoi');
    window.__batchStartTime = 0;
  }
  
  // TRƯỜNG HỢP 3: Proxy đã chạy >= 60 phút (hard limit)
  else if (window.__proxyActivatedTime > 0) {
    const proxyAge = Date.now() - window.__proxyActivatedTime;
    if (proxyAge >= window.PROXY_MAX_LIFETIME) {
      shouldCloseTabs = true;
      closeReason = 'Proxy đã chạy 60 phút (hard limit)';
      console.log('⏰ Proxy đã chạy 60 phút, force reset...');
      
      proxy_deactivate().then(() => {
        console.log('✅ Đã tắt proxy hết hạn');
        window.__isProxyActive = false;
        window.__proxyUsername = '';
        window.__proxyPassword = '';
      }).catch(err => {
        console.error('❌ Lỗi khi tắt proxy:', err);
        window.__isProxyActive = false;
        window.__proxyUsername = '';
        window.__proxyPassword = '';
      });
      
      window.__proxyActivatedTime = 0;
      window.__batchStartTime = 0;
    }
  }
  
// ============================================================
// HELPER: Đóng tất cả tabs và xóa sạch dữ liệu
// ============================================================
window.closeAllTabsAndCleanup = function(reason = 'Manual cleanup') {
  console.log(`[closeAllTabsAndCleanup] 🗑️ Bắt đầu đóng tất cả tabs - Lý do: ${reason}`);
  
  const webviewsToClose = [];
  const allWebviews = document.querySelectorAll('[id^="U_"]');
  
  allWebviews.forEach(function (el) {
    const id_tab = el.getAttribute("id");
    if (id_tab && id_tab.indexOf("tabSetting") === -1) {
      webviewsToClose.push(id_tab.replace('U_', ''));
    }
  });
  
  if (webviewsToClose.length === 0) {
    console.log('[closeAllTabsAndCleanup] ℹ️ Không có tab nào để đóng');
    return;
  }
  
  console.log(`[closeAllTabsAndCleanup] 🗑️ Đóng ${webviewsToClose.length} tabs: ${webviewsToClose.join(', ')}`);
  
  // Đóng từng tab một cách tuần tự
  let closedCount = 0;
  webviewsToClose.forEach((tab_id, index) => {
    setTimeout(() => {
      try {
        fnRemoveTab(tab_id);
        closedCount++;
        console.log(`[closeAllTabsAndCleanup] ✅ [${closedCount}/${webviewsToClose.length}] Đã đóng: ${tab_id}`);
        
        // Sau khi đóng tab cuối, chạy cleanup toàn diện
        if (closedCount === webviewsToClose.length) {
          setTimeout(() => {
            console.log('[closeAllTabsAndCleanup] 🧹 Chạy cleanup toàn diện sau khi đóng hết tabs...');
            
            // Clear global cache
            if (typeof fnClearCache === 'function') {
              fnClearCache();
            }
            
            // Cleanup partitions nếu cần
            if (typeof cleanupAllPartitions === 'function') {
              cleanupAllPartitions();
            }
            
            // Force garbage collection nếu có
            try {
              if (window.gc) {
                window.gc();
                console.log('[closeAllTabsAndCleanup] 🗑️ Forced garbage collection');
              }
            } catch(gcErr) {}
            
            console.log('[closeAllTabsAndCleanup] ✅ Hoàn tất cleanup toàn diện');
          }, 2000);
        }
      } catch(err) {
        console.error(`[closeAllTabsAndCleanup] ❌ Lỗi khi đóng tab ${tab_id}:`, err);
      }
    }, index * 300); // Delay 300ms giữa mỗi tab để tránh quá tải
  });
  
  return webviewsToClose.length;
};

// ============================================================
// CLEANUP KHI ĐÓNG APP/WINDOW
// ⚠️ ĐẶT Ở ĐÂY để đảm bảo closeAllTabsAndCleanup, fnRemoveTab đã được define
// ============================================================
if (!window.__appCleanupRegistered) {
  window.__appCleanupRegistered = true;
  
  // Handler cleanup toàn diện khi đóng app
  const appCleanupHandler = function(e) {
    console.log('[APP-CLEANUP] 🧹 Bắt đầu cleanup trước khi đóng app...');
    
    try {
      // 1. Sử dụng closeAllTabsAndCleanup để đóng tabs một cách an toàn
      if (typeof closeAllTabsAndCleanup === 'function') {
        console.log('[APP-CLEANUP] 🗑️ Đóng tất cả tabs qua closeAllTabsAndCleanup...');
        closeAllTabsAndCleanup('App đang đóng');
      } else {
        // Fallback: đóng tabs thủ công nếu helper chưa sẵn sàng
        console.warn('[APP-CLEANUP] ⚠️ closeAllTabsAndCleanup chưa có, đóng tabs thủ công...');
        const allWebviews = document.querySelectorAll('[id^="U_"]');
        allWebviews.forEach(el => {
          const id_tab = el.getAttribute('id');
          if (id_tab && id_tab.indexOf('tabSetting') === -1) {
            const tab_id = id_tab.replace('U_', '');
            try {
              if (typeof fnRemoveTab === 'function') {
                fnRemoveTab(tab_id);
              } else {
                const webview = document.querySelector('#U_' + tab_id);
                if (webview) {
                  if (typeof webview.terminate === 'function') {
                    webview.terminate();
                  }
                  webview.remove();
                }
              }
            } catch(err) {
              console.warn(`[APP-CLEANUP] ⚠️ Lỗi đóng tab ${tab_id}:`, err);
            }
          }
        });
      }
      
      // 2. Clear intervals
      if (window.__cacheCleanupInterval) {
        clearInterval(window.__cacheCleanupInterval);
      }
      if (window.__periodicCleanupInterval) {
        clearInterval(window.__periodicCleanupInterval);
      }
      if (window.tmRun) {
        clearInterval(window.tmRun);
      }
      
      console.log('[APP-CLEANUP] ✅ Cleanup hoàn tất');
      
    } catch(err) {
      console.error('[APP-CLEANUP] ❌ Lỗi trong quá trình cleanup:', err);
    }
  };
  
  // Register cleanup handlers
  window.addEventListener('beforeunload', appCleanupHandler);
  
  // NW.js specific: cleanup khi đóng window
  if (window.nw && window.nw.Window) {
    try {
      const win = nw.Window.get();
      win.on('close', function() {
        console.log('[NW-CLEANUP] 🧹 Window đang đóng, chạy cleanup...');
        appCleanupHandler();
        
        // Delay một chút để cleanup hoàn tất
        setTimeout(() => {
          this.close(true); // Force close
        }, 500);
      });
      
      console.log('[APP-CLEANUP] ✅ Đã đăng ký cleanup handlers cho NW.js');
    } catch(nwErr) {
      console.warn('[APP-CLEANUP] ⚠️ Không thể đăng ký NW.js cleanup:', nwErr);
    }
  }
  
  console.log('[APP-CLEANUP] ✅ Đã đăng ký app cleanup handlers');
}

// ============================================
// ĐÓNG TABS CHỈ KHI CẦN THIẾT
// ============================================
  if (shouldCloseTabs) {
    // Sử dụng helper function để đảm bảo cleanup đầy đủ
    closeAllTabsAndCleanup(closeReason);
  } else {
    console.log('✓ [fnResetIP] Giữ nguyên tabs đang chạy (không cần đổi proxy)');
  }
  
  // ============================================
  // THROTTLE CHECK - KHÔNG LẤY PROXY MỚI NẾU:
  // ============================================
  // QUAN TRỌNG: Sử dụng thời gian từ API response thay vì tính cứng
  // Bỏ qua check thời gian chờ nếu:
  // 1. Proxy cần reset khẩn cấp (__proxyNeedsReset = true)
  // 2. Mới start app lần đầu (__lastResetIP chưa set)
  // 3. Proxy chưa được kích hoạt bao giờ (__isProxyActive = false)
  // 4. 🆕 FORCE mode (gọi từ runParallelProcessing sau khi batch tắt)
  if (!force && !window.__proxyNeedsReset && window.__lastResetIP && window.__isProxyActive) {
    // Kiểm tra throttle từ API (nếu API yêu cầu chờ)
    if (window.__getTMProxyLastTime && Date.now() < window.__getTMProxyLastTime) {
      const remainingTime = Math.ceil((window.__getTMProxyLastTime - Date.now()) / 1000);
      console.log('⏳ API yêu cầu chờ trước khi lấy proxy mới... (còn ' + remainingTime + ' giây)');
      return;
    }
    
    // Kiểm tra throttle dựa trên sophut_lamtuoi (chỉ khi đã có proxy active)
    const stay = getStayMinutes();
    const minWaitTime = stay * 60000 + 120000; // thêm 2 phút buffer
    if (Date.now() - window.__lastResetIP < minWaitTime) {
      console.log('⏳ Đang chờ đủ thời gian sophut_lamtuoi trước khi đổi proxy... (còn ' + Math.ceil((minWaitTime - (Date.now() - window.__lastResetIP)) / 1000) + ' giây)');
      return;
    }
  } else if (force) {
    console.log('✅ [fnResetIP] FORCE mode - bỏ qua throttle check, đổi proxy ngay!');
  }
  
  window.__lastResetIP = Date.now();

  var api_token = document.querySelector('#api_token').value;
  var api_token_wwproxy = document.querySelector('#api_token_wwproxy').value;
  var ip = document.querySelector('#dns').value;
  if ((api_token === "" && api_token_wwproxy === "") && ip !== "") {
    var strScript = `
      if(location.href.indexOf('192.168.100.1')!==-1)
      {
        try{
          fetch("http://192.168.100.1/api/json",
          {
              method: "POST",
              body: JSON.stringify({fid:"login",username:"",password:"admin"})
          })
          .then(function(res){ return res.json(); })
          // Lấy IP thật của máy: thử lần lượt ipinfo → ipify → ping.eu (HTML). Luôn gọi fn với string hoặc false.
          window.checkIP = function(fn){
            const tryIpInfo = () => fetch('https://ipinfo.io/json', { method: 'GET', headers: { 'Accept': 'application/json' } })
              .then(r => r.ok ? r.json() : Promise.reject())
              .then(res => res?.ip || Promise.reject());

            const tryIpify = () => fetch('https://api.ipify.org/?format=json', { method: 'GET', headers: { 'Accept': 'application/json' } })
              .then(r => r.ok ? r.json() : Promise.reject())
              .then(res => res?.ip || Promise.reject());

            const tryPingEu = () => fetch('https://ping.eu/', { method: 'GET' })
              .then(r => r.text())
              .then(html => {
                const parser = new DOMParser();
                const doc = parser.parseFromString(html, 'text/html');
                const ip = doc.querySelector('.ip-td>b')?.innerText;
                if (ip) return ip;
                return Promise.reject();
              });

            tryIpInfo()
              .catch(tryIpify)
              .catch(tryPingEu)
              .then(ip => fn(ip))
              .catch(() => fn(false));
          }
      else if(location.href.indexOf('192.168.1.1')!==-1)
      {
        function login(uname,pass) {
          var hashPass = CryptoJS.MD5(pass)+"";
          var request = $.ajax({
            url: root_path+"/login.cgi",
            type: "POST",
            data: { "uname" : uname ,"passwd" : hashPass},
            dataType: "json"
          });
          request.done(function( responseData,textStatus, jqXHR ) {      

            if(responseData.login_fail){
              dialogErrorBox(changeLanguageString(responseData.login_fail));
            } else {            
              /* Set the cookie Note API response will have qSessId as sessionId*/    
              var expires ="";
              if(parseInt(responseData.remain)> 0) 
              {
                var date = new Date();
                date.setTime(date.getTime() + (24 * 60 * responseData.remain * 1000));
                var expires = ";expires=" + date.toGMTString();             	
              }      
              document.cookie ="DWRLOGGEDID="+getCookie("qSessId")+expires;
              document.cookie ="DWRLOGGEDUSER="+uname+expires;
              document.cookie ="DWRLOGGEDTIMEOUT="+responseData.remain+expires;
              document.getElementById("login").style.visibility="hidden";
              document.getElementById("login_navi").style.visibility="hidden";
              Session_inactivity_timeout = responseData.remain/60;
              if(idleInterval)
                ;
              else
                idleInterval = self.setInterval("timerIncrement()", 60000); // 1 minute
              login_setLanguage();
              index_getWhoAmI();
              doSystemNameGet();
              index_getLanguage();		
              index_GetSupportNetwork();
              login_syncWithHost();
              index_getWanStatus(false);
              index_getWiFiClients();
               var url_path = location.search;
              var curr_page = "";	    
              if (url_path != "" ) {
              arg=url_path.split("&");
              if (arg[0].substring(1, 8) != "WWW_SID") {
                  curr_page = arg[0].substring(1);
              }
              }
              if(curr_page == "")
              {
                createSubMenu("subMenu","home.asp","pageTitle");
              }
              else
                loadpage(curr_page); 
                    loadpage('system_reboot.asp');
                    setTimeout(function(){
                      doIFrameSet('ok');
                      setTimeout(function(){location.href="https://ipinfo.io/json";},30000);
                    },500);
              return;

            }
          });
          request.fail(function( jqXHR, textStatus, errorThrown) {
            /* Login is failed */
            if(jqXHR.status == 401) {
              var responseData = jQuery.parseJSON(jqXHR.responseText);
              alert(changeLanguageString(responseData.login_fail));
            }		 
          });
          request.always(function(responseData,textStatus, jqXHR ) {

          });
        }
        // Disabled: login('admin','password'); // Do not login to router proxy
      }
      else if(location.href==="https://ipinfo.io/json")
      {
        try{
          setTimeout(function(){
            console.log(JSON.stringify({type:"ip",data:JSON.parse(document.body.innerText),tabid:tabid}));
          },5000);
        }
        catch(errIP){
          setTimeout(function(){
            location.reload();
          },15000);
        }
      }
      else
      {
          setTimeout(function(){
            location.href="https://ipinfo.io/json";
          },15000);
      }
    `;
    fnCreateTab("reset3G", "http://" + ip, strScript, false, getStayMinutes() * 120000);
  }
  else if (api_token !== "" || api_token_wwproxy !== "") {
    if (document.querySelector('#sophut_lamtuoi')) {
      getTMProxy(api_token, api_token_wwproxy, function (msg) {
        try {
          console.log('[fnResetIP getTMProxy callback] 🔔 Callback được gọi, msg:', JSON.stringify(msg).substring(0, 200) + '...');
          
          // ✅ QUAN TRỌNG: Extract timeout từ API response
          // API trả về `next_request` (unix timestamp tính bằng ms hoặc giây)
          // hoặc `timeout` (số giây chờ)
          let apiNextRequestTime = null;
          if (msg.data && msg.data['next_request']) {
            // next_request là unix timestamp (có thể tính bằng ms hoặc giây)
            apiNextRequestTime = msg.data['next_request'];
            // Nếu là giây (< 10 tỷ), convert sang ms
            if (apiNextRequestTime < 10000000000) {
              apiNextRequestTime = apiNextRequestTime * 1000;
            }
            // Lưu vào window để waitForAllTabsClose() sử dụng
            window.__getTMProxyNextRequest = apiNextRequestTime;
            console.log('✅ [getTMProxy] Lưu next_request từ API: ' + new Date(apiNextRequestTime).toLocaleString());
          } else if (msg.data && msg.data['timeout']) {
            // timeout là số giây chờ
            const waitSeconds = parseInt(msg.data['timeout']) || 60;
            apiNextRequestTime = Date.now() + waitSeconds * 1000;
            window.__getTMProxyNextRequest = apiNextRequestTime;
            console.log('✅ [getTMProxy] Lưu timeout từ API: ' + waitSeconds + 's (' + new Date(apiNextRequestTime).toLocaleString() + ')');
          }
          
          // Xử lý lỗi rate limit từ API wwproxy
          if ((1 * msg['code'] === 5 || 1 * msg['errorCode'] === 1) && msg['message'] !== "") {
            canhbao("Chờ đổi IP mới " + msg['message']);
            // Parse thời gian chờ từ message, default 60 giây
            let waitTime = 60000; // 60 seconds default
            const match = msg['message'].match(/(\d+)s/);
            if (match && match[1]) {
              waitTime = (parseInt(match[1]) + 5) * 1000; // Thêm 5 giây buffer
            }
            console.log("⏰ API chặn request, chờ " + waitTime + "ms trước khi retry");
            // QUAN TRỌNG: Set flag để BLOCK mọi xử lý links
            window.__waitingForAPIRetry = true;
            // Lưu thời điểm có thể gọi API tiếp theo
            window.__getTMProxyLastTime = Date.now() + waitTime;
            // ✅ Cũng lưu vào __getTMProxyNextRequest để waitForAllTabsClose() biết
            window.__getTMProxyNextRequest = Date.now() + waitTime;
            // Retry sau khi hết thời gian chờ
            setTimeout(() => {
              console.log("✅ Hết thời gian chờ API rate limit, gọi lại fnResetIP");
              window.__waitingForAPIRetry = false; // Mở BLOCK
              fnResetIP();
            }, waitTime);
            return;
          }
          if ((msg.data && (msg.data['proxy'] || msg.data['https'])) && (msg.success || msg.code === 0 || msg.errorCode === 0)) {
            // Webview đã được đóng hết ở đầu hàm fnResetIP
            console.log('✅ Tất cả tabs đã được đóng (xử lý ở đầu hàm)');
            // const gui = require('nw.gui'); 
            // gui.App.clearCache();
            // fnClearCache();
            var password = msg.data['password'], username = msg.data['username'];
            var proxy_addess = encodeURIComponent(username) + ':' + encodeURIComponent(password) + '@' + msg.data['https'];
            
            // QUAN TRỌNG: Lưu proxy credentials vào window để listener 'login' sử dụng cho proxy auth
            window.__proxyUsername = username;
            window.__proxyPassword = password;
            console.log(`💾 [Proxy Credentials] Lưu credentials: ${username}@***`);
            
            // var proxy_server='http://'+proxy_addess;
            // console.log(msg);
            if (msg.data['proxy'])
              proxy_addess = msg.data['proxy'];
            if (msg.data['https'])
              proxy_addess = msg.data['https'];
            if (opsys === "darwin")
              proxy_addess = msg.data;
            var public_ip = msg.data['public_ip'] ? msg.data['public_ip'] : "";
            if (msg.data['ipAddress'])
              public_ip = msg.data['ipAddress'];
            // console.log(proxy_addess,public_ip);
            
            // ✅ QUAN TRỌNG: Kiểm tra trạng thái proxy trước khi bật
            // Nếu proxy đã bật với cùng địa chỉ, không cần bật lại
            console.log('🔍 Kiểm tra trạng thái proxy hiện tại...');
            proxy_status_check().then(function(isProxyOn) {
              console.log('📊 Proxy hiện tại: ' + (isProxyOn ? 'BẬT' : 'TẮT'));
              
              // Đánh dấu đang xác thực proxy
              window.__proxyAuthenticating = true;
              console.log('🔐 Bắt đầu xác thực/bật proxy với username:', username);
              
              // Tạo object proxy info để pass cho proxy_change_address
              const proxyInfo = {
                https: msg.data['https'],
                proxy: msg.data['proxy'],
                username: username,
                password: password,
                public_ip: public_ip
              };
              
              console.log('📋 [getTMProxy] proxyInfo object được tạo:', JSON.stringify({
                https: proxyInfo.https,
                proxy: proxyInfo.proxy,
                username: proxyInfo.username,
                password: '***',
                public_ip: proxyInfo.public_ip
              }));
              
              // Luôn gọi proxy_change_address để đảm bảo proxy được bật với địa chỉ mới
              proxy_change_address(proxyInfo).then(function (proxyActive) {
                // Kết thúc quá trình xác thực
                window.__proxyAuthenticating = false;
                // console.log(public_ip,proxyActive);
                if (proxyActive) {
                  console.log("✅ Proxy đã được kích hoạt thành công!");
                  
                  // QUAN TRỌNG: Đánh dấu proxy đã được kích hoạt và bắt đầu đếm thời gian
                  window.__isProxyActive = true;
                  window.__proxyActivatedTime = Date.now();
                  window.__batchStartTime = Date.now(); // Bắt đầu tính thời gian batch
                  
                  // Reset các biến lỗi khi proxy thành công
                  window.__proxyNeedsReset = false;
                  window.__proxyFailureCount = 0; // Reset failure count khi proxy hoạt động thành công
                  
                  console.log('✅ Đã reset proxy failure count về 0');
                  
                  // Clear timer cũ nếu có
                  if (window.__proxyLifetimeTimer) {
                    clearTimeout(window.__proxyLifetimeTimer);
                  }
                  
                  // Set timer để tự động reset sau 60 phút (hard limit)
                  window.__proxyLifetimeTimer = setTimeout(function() {
                    console.log('⏰ Đã hết 60 phút, tự động force reset proxy...');
                    window.forceResetProxyAfter60Minutes();
                  }, window.PROXY_MAX_LIFETIME);
                  
                  const sophutLamtuoi = getStayMinutes();
                  console.log(`⏰ Proxy đã active. Sẽ đổi proxy sau ${sophutLamtuoi} phút (sophut_lamtuoi) hoặc tối đa 60 phút`);
                  
                  // QUAN TRỌNG: Bắt đầu mở tabs ngay khi proxy active, không cần chờ verify IP
                  // Verify IP chỉ để hiển thị, không block việc chạy
                  console.log('✅ Proxy đã active, bắt đầu mở tabs ngay...');
                  if (document.querySelectorAll('[id^="U_"]').length === 0) {
                    window.openTab = [];
                    // ✅ Gọi runParallelProcessing (alias: runSequentiallyWithReduce) 
                    // MỚI: Async, chờ batch này hoàn tất rồi mới gọi reset IP tiếp
                    console.log('[fnResetIP] 🚀 Gọi runSequentiallyWithReduce() để start batch tiếp...');
                    try {
                      runSequentiallyWithReduce().catch(err => {
                        console.error('❌ [fnResetIP] Lỗi trong runParallelProcessing:', err);
                      });
                    } catch(e) {
                      console.error('❌ [fnResetIP] Lỗi gọi runParallelProcessing:', e);
                    }
                  } else {
                    console.log('⚠️ [fnResetIP] Đã có tabs đang chạy, không mở thêm');
                  }
                  
                  // Verify IP để hiển thị (không block)
                  function verifyIPChange() {
                    var ip_to_check = public_ip;
                    if (ip_to_check) {
                      document.querySelector('#ipNew').textContent = ip_to_check;
                      if (ip_to_check !== document.querySelector('#ipReal').textContent) {
                        console.log("✅ IP đã thay đổi:", ip_to_check);
                      } else {
                        console.log("ℹ️ IP hiện tại:", ip_to_check);
                      }
                    } else {
                      // Nếu public_ip trống, kiểm tra bằng API thực tế
                      checkIP(function (ip) {
                        if (ip) {
                          document.querySelector('#ipNew').textContent = ip;
                          if (ip !== document.querySelector('#ipReal').textContent) {
                            console.log("✅ IP đã thay đổi (verified):", ip);
                          } else {
                            console.log("ℹ️ IP hiện tại (verified):", ip);
                          }
                        }
                      });
                    }
                  }
                  verifyIPChange();
                } else {
                  console.warn("❌ Proxy chưa được kích hoạt. Đang đợi...");
                  // Đảm bảo resetIP sau thời gian ở lại trang (phút) + buffer
                  const stay = getStayMinutes();
                  setTimeout(fnResetIP, (stay + 2) * 60000); // Tăng buffer từ 1 phút lên 2 phút
                }
              }).catch(function(err) {
                console.error("❌ Lỗi khi bật proxy:", err);
                window.__proxyAuthenticating = false;
                // Retry sau thời gian buffer
                const stay = getStayMinutes();
                setTimeout(fnResetIP, (stay + 2) * 60000);
              });
            }).catch(function(err) {
              console.error("❌ Lỗi khi kiểm tra trạng thái proxy:", err);
              // Thử bật proxy anyway
              window.__proxyAuthenticating = true;
              console.log('🔐 Bắt đầu bật proxy (fallback)...');
              
              // Tạo object proxy info
              const proxyInfo = {
                https: msg.data['https'],
                proxy: msg.data['proxy'],
                username: username,
                password: password,
                public_ip: public_ip
              };
              
              proxy_change_address(proxyInfo).then(function (proxyActive) {
                window.__proxyAuthenticating = false;
                if (proxyActive) {
                  console.log("✅ Proxy đã được kích hoạt (fallback)!");
                  // Đánh dấu proxy active và set timer
                  window.__isProxyActive = true;
                  window.__proxyActivatedTime = Date.now();
                  window.__batchStartTime = Date.now(); // Bắt đầu tính thời gian batch
                  
                  // Reset các biến lỗi khi proxy thành công
                  window.__proxyNeedsReset = false;
                  window.__proxyFailureCount = 0;
                  console.log('✅ Đã reset proxy failure count về 0');
                  
                  if (window.__proxyLifetimeTimer) {
                    clearTimeout(window.__proxyLifetimeTimer);
                  }
                  window.__proxyLifetimeTimer = setTimeout(function() {
                    window.forceResetProxyAfter60Minutes();
                  }, window.PROXY_MAX_LIFETIME);
                  
                  const sophutLamtuoiFallback = getStayMinutes();
                  console.log(`⏰ Proxy active (fallback). Sẽ đổi sau ${sophutLamtuoiFallback} phút`);
                  
                  if (window.__isProxyActive && document.querySelectorAll('[id^="U_"]').length === 0) {
                    console.log('[fnResetIP] 🚀 [fallback] Gọi runSequentiallyWithReduce()...');
                    window.openTab = [];
                    // ✅ MỚI: Gọi async, không block
                    try {
                      runSequentiallyWithReduce().catch(err => {
                        console.error('❌ [fnResetIP fallback] Lỗi trong runParallelProcessing:', err);
                      });
                    } catch(e) {
                      console.error('❌ [fnResetIP fallback] Lỗi gọi runParallelProcessing:', e);
                    }
                  } else {
                    console.log('⚠️ [fnResetIP fallback] Proxy chưa active hoặc đã có tabs chạy');
                  }
                } else {
                  console.warn("❌ Proxy chưa được kích hoạt (fallback)");
                  const stay = getStayMinutes();
                  setTimeout(fnResetIP, (stay + 2) * 60000);
                }
              }).catch(function(err2) {
                console.error("❌ Lỗi khi bật proxy (fallback):", err2);
                window.__proxyAuthenticating = false;
                const stay = getStayMinutes();
                setTimeout(fnResetIP, (stay + 2) * 60000);
              });
            });
          } else {
            window.__proxyAuthenticating = false;
            setTimeout(fnResetIP, 60000); // Tăng thời gian chờ từ 30s lên 60s
          }
        } catch (err) {
          console.log(err);
          window.__proxyAuthenticating = false; // Xóa cờ khi có lỗi
          setTimeout(fnResetIP, 60000); // Tăng thời gian chờ từ 30s lên 60s
        }
      });
    }
  }
}
// ============================================
// TAB MANAGER - Giới hạn số lượng tabs đang chạy
// ============================================
window.TabManager = {
  MAX_TABS: 20, // Giới hạn tối đa 50 tabs
  isWaitingForBatchClose: false, // Flag: đang chờ batch tabs tắt
  lastLogTime: 0, // Để tránh log quá nhiều

  // Lấy danh sách webview đang mở (chỉ webview thực)
  getActiveWebviews: function() {
    return Array.from(document.querySelectorAll('webview[id^="U_"]'))
      .filter(wv => wv.id !== 'U_reset3G');
  },
  
  // Đếm số tabs đang mở
  getActiveTabCount: function() {
    return this.getActiveWebviews().length;
  },
  
  // Kiểm tra có thể tạo tab mới không
  canCreateTab: function() {
    // ⚠️ QUAN TRỌNG: Nếu đang chờ batch tắt, không cho tạo tab mới
    if (this.isWaitingForBatchClose) {
      // Log chỉ mỗi 30 giây để tránh spam
      const now = Date.now();
      if (now - this.lastLogTime > 30000) {
        console.log(`[TabManager] ⏸️ Đang chờ batch tabs tắt, không tạo tab mới`);
        this.lastLogTime = now;
      }
      return false;
    }
    
    const count = this.getActiveTabCount();
    const canCreate = count < this.MAX_TABS;
    if (!canCreate) {
      // Log chỉ mỗi 30 giây để tránh spam
      const now = Date.now();
      if (now - this.lastLogTime > 30000) {
        console.log(`[TabManager] ⛔ Đã đạt giới hạn ${this.MAX_TABS} tabs (hiện có ${count} tabs)`);
        this.lastLogTime = now;
      }
    }
    return canCreate;
  },
  
  // Chờ đến khi có slot trống (polling)
  // Timeout tăng lên 15 phút vì mỗi tab giờ chạy ~5 phút
  waitForSlot: function(timeout = 900000) {
    return new Promise((resolve, reject) => {
      const startTime = Date.now();
      let lastWarnTime = 0;
      const checkInterval = setInterval(() => {
        const elapsed = Date.now() - startTime;
        const elapsedSecs = Math.round(elapsed / 1000);
        
        // ⚠️ Nếu đang chờ batch tắt, báo nhưng chỉ mỗi 30s
        if (this.isWaitingForBatchClose) {
          const now = Date.now();
          if (now - lastWarnTime > 30000) {
            console.warn(`[TabManager] ⏸️ Đang chờ batch tabs tắt (${elapsedSecs}s/${Math.round(timeout/1000)}s)`);
            lastWarnTime = now;
          }
        } else {
          // Log tiến độ chờ slot mỗi 30s
          const now = Date.now();
          if (now - lastWarnTime > 30000) {
            const activeCount = this.getActiveTabCount();
            console.log(`[TabManager] ⏳ Chờ slot (${elapsedSecs}s/${Math.round(timeout/1000)}s): ${activeCount}/${this.MAX_TABS} tabs active`);
            lastWarnTime = now;
          }
        }
        
        if (this.canCreateTab()) {
          clearInterval(checkInterval);
          console.log(`[TabManager] ✅ Slot available sau ${elapsedSecs}s`);
          resolve(true);
          return; // QUAN TRỌNG: return để tránh kiểm tra các điều kiện reject tiếp theo
        }

        const isProxyExpired = window.__isProxyActive && window.__proxyActivatedTime > 0 && (Date.now() - window.__proxyActivatedTime) >= window.PROXY_MAX_LIFETIME;
        if (isProxyExpired) {
          clearInterval(checkInterval);
          console.warn('[TabManager] ⚠️ Proxy đã hết hạn khi đang chờ slot. Force reset...');
          if (typeof window.forceResetProxyAfter60Minutes === 'function') {
            window.forceResetProxyAfter60Minutes();
          }
          reject(new Error('Proxy expired while waiting for tab slot'));
          return; // QUAN TRỌNG: return để tránh kiểm tra tiếp
        } else if (Date.now() - startTime > timeout) {
          clearInterval(checkInterval);
          const activeCount = this.getActiveTabCount();
          console.error(`[TabManager] ❌ Timeout sau ${Math.round(timeout/1000)}s chờ slot. Active tabs: ${activeCount}/${this.MAX_TABS}`);
          reject(new Error(`Timeout waiting for tab slot after ${Math.round(timeout/1000)}s (${activeCount}/${this.MAX_TABS} tabs active)`));
          return; // QUAN TRỌNG: return để tránh reject lần 2
        }
      }, 1000); // Kiểm tra mỗi giây
    });
  },
  
  // Lấy thống kê
  getStats: function() {
    return {
      active: this.getActiveTabCount(),
      max: this.MAX_TABS,
      available: this.MAX_TABS - this.getActiveTabCount()
    };
  }
};

// ============================================
// LINK QUEUE MANAGER - Quản lý tất cả links xoay vòng không bỏ sót
// ============================================
window.LinkQueueManager = {
  // Queue chính chứa tất cả links cần xử lý
  queue: [],
  // Links đã xử lý (để tracking)
  processed: new Set(),
  // Links đang chờ xử lý
  pending: new Set(),
  // Chỉ số hiện tại trong queue
  currentIndex: 0,
  
  // Thêm links từ dataUser vào queue
  addFromDataUser: function(dataUser) {
    if (!Array.isArray(dataUser)) return;
    dataUser.forEach((item, idx) => {
      const linkId = `dataUser_${idx}_${item.tu_khoa || ''}_${item.domain_or_link || ''}`;
      if (!this.pending.has(linkId) && !this.processed.has(linkId)) {
        this.queue.push({
          id: linkId,
          source: 'dataUser',
          data: item,
          addedAt: Date.now()
        });
        this.pending.add(linkId);
      }
    });
    console.log(`[LinkQueue] Đã thêm ${dataUser.length} links từ dataUser. Tổng queue: ${this.queue.length}`);
  },
  
  // Thêm links từ webview vào queue
  addFromWebview: function(links, tabid, isRunAds) {
    if (!Array.isArray(links)) return;
    let added = 0;
    links.forEach((link, idx) => {
      const linkId = `webview_${tabid}_${link}`;
      if (!this.pending.has(linkId) && !this.processed.has(linkId)) {
        this.queue.push({
          id: linkId,
          source: 'webview',
          url: link,
          tabid: tabid,
          isRunAds: isRunAds,
          addedAt: Date.now()
        });
        this.pending.add(linkId);
        added++;
      }
    });
    console.log(`[LinkQueue] Đã thêm ${added}/${links.length} links từ webview. Tổng queue: ${this.queue.length}`);
  },
  
  // Lấy batch links tiếp theo để xử lý
  getNextBatch: function(batchSize) {
    if (this.queue.length === 0) {
      console.warn('[LinkQueue] Queue trống!');
      return [];
    }
    
    // Nếu đã chạy hết queue, reset và bắt đầu lại (xoay vòng)
    if (this.currentIndex >= this.queue.length) {
      console.log(`[LinkQueue] ♻️ Đã xử lý hết ${this.queue.length} links. Xoay vòng lại từ đầu...`);
      this.currentIndex = 0;
      // Chuyển processed sang lại pending để chạy lại
      this.processed.clear();
      this.queue.forEach(item => this.pending.add(item.id));
    }
    
    const batch = this.queue.slice(this.currentIndex, this.currentIndex + batchSize);
    console.log(`[LinkQueue] Lấy batch ${batch.length} links từ vị trí ${this.currentIndex}/${this.queue.length}`);
    return batch;
  },
  
  // Đánh dấu link đã xử lý
  markAsProcessed: function(linkId) {
    this.processed.add(linkId);
    this.pending.delete(linkId);
    this.currentIndex++;
  },
  
  // Reset toàn bộ queue
  reset: function() {
    this.queue = [];
    this.processed.clear();
    this.pending.clear();
    this.currentIndex = 0;
    console.log('[LinkQueue] ✓ Reset toàn bộ queue');
  },
  
  // Lấy thống kê
  getStats: function() {
    return {
      total: this.queue.length,
      processed: this.processed.size,
      pending: this.pending.size,
      currentIndex: this.currentIndex,
      progress: this.queue.length > 0 ? ((this.processed.size / this.queue.length) * 100).toFixed(1) : 0
    };
  },
  
  // Hiển thị thông tin chi tiết queue (debug)
  showDetails: function() {
    const stats = this.getStats();
    console.log('========================================');
    console.log('📊 LINK QUEUE MANAGER - CHI TIẾT');
    console.log('========================================');
    console.log(`Tổng số links: ${stats.total}`);
    console.log(`Đã xử lý: ${stats.processed} (${stats.progress}%)`);
    console.log(`Chờ xử lý: ${stats.pending}`);
    console.log(`Vị trí hiện tại: ${stats.currentIndex}`);
    console.log('----------------------------------------');
    console.log('Nguồn links:');
    const sources = {};
    this.queue.forEach(item => {
      sources[item.source] = (sources[item.source] || 0) + 1;
    });
    Object.keys(sources).forEach(source => {
      console.log(`  - ${source}: ${sources[source]} links`);
    });
    console.log('========================================');
    return stats;
  }
};

// Helper functions cho người dùng
window.showQueueStats = function() {
  return window.LinkQueueManager.showDetails();
};

window.showTabStats = function() {
  const stats = window.TabManager.getStats();
  console.log('========================================');
  console.log('📊 TAB MANAGER - THỐNG KÊ');
  console.log('========================================');
  console.log(`Tabs đang chạy: ${stats.active}`);
  console.log(`Giới hạn tối đa: ${stats.max}`);
  console.log(`Slots trống: ${stats.available}`);
  console.log('========================================');
  return stats;
};

window.showAllStats = function() {
  console.log('\n');
  const queueStats = window.showQueueStats();
  console.log('\n');
  const tabStats = window.showTabStats();
  console.log('\n');
  return { queue: queueStats, tabs: tabStats };
};

window.resetQueue = function() {
  if (confirm('Bạn có chắc muốn reset toàn bộ queue? Tất cả tiến độ sẽ bị mất.')) {
    window.LinkQueueManager.reset();
    console.log('✓ Đã reset queue. Hãy chạy lại app để load dữ liệu mới.');
  }
};

window.reloadQueueFromData = function() {
  window.LinkQueueManager.reset();
  const currentData = window.getDataUserOption();
  if (currentData.length > 0) {
    window.LinkQueueManager.addFromDataUser(currentData);
    console.log(`✓ Đã reload ${currentData.length} links vào queue từ dataUser`);
  }
  return window.LinkQueueManager.getStats();
};

// Biến toàn cục để theo dõi vị trí hiện tại trong mảng dataUserOption (backward compatibility)
let currentIndex = 0;

// Hàm lấy dữ liệu từ biến dataUserOption (source of truth)
// dataUserOption được khởi tạo từ seft.Uinfos.userAddress hoặc từ import excel
window.getDataUserOption = function (forceRefresh = false) {
  // Nếu forceRefresh = true, fetch lại từ database
  if (forceRefresh && window.csmUserData && typeof window.csmUserData.fetchFromDatabase === 'function') {
    console.log("[getDataUserOption] Force refresh từ database...");
    window.csmUserData.fetchFromDatabase(function(success, data, error) {
      if (success && Array.isArray(data)) {
        window.dataUserOption = data;
        console.log("[getDataUserOption] Refresh thành công, số lượng:", window.dataUserOption.length);
        
        // Reload grid nếu có
        if (typeof window.renderKeywordGrid === 'function') {
          window.renderKeywordGrid();
        }
      } else {
        console.warn("[getDataUserOption] Refresh thất bại:", error);
      }
    });
    return window.dataUserOption || [];
  }

  // Ưu tiên lấy từ csmUserData nếu có (từ AutoSetup.tsx)
  if (window.csmUserData && typeof window.csmUserData.get === 'function') {
    try {
      let arr = window.csmUserData.get();
      if (typeof arr === 'string') {
        arr = JSON.parse(arr);
      }
      if (Array.isArray(arr) && arr.length > 0) {
        window.dataUserOption = arr;
        return arr;
      }
    } catch (e) {
      console.warn("Lỗi khi lấy từ csmUserData:", e);
    }
  }

  // Fallback về dataUserOption hiện tại
  if (Array.isArray(window.dataUserOption) && window.dataUserOption.length > 0) {
    return window.dataUserOption;
  }

  // Fallback về localStorage
  try {
    const stored = localStorage.getItem('user_address');
    if (stored) {
      const arr = JSON.parse(stored);
      if (Array.isArray(arr)) {
        window.dataUserOption = arr;
        return arr;
      }
    }
  } catch (e) {
    // localStorage không có hoặc không hợp lệ
  }

  window.dataUserOption = [];
  return [];
};

// ==================== NEW PARALLEL PROCESSING LOGIC ====================
// Quản lý danh sách link tổng không trùng lặp
window.UnifiedLinkManager = {
  allLinks: new Set(), // Set để đảm bảo không trùng
  linkQueue: [], // Mảng có thứ tự để xử lý
  processedLinks: new Set(), // Links đã xử lý xong
  currentProxyPage: 0, // Trang proxy hiện tại
  currentBatchIndex: 0, // Vị trí hiện tại trong queue (không dùng splice)
  
  // Thêm links từ csmUserData ban đầu
  addFromDataUser: function(dataUserArray) {
    console.log('[UnifiedLinkManager] Thêm', dataUserArray.length, 'links từ csmUserData');
    let addedCount = 0;
    dataUserArray.forEach((item, index) => {
      const linkKey = `dataUser_${item.tu_khoa}_${item.domain_or_link}_${item.kieu_chay}`;
      // Kiểm tra cả allLinks và processedLinks để cho phép xoay vòng
      if (!this.allLinks.has(linkKey) || this.processedLinks.has(linkKey)) {
        if (!this.allLinks.has(linkKey)) {
          this.allLinks.add(linkKey);
        }
        // Nếu link đã processed nhưng đang xoay vòng, xóa khỏi processed
        if (this.processedLinks.has(linkKey)) {
          this.processedLinks.delete(linkKey);
        }
        this.linkQueue.push({
          id: linkKey,
          type: 'dataUser',
          data: item,
          priority: 0, // Ưu tiên cao nhất
          addedAt: Date.now()
        });
        addedCount++;
      }
    });
    this.sortQueue();
    console.log('[UnifiedLinkManager] Đã thêm', addedCount, 'links (xoay vòng). Tổng links trong queue:', this.linkQueue.length);
  },
  
  // Thêm links từ webview (quét được trong trang)
  addFromWebview: function(urls, parentTabId, isRunAds) {
    let addedCount = 0;
    urls.forEach(url => {
      if (!this.allLinks.has(url) && !this.processedLinks.has(url)) {
        this.allLinks.add(url);
        this.linkQueue.push({
          id: url,
          type: 'webview',
          url: url,
          parentTabId: parentTabId,
          isRunAds: isRunAds,
          priority: 1, // Ưu tiên thấp hơn dataUser
          addedAt: Date.now()
        });
        addedCount++;
      }
    });
    
    if (addedCount > 0) {
      this.sortQueue();
      console.log('[UnifiedLinkManager] Thêm', addedCount, 'links mới từ webview. Tổng:', this.linkQueue.length);
    }
  },
  
  // Sắp xếp queue: ưu tiên theo priority, sau đó theo thời gian thêm
  sortQueue: function() {
    this.linkQueue.sort((a, b) => {
      if (a.priority !== b.priority) return a.priority - b.priority;
      return a.addedAt - b.addedAt;
    });
  },
  
  // Lấy batch links để xử lý (theo số tab giới hạn)
  // FIX: Thay splice (xóa) thành slice (chỉ lấy) để tránh sót item
  getNextBatch: function(batchSize) {
    // Nếu hết queue, reset index và xoay vòng từ đầu
    if (this.currentBatchIndex >= this.linkQueue.length) {
      console.log(`[UnifiedLinkManager] ♻️ Đã đến cuối queue (${this.currentBatchIndex}/${this.linkQueue.length}). Xoay vòng lại từ đầu...`);
      this.currentBatchIndex = 0;
      // Reset processedLinks để xoay vòng
      this.processedLinks.clear();
    }
    
    // Lấy batch từ vị trí currentBatchIndex
    const batch = this.linkQueue.slice(this.currentBatchIndex, this.currentBatchIndex + batchSize);
    console.log(`[UnifiedLinkManager] Lấy batch ${batch.length} links từ vị trí ${this.currentBatchIndex}/${this.linkQueue.length}`);
    
    return batch;
  },
  
  // Đánh dấu link đã xử lý và di chuyển con trỏ
  markAsProcessed: function(linkId) {
    this.processedLinks.add(linkId);
    // Di chuyển currentBatchIndex cho lần gọi getNextBatch tiếp theo
    // (nhưng không quá số lượng links)
    if (this.currentBatchIndex < this.linkQueue.length) {
      this.currentBatchIndex++;
    }
  },
  
  // Lấy thống kê
  getStats: function() {
    return {
      total: this.allLinks.size,
      pending: this.linkQueue.length,
      processed: this.processedLinks.size,
      progress: this.allLinks.size > 0 ? Math.round((this.processedLinks.size / this.allLinks.size) * 100) : 0
    };
  },
  
  // Reset toàn bộ
  reset: function() {
    this.allLinks.clear();
    this.linkQueue = [];
    this.processedLinks.clear();
    this.currentProxyPage = 0;
    this.currentBatchIndex = 0; // Reset index khi reset
    console.log('[UnifiedLinkManager] Đã reset');
  }
};

// Hàm xử lý chính - Logic song song với quản lý proxy theo trang
const runParallelProcessing = async () => {
  console.log('[Parallel] 🎬 START runParallelProcessing()');
  
  // 1. Kiểm tra điều kiện cơ bản
  if (window.__waitingForAPIRetry) {
    const waitTime = Math.ceil((window.__getTMProxyLastTime - Date.now()) / 1000);
    console.warn(`⏸️ [Parallel] Đang chờ API rate limit (còn ${waitTime}s)`);
    return;
  }
  
  if (!window.__isProxyActive) {
    console.warn("⚠️ [Parallel] Proxy chưa active, gọi fnResetIP...");
    setTimeout(fnResetIP, 1000);
    return;
  }
  
  console.log("✅ [Parallel] Bắt đầu xử lý song song");
  
  // 2. Khởi tạo link queue lần đầu từ dataUserOption
  if (window.UnifiedLinkManager.linkQueue.length === 0) {
    const currentData = window.getDataUserOption();
    if (currentData.length === 0) {
      console.warn("[Parallel] Không có dữ liệu để xử lý");
      return;
    }
    window.UnifiedLinkManager.addFromDataUser(currentData);
  }
  
  // 3. Lấy cấu hình
  const maxTabs = parseInt(document.querySelector('#maxTab').value) || 5;
  const delayTime = getStayMinutes();
  
  // 4. Lấy batch links để xử lý
  const batch = window.UnifiedLinkManager.getNextBatch(maxTabs);
  
  if (batch.length === 0) {
    console.log("[Parallel] ⚠️ Không còn links trong queue");
    
    // Kiểm tra nếu đã xử lý hết tất cả links, reset và xoay vòng lại từ đầu
    const stats = window.UnifiedLinkManager.getStats();
    if (stats.processed >= stats.total && stats.total > 0) {
      console.log("[Parallel] 🔄 Đã xử lý hết tất cả links. Xoay vòng lại từ đầu...");
      
      // ✅ FULL RESET để xoay vòng (vì linkQueue sẽ không thay đổi, chỉ cần reset con trỏ)
      window.UnifiedLinkManager.processedLinks.clear();
      window.UnifiedLinkManager.currentBatchIndex = 0; // Reset index
      
      // 🔥 FIX: Nếu linkQueue đã có items từ lần chạy trước, chỉ cần reset index và processed
      // Không cần gọi addFromDataUser lại vì queue vẫn còn items cũ
      const pendingItems = window.UnifiedLinkManager.linkQueue.length;
      
      if (pendingItems > 0) {
        console.log("[Parallel] ✅ Queue vẫn có", pendingItems, "links. Bắt đầu vòng lặp mới...");
        
        // Tiếp tục xử lý ngay (với batch mới)
        setTimeout(() => runParallelProcessing(), 1000);
        return;
      } else {
        // Nếu queue trống, mới load lại từ dataUser
        const currentData = window.getDataUserOption();
        if (currentData.length > 0) {
          window.UnifiedLinkManager.addFromDataUser(currentData);
          console.log("[Parallel] ✅ Đã reload", currentData.length, "links từ đầu");
          
          // Tiếp tục xử lý ngay
          setTimeout(() => runParallelProcessing(), 1000);
          return;
        }
      }
    }
    
    console.log("[Parallel] ⏸️ Không có dữ liệu để xử lý");
    return;
  }
  
  // 5. Log thống kê
  const stats = window.UnifiedLinkManager.getStats();
  console.log(`[Parallel] Tiến độ: ${stats.processed}/${stats.total} (${stats.progress}%). Xử lý ${batch.length} links`);
  
  // 6. Tạo các webview song song (không chờ nhau)
  const createPromises = batch.map(async (item, index) => {
    // Chờ slot nếu đã đạt giới hạn
    if (!window.TabManager.canCreateTab()) {
      console.log(`[Parallel] Chờ slot cho link ${index + 1}/${batch.length}`);
      try {
        await window.TabManager.waitForSlot();
      } catch (err) {
        console.error(`[Parallel] Timeout chờ slot:`, err);
        return;
      }
    }
    
    let content = '';
    let url = '';
    let tabId = '';
    
    if (item.type === 'dataUser') {
      const keyword = item.data;
      const kieuChayValue = parseInt(keyword.kieu_chay, 10) || 0;
      
      content = `${strGoogleAds}google_click('${keyword.tu_khoa.toLowerCase()}','${keyword.domain_or_link.toLowerCase()}',${delayTime},${kieuChayValue});\n`;
      url = "https://www.google.com/";
      tabId = `gAds_${Date.now()}_${index}`;
      
    } else if (item.type === 'webview') {
      // Script để quét thêm links trong trang
      const scanLinksScript = `
        (function() {
          function scanAndSendLinks() {
            const links = Array.from(document.querySelectorAll('a'))
              .map(el => el.href)
              .filter(href => {
                try {
                  const url = new URL(href);
                  return url.host === location.host && 
                         !href.includes('login') && 
                         !href.includes('#') &&
                         href.startsWith('http');
                } catch(e) { return false; }
              });
            
            if (links.length > 0) {
              console.log(JSON.stringify({
                type: "discovered_links",
                parentTab: tabid,
                links: [...new Set(links)] // Loại bỏ trùng
              }));
            }
          }
          
          // Quét sau khi trang load xong
          if (document.readyState === 'complete') {
            scanAndSendLinks();
          } else {
            window.addEventListener('load', scanAndSendLinks);
          }
        })();
      `;
      
      content = strGoogleAds + scanLinksScript;
      url = item.url;
      tabId = `web_${Date.now()}_${index}`;
    }
    
    try {
      fnCreateTab(tabId, url, content, true, (Number(delayTime)||1)*60000+30000);
      console.log(`[Parallel] ✓ [${index + 1}/${batch.length}] Tạo tab: ${tabId}`);
      window.UnifiedLinkManager.markAsProcessed(item.id);
    } catch (err) {
      console.error(`[Parallel] ✗ Lỗi tạo tab ${tabId}:`, err);
    }
    
    // Delay nhỏ giữa các tab (không chặn toàn bộ)
    await delay(2000);
  });
  
  // 7. Chờ tất cả tabs được tạo xong
  await Promise.allSettled(createPromises);
  
  // ⏱️ QUAN TRỌNG: CHỜ tất cả tabs tự tắt theo timeout của người dùng
  // Không đổi proxy hay tạo batch tiếp theo cho đến khi tabs đóng hết
  const tabTimeoutMs = (Number(delayTime)||1)*60000+30000; // Timeout của mỗi tab (user setting + 30s buffer)
  
  // ✅ MỚI: Tính timeout thực tế từ API response, không dùng hardcoded
  // Nếu API đã set __getTMProxyNextRequest, dùng nó. Nếu không, fallback sang tabTimeoutMs + 60s
  let safetyTimeoutMs = tabTimeoutMs + 60000; // Default fallback
  let timeoutSource = 'Default (user setting + 90s)';
  
  if (window.__getTMProxyNextRequest && window.__getTMProxyNextRequest > Date.now()) {
    const waitTimeFromApi = window.__getTMProxyNextRequest - Date.now();
    // Timeout = API's next_request time + 30s buffer để chắc chắn tabs có đủ thời gian
    safetyTimeoutMs = waitTimeFromApi + 30000;
    timeoutSource = 'API (next_request + 30s buffer)';
    console.log(`[Parallel] 📡 Sử dụng timeout từ API: ${Math.round(waitTimeFromApi/1000)}s chờ tới ${new Date(window.__getTMProxyNextRequest).toLocaleString()}`);
  } else {
    console.log(`[Parallel] ⚠️ Không có next_request từ API, dùng timeout mặc định`);
  }
  
  console.log(`[Parallel] ⏰ Đã tạo ${batch.length} tabs, chờ chúng tự tắt theo timeout ${Math.round(safetyTimeoutMs/1000)}s (${timeoutSource})...`);
  
  // SET FLAG: Không cho tạo tabs mới
  window.TabManager.isWaitingForBatchClose = true;
  const batchStartTime = Date.now();
  
  const waitForAllTabsClose = () => {
    return new Promise((resolve) => {
      const checkInterval = setInterval(() => {
        const activeCount = window.TabManager.getActiveTabCount();
        const elapsedMs = Date.now() - batchStartTime;
        const elapsedSecs = Math.round(elapsedMs / 1000);
        
        if (activeCount === 0) {
          // Tất cả tabs đã đóng
          clearInterval(checkInterval);
          console.log(`[Parallel] ✅ Tất cả tabs đã tắt sau ${elapsedSecs}s!`);
          resolve(true);
          return;
        }
        
        // Log mỗi 30 giây
        if (elapsedSecs % 30 === 0) {
          console.log(`[Parallel] 🔍 Chờ tabs tắt: còn ${activeCount} tabs chạy (${elapsedSecs}s/${Math.round(safetyTimeoutMs/1000)}s timeout)`);
        }
      }, 10000); // Kiểm tra mỗi 10 giây
      
      // ⏱️ Timeout dựa trên API's next_request (nếu có) hoặc user setting
      // Sử dụng giá trị từ API thay vì hardcoded formula
      setTimeout(() => {
        clearInterval(checkInterval);
        const elapsedSecs = Math.round((Date.now() - batchStartTime) / 1000);
        console.warn(`[Parallel] ⚠️ Timeout chờ tabs tắt (${Math.round(safetyTimeoutMs/1000)}s - ${timeoutSource}), tiếp tục sau ${elapsedSecs}s...`);
        resolve(false);
      }, safetyTimeoutMs);
    });
  };
  
  await waitForAllTabsClose();
  
  // RESET FLAG: Cho phép tạo tabs mới cho batch tiếp theo
  window.TabManager.isWaitingForBatchClose = false;
  
  // ⚠️ QUAN TRỌNG: NGAY SAU KHI TABS TẮT HẾT → ĐỔI PROXY IP NGAY
  // Không chờ, gọi fnResetIP() trực tiếp để lấy IP mới
  console.log(`[Parallel] 🔄 ⚡ Tất cả tabs đã tắt, reset proxy IP ngay để lấy IP mới...`);
  
  // Chờ 1 giây cho các process dọn dẹp xong rồi reset IP
  await new Promise(resolve => setTimeout(resolve, 1000));
  
  // ✅ MỚI: Gọi fnResetIP(true) với FORCE mode để bypass throttle check
  // fnResetIP() sẽ gọi getTMProxy() → proxy active → gọi runSequentiallyWithReduce() tự động
  // FORCE = true vì đây là sau khi batch hoàn tất, PHẢI đổi proxy để tiếp tục batch tiếp theo
  console.log(`[Parallel] 📞 Gọi fnResetIP(true) với FORCE mode...`);
  fnResetIP(true);
  
  console.log(`[Parallel] ✅ END runParallelProcessing() - fnResetIP() đã được gọi`);
};

// Backward compatibility: Giữ tên cũ nhưng chuyển sang logic mới
const runSequentiallyWithReduce = runParallelProcessing;

const util = require('util');
const { exec, spawn } = require('child_process');
const os = require('os');

window.template = function (tpl, data) {
  var re = /\$\(([^\)]+)?\)/g, match;
  while (match = re.exec(tpl)) {
    tpl = tpl.replace(match[0], data[match[1]])
    re.lastIndex = 0;
  }
  return tpl;
}
/**
 * Hàm thực thi một lệnh shell và trả về kết quả.
 * Hỗ trợ tự động nhập mật khẩu cho lệnh `sudo` trên macOS (nếu cần).
 * @param {string} command Lệnh cần thực thi.
 * @param {string} [sudoPassword] Mật khẩu sudo (chỉ sử dụng cho lệnh sudo trên macOS).
 * @returns {Promise<string>} Chuỗi output của lệnh.
 */
async function executeCommand(command, sudoPassword = null) {
  const platform = os.platform();

  return new Promise((resolve, reject) => {
    let childProcess;

    try {
      if (platform === 'darwin') {
        if (command.startsWith('sudo') && sudoPassword) {
          const sudoArgs = ['-S', 'bash', '-c', command];
          childProcess = spawn('sudo', sudoArgs);

          if (!childProcess.stdin) {
            throw new Error('Lỗi: Không thể ghi vào stdin của tiến trình con.');
          }
          childProcess.stdin.write(sudoPassword + '\n');
        } else {
          childProcess = exec(command, { shell: '/bin/bash' });
        }
      } else if (platform === 'win32') {
        // Sử dụng powershell.exe -Command để đảm bảo các cmdlet được nhận diện
        // và giải quyết vấn đề về dấu ngoặc kép bằng cách sử dụng dấu ngoặc đơn
        // cho các chuỗi PowerShell bên trong.
        const psCommand = command.replace(/"/g, "'");
        childProcess = exec(`powershell.exe -Command "${psCommand}"`);
      }

      if (!childProcess) {
        throw new Error("Lỗi không xác định khi khởi tạo tiến trình con.");
      }

      let stdout = '';
      let stderr = '';

      childProcess.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      childProcess.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      childProcess.on('close', (code) => {
        if (code !== 0) {
          if (platform === 'win32' && code === 5) {
            console.error('Lỗi: Bạn cần chạy ứng dụng với quyền Administrator để thực thi lệnh này.');
            return reject(new Error('Access is denied. Run as Administrator.'));
          }
          const errorMessage = stderr || stdout || `Lệnh thất bại với mã lỗi ${code}`;
          return reject(new Error(errorMessage));
        }
        resolve(stdout);
      });

      childProcess.on('error', (err) => {
        reject(err);
      });
    } catch (err) {
      reject(new Error(`Không thể khởi tạo tiến trình: ${err.message}`));
    }
  });
}
var sudoPassword = "binhdang";
// Hàm hỗ trợ lấy tên dịch vụ mạng trên macOS
async function getMacNetworkService() {
  try {
    return "Wi-Fi";
    // return "Ethernet Adaptor (en3)";//"Wi-Fi"; // Hoặc "Ethernet"
    const output = await executeCommand('sudo networksetup -listallnetworkservices', sudoPassword);
    const services = output.split('\n')
      .filter(line => line.trim() !== '' && !line.includes('*') && !line.includes('An asterisk'))
      .map(line => line.trim());

    if (services.length > 0) {
      // Trả về dịch vụ đầu tiên tìm thấy
      return services[0];
    }
    return null;
  } catch (error) {
    console.error('Không thể tìm thấy dịch vụ mạng trên macOS. Lỗi:', error.message);
    return null;
  }
}
// Hàm kiểm tra trạng thái proxy trên macOS
async function checkMacProxyStatus(serviceName) {
  await delay(5000);
  if (!serviceName) {
    serviceName = await getMacNetworkService();
    if (!serviceName) return false;
  }

  try {
    const httpStatusOutput = await executeCommand(`sudo networksetup -getwebproxy "${serviceName}"`, sudoPassword);
    const isHttpProxyEnabled = httpStatusOutput.includes('Enabled: Yes');

    const httpsStatusOutput = await executeCommand(`sudo networksetup -getsecurewebproxy "${serviceName}"`, sudoPassword);
    const isHttpsProxyEnabled = httpsStatusOutput.includes('Enabled: Yes');

    return isHttpProxyEnabled || isHttpsProxyEnabled;
  } catch (error) {
    console.error('Lỗi khi kiểm tra trạng thái proxy macOS:', error.message);
    return false;
  }
}
// const { exec } = require('child_process');

const proxy_server_query = 'reg query "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings" /v ProxyServer';
const proxy_status_query = 'reg query "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings" /v ProxyEnable';
const deactivate_proxy_cmd = 'reg add "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings" /v ProxyEnable /t REG_DWORD /d 0 /f';

// Hàm helper để chạy lệnh cmd
function executeCmd(command) {
  return new Promise((resolve, reject) => {
    exec(command, { shell: 'cmd.exe' }, (error, stdout, stderr) => {
      if (error) {
        return reject(error);
      }
      if (stderr) {
        // reg query có thể trả về stderr ngay cả khi thành công, cần kiểm tra kỹ
        if (stderr.includes('Error: The system was unable to find the specified registry key or value')) {
          return resolve(''); // Trả về chuỗi rỗng nếu giá trị không tồn tại
        }
        return reject(new Error(stderr));
      }
      resolve(stdout);
    });
  });
}

// Hàm kích hoạt proxy trên Windows
async function activateWindowsProxy(proxyInfo) {
  try {
    // Xử lý proxy info object - extract host:port
    let proxyServer = proxyInfo.https || proxyInfo.proxy;
    
    if (!proxyServer) {
      throw new Error("Không có địa chỉ proxy được cung cấp.");
    }

    // Parse proxy URL để lấy host:port
    const parsed = parseProxyUrl(proxyServer);
    if (!parsed) {
      console.error('[activateWindowsProxy] Không thể parse proxy URL:', proxyServer);
      return false;
    }
    
    const { host: proxyHost, port: proxyPort } = parsed;
    proxyServer = `${proxyHost}:${proxyPort}`;
    
    console.log(`[activateWindowsProxy] Thiết lập proxy Windows: ${proxyServer}`);
    console.log(`[activateWindowsProxy] Username: ${proxyInfo.username || 'none'}`);

    // QUAN TRỌNG: Set ProxyServer cho HTTP và HTTPS riêng
    // Format: "http=host:port;https=host:port"
    const proxyServerFormatted = `http=${proxyHost}:${proxyPort};https=${proxyHost}:${proxyPort}`;
    
    console.log(`[activateWindowsProxy] Registry value: ${proxyServerFormatted}`);
    
    // Đặt địa chỉ proxy
    const set_proxy_cmd = `reg add "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings" /v ProxyServer /t REG_SZ /d "${proxyServerFormatted}" /f`;
    console.log(`[activateWindowsProxy] Executing: ${set_proxy_cmd}`);
    await executeCmd(set_proxy_cmd);
    
    // Bật proxy
    const enable_proxy_cmd = `reg add "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings" /v ProxyEnable /t REG_DWORD /d 1 /f`;
    console.log(`[activateWindowsProxy] Enabling proxy...`);
    await executeCmd(enable_proxy_cmd);
    
    // QUAN TRỌNG: Set ProxyOverride để không dùng proxy cho localhost
    const bypass_cmd = `reg add "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings" /v ProxyOverride /t REG_SZ /d "*.tmproxy.com;<local>" /f`;
    console.log(`[activateWindowsProxy] Setting bypass domains...`);
    await executeCmd(bypass_cmd);
    
    // QUAN TRỌNG: Nếu có credentials, set AutoConfigURL hoặc dùng ProxyUsername/ProxyPassword
    if (proxyInfo.username && proxyInfo.password) {
      // Thử set credentials vào registry (có thể không work trên tất cả Windows versions)
      try {
        const cred_user = `reg add "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings" /v ProxyUsername /t REG_SZ /d "${proxyInfo.username}" /f`;
        await executeCmd(cred_user);
        
        const cred_pass = `reg add "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings" /v ProxyPassword /t REG_SZ /d "${proxyInfo.password}" /f`;
        await executeCmd(cred_pass);
        
        console.log(`[activateWindowsProxy] Credentials set in registry`);
      } catch (credErr) {
        console.warn(`[activateWindowsProxy] Không thể set credentials qua registry:`, credErr.message);
      }
    }
    
    console.log(`✅ [activateWindowsProxy] Đã kích hoạt proxy trên Windows với địa chỉ: ${proxyServer}`);
    
    // Refresh để áp dụng settings ngay (optional)
    try {
      // Gửi WM_SETTINGCHANGE để notify Windows về thay đổi
      const refresh_cmd = `reg delete "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings\\Connections" /v DefaultConnectionSettings /f || true`;
      await executeCmd(refresh_cmd);
    } catch (e) {
      console.warn(`[activateWindowsProxy] Không refresh settings:`, e.message);
    }
    
    return await proxy_status_check();
  } catch (error) {
    console.error('❌ [activateWindowsProxy] Lỗi khi kích hoạt proxy trên Windows:', error.message);
    return false;
  }
}

// Hàm hủy kích hoạt proxy trên Windows
async function deactivateWindowsProxy() {
  try {
    console.log('[deactivateWindowsProxy] Disabling proxy on Windows...');
    
    // Tắt proxy
    const disable_proxy_cmd = `reg add "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings" /v ProxyEnable /t REG_DWORD /d 0 /f`;
    await executeCmd(disable_proxy_cmd);
    console.log('[deactivateWindowsProxy] ProxyEnable set to 0');
    
    // Xóa ProxyServer
    try {
      const delete_server_cmd = `reg delete "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings" /v ProxyServer /f`;
      await executeCmd(delete_server_cmd);
      console.log('[deactivateWindowsProxy] ProxyServer deleted');
    } catch (e) {
      console.warn('[deactivateWindowsProxy] Could not delete ProxyServer:', e.message);
    }
    
    // Xóa ProxyOverride
    try {
      const delete_override_cmd = `reg delete "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings" /v ProxyOverride /f`;
      await executeCmd(delete_override_cmd);
      console.log('[deactivateWindowsProxy] ProxyOverride deleted');
    } catch (e) {
      console.warn('[deactivateWindowsProxy] Could not delete ProxyOverride:', e.message);
    }
    
    // Xóa credentials
    try {
      const delete_user_cmd = `reg delete "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings" /v ProxyUsername /f`;
      await executeCmd(delete_user_cmd);
      const delete_pass_cmd = `reg delete "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings" /v ProxyPassword /f`;
      await executeCmd(delete_pass_cmd);
      console.log('[deactivateWindowsProxy] Credentials deleted');
    } catch (e) {
      console.warn('[deactivateWindowsProxy] Could not delete credentials:', e.message);
    }
    
    console.log('✅ [deactivateWindowsProxy] Đã hủy kích hoạt proxy trên Windows.');
    return true;
  } catch (error) {
    console.error('❌ [deactivateWindowsProxy] Lỗi khi hủy kích hoạt proxy trên Windows:', error.message);
    return false;
  }
}

// Hàm kiểm tra trạng thái proxy trên Windows
async function checkWindowsProxyStatus() {
  try {
    const output = await executeCmd(proxy_status_query);
    console.log('[checkWindowsProxyStatus] Registry output:', output);
    
    // Reg query sẽ trả về giá trị 0x1 nếu ProxyEnable được bật
    const isEnabled = output.includes('0x1');
    console.log(`[checkWindowsProxyStatus] Proxy status: ${isEnabled ? 'ENABLED' : 'DISABLED'}`);
    
    return isEnabled;
  } catch (error) {
    console.error(`❌ [checkWindowsProxyStatus] Lỗi khi kiểm tra proxy trên Windows: ${error.message}`);
    return false;
  }
}

// Hàm kích hoạt proxy trên macOS
async function activateMacProxy(proxyHost, proxyPort, username, password) {
  const serviceName = await getMacNetworkService();
  if (!serviceName) {
    console.error('[activateMacProxy] Không thể lấy tên dịch vụ mạng');
    return false;
  }

  // Validate inputs
  if (!proxyHost || !proxyPort) {
    console.error('[activateMacProxy] Proxy host hoặc port không hợp lệ:', {proxyHost, proxyPort});
    return false;
  }

  try {
    console.log(`[activateMacProxy] Thiết lập proxy với: host=${proxyHost}, port=${proxyPort}, service=${serviceName}`);
    
    var httpCommand = `sudo networksetup -setwebproxy "${serviceName}" ${proxyHost} ${proxyPort} On "${username}" "${password}"`;
    console.log('[activateMacProxy] Thực thi HTTP command...');
    await executeCommand(httpCommand, sudoPassword);

    var httpsCommand = `sudo networksetup -setsecurewebproxy "${serviceName}" ${proxyHost} ${proxyPort} On "${username}" "${password}"`;
    console.log('[activateMacProxy] Thực thi HTTPS command...');
    await executeCommand(httpsCommand, sudoPassword);
    
    var httpCommandEx = `sudo networksetup -setproxybypassdomains "${serviceName}" "*.tmproxy.com" "<local>"`;
    console.log('[activateMacProxy] Thực thi bypass domains command...');
    await executeCommand(httpCommandEx, sudoPassword);
    
    console.log(`✅ [activateMacProxy] Đã kích hoạt proxy cho dịch vụ "${serviceName}" trên macOS.`);
    // return true;
    return await proxy_status_check();
  } catch (error) {
    console.error('❌ [activateMacProxy] Lỗi khi kích hoạt proxy trên macOS:', error.message);
    return false;
  }
}

// Hàm hủy kích hoạt proxy trên macOS
async function deactivateMacProxy() {
  const serviceName = await getMacNetworkService();
  if (!serviceName) return false;

  try {
    const httpCommand = `sudo networksetup -setwebproxystate "${serviceName}" Off`;
    await executeCommand(httpCommand, sudoPassword);

    const httpsCommand = `sudo networksetup -setsecurewebproxystate "${serviceName}" Off`;
    await executeCommand(httpsCommand, sudoPassword);

    console.log(`Đã hủy kích hoạt proxy cho dịch vụ "${serviceName}" trên macOS.`);
    return true;
  } catch (error) {
    console.error('Lỗi khi hủy kích hoạt proxy trên macOS:', error.message);
    return false;
  }
}
/**
 * Tạm dừng việc thực thi trong một khoảng thời gian.
 * @param {number} ms Thời gian chờ tính bằng mili giây.
 * @returns {Promise<void>}
 */
function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Parse proxy URL và trích xuất host, port
 * Hỗ trợ các format: "host:port", "http://host:port", "https://host:port", "socks5://host:port"
 * @param {string} proxyUrl - Proxy URL cần parse
 * @returns {Object} {host, port} hoặc null nếu invalid
 */
function parseProxyUrl(proxyUrl) {
  if (!proxyUrl || typeof proxyUrl !== 'string') {
    console.error('[parseProxyUrl] Invalid proxy URL:', proxyUrl);
    return null;
  }
  
  try {
    // Loại bỏ protocol prefix
    let cleanUrl = proxyUrl.replace(/^(https?|socks\d*):\/\//, '');
    
    // Loại bỏ authentication prefix nếu có (user:pass@host:port)
    cleanUrl = cleanUrl.replace(/^[^@]+@/, '');
    
    // Loại bỏ trailing slashes
    cleanUrl = cleanUrl.replace(/\/$/, '');
    
    // Parse host:port
    const parts = cleanUrl.split(':');
    if (parts.length >= 2) {
      const host = parts[0];
      const port = parts[parts.length - 1]; // Lấy phần cuối là port
      
      // Validate port
      const portNum = parseInt(port, 10);
      if (isNaN(portNum) || portNum < 1 || portNum > 65535) {
        console.error('[parseProxyUrl] Invalid port:', port);
        return null;
      }
      
      if (!host || host.length === 0) {
        console.error('[parseProxyUrl] Empty host');
        return null;
      }
      
      console.log('[parseProxyUrl] ✅ Parsed:', { host, port });
      return { host, port };
    } else if (parts.length === 1) {
      // Chỉ có host, mặc định port 8080
      return { host: cleanUrl, port: '8080' };
    }
  } catch (e) {
    console.error('[parseProxyUrl] Parsing error:', e.message);
  }
  
  return null;
}

window.proxy_activate = async function (proxyInfo) {
  // QUAN TRỌNG: proxyInfo là object chứa: {https, username, password, ...}
  // Để tránh proxy auth dialog, config ở system level với embedded credentials
  console.log('[proxy_activate] Kích hoạt proxy với credentials:', proxyInfo.username || 'unknown');
  console.log('[proxy_activate] Raw proxy URL:', proxyInfo.https || proxyInfo.proxy);
  
  try {
    if (opsys === 'darwin') {
      let proxyUrl = proxyInfo.https || proxyInfo.proxy;
      
      // Parse proxy URL
      const parsed = parseProxyUrl(proxyUrl);
      if (!parsed) {
        console.error('[proxy_activate] Failed to parse proxy URL:', proxyUrl);
        return false;
      }
      
      const { host: proxyHost, port: proxyPort } = parsed;
      console.log(`[proxy_activate] Mac: ${proxyHost}:${proxyPort} with ${proxyInfo.username}`);
      return await activateMacProxy(proxyHost, proxyPort, proxyInfo.username || '', proxyInfo.password || '');
    } else if (opsys === 'win32') {
      return await activateWindowsProxy(proxyInfo);
    }
  } catch(err) {
    console.error('[proxy_activate] Error:', err);
    return false;
  }
  return false;
};

window.proxy_deactivate = async function () {
  if (opsys === 'darwin') {
    return await deactivateMacProxy();
  } else if (opsys === 'win32') {
    return await deactivateWindowsProxy();
  }
  return false;
};

window.proxy_status_check = async function () {
  if (opsys === 'darwin') {
    return await checkMacProxyStatus();
  } else if (opsys === 'win32') {
    return await checkWindowsProxyStatus();
  }
  return false;
};

// Hàm thay đổi địa chỉ proxy, bao gồm kích hoạt
window.proxy_change_address = async function (proxyInfo) {
  // Để thay đổi địa chỉ, chúng ta chỉ cần kích hoạt proxy với địa chỉ mới
  // proxyInfo là object chứa {https, proxy, username, password, ...}
  return await proxy_activate(proxyInfo);
};
// Tính năng riêng phần modal
// Kéo modal
function dragElement(elmnt) {
  const toolbar = elmnt.querySelector(".toolbar");
  let pos1 = 0, pos2 = 0, pos3 = 0, pos4 = 0;

  toolbar.onmousedown = dragMouseDown;

  function dragMouseDown(e) {
    e.preventDefault();
    pos3 = e.clientX;
    pos4 = e.clientY;
    document.onmouseup = closeDragElement;
    document.onmousemove = elementDrag;
  }

  function elementDrag(e) {
    e.preventDefault();
    pos1 = pos3 - e.clientX;
    pos2 = pos4 - e.clientY;
    pos3 = e.clientX;
    pos4 = e.clientY;
    elmnt.style.top = elmnt.offsetTop - pos2 + "px";
    elmnt.style.left = elmnt.offsetLeft - pos1 + "px";
  }

  function closeDragElement() {
    document.onmouseup = null;
    document.onmousemove = null;
  }
}

// Resize modal
function resizeElement(elmnt) {
  const resizeHandle = elmnt.querySelector(".resize-handle");
  resizeHandle.onmousedown = resizeMouseDown;

  function resizeMouseDown(e) {
    e.preventDefault();
    document.onmouseup = closeResizeElement;
    document.onmousemove = elementResize;
  }

  function elementResize(e) {
    elmnt.style.width = e.clientX - elmnt.offsetLeft + "px";
    elmnt.style.height = e.clientY - elmnt.offsetTop + "px";
  }

  function closeResizeElement() {
    document.onmouseup = null;
    document.onmousemove = null;
  }
}
window.fnCreateTab = function (id_tab, url_open, script_code, multi_tab_name, auto_close) {
  if (!isRunning)
    return;
  try {
    // console.log("Tao tab",id_tab, url_open, multi_tab_name, auto_close);
    // const gui = require('nw.gui');
    // gui.App.clearCache();
    // fnClearCache();
    if (multi_tab_name)
      id_tab = id_tab + (document.querySelectorAll('[id^="U_' + id_tab + '"]').length + 1);
    else if (document.querySelectorAll('[id^="U_' + id_tab + '"]').length > 0)
      return;

    const modalId = id_tab;

    // Tạo webview panel container (không modal, hiển thị trực tiếp)
    // Container chứa nhiều webview dạng grid
    let webviewContainer = document.getElementById('webview-grid-container');
    if (!webviewContainer) {
      webviewContainer = document.createElement("div");
      webviewContainer.id = 'webview-grid-container';
      webviewContainer.style.cssText = `
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(500px, 1fr));
            gap: 8px;
            padding: 8px;
            background: #f5f5f5;
            min-height: 400px;
            overflow: auto;
          `;
      const container = document.querySelector('#context-auto .card-body') || document.querySelector('#context-auto') || document.body;
      if (container) {
        container.appendChild(webviewContainer);
      }
    }

    // Tạo webview panel item
    const panelItem = document.createElement("div");
    panelItem.id = modalId;
    panelItem.className = 'webview-panel-item';
    panelItem.style.cssText = `
          display: flex;
          flex-direction: column;
          background: white;
          border: 1px solid #e0e0e0;
          border-radius: 4px;
          overflow: hidden;
          box-shadow: 0 2px 4px rgba(0,0,0,0.08);
        `;

    // Header toolbar
    const header = document.createElement("div");
    header.style.cssText = `
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 8px 12px;
          background: #fafafa;
          border-bottom: 1px solid #f0f0f0;
          font-size: 12px;
          user-select: none;
        `;

    const titleSpan = document.createElement("span");
    titleSpan.textContent = `${id_tab}`;
    titleSpan.style.fontWeight = "500";
    titleSpan.style.overflow = "hidden";
    titleSpan.style.textOverflow = "ellipsis";
    titleSpan.style.whiteSpace = "nowrap";
    titleSpan.style.flex = "1";

    const closeBtn = document.createElement("button");
    closeBtn.textContent = "✕";
    closeBtn.style.cssText = `
          background: transparent;
          border: none;
          color: #666;
          cursor: pointer;
          padding: 2px 6px;
          font-size: 16px;
          line-height: 1;
          margin-left: 8px;
        `;
    closeBtn.addEventListener('mouseenter', () => closeBtn.style.color = '#ff4d4f');
    closeBtn.addEventListener('mouseleave', () => closeBtn.style.color = '#666');

    header.appendChild(titleSpan);
    header.appendChild(closeBtn);

    // Webview content area
    const content = document.createElement("div");
    content.style.cssText = `
          flex: 1;
          position: relative;
          overflow: hidden;
        `;

    // Close button handler
    closeBtn.addEventListener('click', () => {
      fnRemoveTab(id_tab);
    });

    // Webview element
    var webview = document.createElement('webview');
    webview.setAttribute('id', 'U_' + id_tab);
    // webview.setAttribute('name', us[0]);
    // webview.setAttribute('pass', us[1]);
    // webview.setAttribute('taitrangxong', false);
    webview.setAttribute('style', 'border: 0; width: 100%; height: inherit; margin-bottom: -8px;');
    var rand = Math.floor(Math.random() * 1000000) + Math.floor(Math.random() * 9) + (new Date).getTime();
    // ⚠️ QUAN TRỌNG: Sử dụng partition in-memory (không "persist:") để dữ liệu KHÔNG lưu lên ổ đĩa
    // Điều này giải quyết vấn đề cache bị khóa CSM.exe
    // Format: không tiền tố "persist:" = in-memory, tự động xóa khi webview đóng
    const partitionId = 'temp_session_' + rand;
    webview.setAttribute('partition', partitionId);
    // Lưu partitionId để fnRemoveTab có thể xóa storage nếu cần
    webview.dataset.partitionId = partitionId;
    // webview.setAttribute('webpreferences', 'webSecurity=no');
    webview.setAttribute('style', "height: 400px;");
    // Tắt các chính sách bảo mật nghiêm ngặt
    // webview.setAttribute('disablewebsecurity', true);
    // webview.setAttribute('sandbox', 'allow-scripts allow-same-origin');
    var curentUserAgent=bindings[rand % Object.keys(bindings).length];
    webview.setUserAgentOverride(curentUserAgent);
    setTimeout(() => {
        webview.setAttribute('src', url_open);
    }, 2000); // Trì hoãn 2 giây
    // webview.showDevTools();
    // alert(webview.executeScript)
    webview.addEventListener("did-fail-load", (event) => {
        if (event.errorCode === -3) {
            console.log("Tải lại trang...");
            setTimeout(() => {
                webview.src = url_open;
            }, 3000);
        }
    });
    webview.addEventListener("dom-ready", function () {
        webview.executeScript(`
        document.dispatchEvent(new MouseEvent('mousemove', { clientX: 100, clientY: 200 }));
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'A' }));
        window.scrollBy(0, 100);
    `);
    });
    webview.addEventListener('exit', function (e) {
        if (e.reason === 'crash') {
            var self = this;
            setTimeout(function () {
                try {
                    if (document.querySelector('#U_' + id_tab))
                        document.querySelector('#U_' + id_tab).reload();
                } catch { }
            }, 15000);
        }
    });
    webview.addEventListener('dialog', function (e) {
        //message type 
        messageType = e.messageType;
        messageText = e.messageText;
        DialogController = e.dialog;
        var jsonMessage = {};
        try {
            jsonMessage = JSON.parse(messageText);
            if (jsonMessage.type === "tin") {
                console.log(jsonMessage);
            }
            else if (jsonMessage.type === "nganh_nghe") {
                document.querySelector('#U_' + jsonMessage.tabid).executeScript(
                    {
                        code: strGoogleAds + `
            JSON.parse(localStorage.getItem("nhom_nganh"));
            `, runAt: "document_end"
                    },
                    function (results) {
                        if (results[0]) {
                            window.top_cv = results[0];
                            QuetThongTin(jsonMessage.tabid);
                        }
                        // console.log(top_cv);
                    });
                // console.log("TopCV nhóm nghề",jsonMessage.nhom_nghe);
            }
        }
        catch (ex) {

        }
        // console.log(jsonMessage);
    });
    webview.addEventListener('consolemessage', (event) => {
        // Kiểm tra nếu có lỗi ERR_BLOCKED_BY_CLIENT hoặc ERR_ABORTED
        // console.log(event.message);
        if (event.message.includes("ERR_BLOCKED_BY_CLIENT") || event.message.includes("ERR_ABORTED")) {
            console.log('The load has been aborted or blocked.');
            // Thực hiện hành động khắc phục (ví dụ, reload trang, hiển thị thông báo lỗi, v.v.)
            setTimeout(function () {
                try {
                    if (document.querySelector('#U_' + id_tab))
                        document.querySelector('#U_' + id_tab).reload();
                } catch { }
            }, 5000);
        }
      try {
        var message = JSON.parse(event.message);
        // alert(JSON.stringify(message));
        if (message.hasOwnProperty("type")) {
          // alert(JSON.stringify(message));
          if (message.type === "title") {
            if (document.querySelector('#' + message.tabid + ' span>span'))
              document.querySelector('#' + message.tabid + ' span>span').textContent = message.title;
            else if (document.querySelector('#' + message.tabid + ' span'))
              document.querySelector('#' + message.tabid + ' span').textContent = message.title;
          }
          else if (message.type === "su_kien" && message["su_kien"] && message["tabid"])
            thongbao(message["tabid"] + ":" + message["su_kien"])
          else if (message.type === "activetab") {
            if (document.querySelector('#U_' + message.tabid))
              document.querySelector('#U_' + message.tabid).scrollIntoView();
          }
          else if (message.type === "ip") {
            // console.log(message);
            var data = message.data;
            if (oldIP !== data.ip) {

              oldIP = data.ip;
              worker.postMessage({ type: "ip", ip: data.ip });
              if (document.querySelector('#sophut_lamtuoi')) {
                // Khởi tạo UnifiedLinkManager với dữ liệu từ csmUserData
                const currentData = window.getDataUserOption();
                console.log('[ip_changed] Khởi tạo UnifiedLinkManager với', currentData.length, 'links từ csmUserData');
                
                // Reset và thêm lại dữ liệu mới
                window.UnifiedLinkManager.reset();
                window.UnifiedLinkManager.addFromDataUser(currentData);
                
                // Bắt đầu xử lý song song
                console.log('[ip_changed] ⚡ Bắt đầu xử lý song song...');
                setTimeout(() => {
                  runParallelProcessing();
                }, 2000);
              }
              setTimeout(function () {
                fnRemoveTab("reset3G");
              }, 3000);
            }
            else {
              setTimeout(function () {
                fnRemoveTab("reset3G");
                fnResetIP();
              }, 1000)
            }
          }
          else if (message.type === "discovered_links") {
            // Handler mới: Webview đã quét và gửi links về
            if (!message.links || !Array.isArray(message.links) || message.links.length === 0) {
              console.log('[discovered_links] Không có links mới từ', message.parentTab);
              return;
            }
            
            // Thêm vào UnifiedLinkManager
            window.UnifiedLinkManager.addFromWebview(message.links, message.parentTab, 2);
            
            const stats = window.UnifiedLinkManager.getStats();
            console.log(`[discovered_links] ✓ Nhận ${message.links.length} links từ ${message.parentTab}. Tổng queue: ${stats.pending}`);
            
            // Kích hoạt xử lý nếu đang chạy
            if (window.isRunning && stats.pending > 0) {
              console.log('[discovered_links] ⚡ Tiếp tục xử lý links...');
              setTimeout(() => {
                runParallelProcessing();
              }, 3000);
            }
          }
          else if (message.type === "open") {
            // Handler thống nhất: Chỉ thêm links vào queue, KHÔNG gọi fnCreateTab trực tiếp
            // Để runParallelProcessing là handler duy nhất tạo tabs
            if (!message.links || !Array.isArray(message.links) || message.links.length === 0) {
              console.error('[message.type=open] Không có links hoặc links không hợp lệ:', message);
              return;
            }

            // Sử dụng UnifiedLinkManager để thêm links vào queue
            window.UnifiedLinkManager.addFromWebview(message.links, message.tabid, message.isRunAds);
            
            // Log stats
            const stats = window.UnifiedLinkManager.getStats();
            console.log(`[message.type=open] ✓ Đã thêm ${message.links.length} links vào queue. Tổng: ${stats.total}, Đã xử lý: ${stats.processed}, Chờ xử lý: ${stats.pending}`);
            
            // ⚠️ QUAN TRỌNG: Chỉ gọi runParallelProcessing nếu không đang chờ batch tắt
            // Nếu đang chờ batch tắt, runParallelProcessing sẽ được gọi tự động sau khi batch tắt
            if (window.isRunning && stats.pending > 0 && !window.TabManager.isWaitingForBatchClose) {
              console.log('[message.type=open] ⚡ Kích hoạt xử lý links từ queue...');
              setTimeout(() => {
                runParallelProcessing();
              }, 2000);
            } else if (window.TabManager.isWaitingForBatchClose) {
              console.log(`[message.type=open] ⏸️ Đang chờ batch tabs tắt, links sẽ xử lý ở batch tiếp theo (${stats.pending} links chờ)`);
            }
            // message.links.forEach(function(link){
            //   if(!openTab.find(o=>o===link))
            //   {
            //     openTab.push(link);
            //     var strOpen='';
            //     if(1*message.isRunAds===2)
            //       strOpen=`
            //         console.log(JSON.stringify({type:"open",isRunAds:`+message.isRunAds+`,tabid:tabid,links:Array.from(document.querySelectorAll('a')).filter(el=>el.href.indexOf(location.host)!==-1 && el.href.indexOf('login')===-1 && el.href.indexOf('#')===-1).map(el=>el.href)}));
            //     `;
            //     var content=strEvent+`
            //       startSimulation();
            //       setTimeout(function(){console.log(JSON.stringify({type:"close",tabid:tabid}))},`+document.querySelector('#sophut_lamtuoi').value+`*60000);
            //       `+strOpen;
            //     fnCreateTab(message.tabid,link,content,true,document.querySelector('#sophut_lamtuoi').value*120000);
            //   }
            // }); 
          }
          else if (message.type === "save") {
            console.log('[message.save] Received save event:', JSON.stringify({ gTop: message.gTop, tu_khoa: message.tu_khoa, link_check: message.link_check, isRunAds: message.isRunAds }));

            var gTop = message.gTop, tu_khoa = message.tu_khoa, domain_or_link = message.link_check, kieu_chay = message.isRunAds;
            var arrRows = JSON.parse(JSON.stringify(window.getDataUserOption()));

            // Tìm dòng cần update
            var idxLink = arrRows.findIndex(function (obj) {
              return obj.tu_khoa.toLowerCase().trim() === tu_khoa.toLowerCase().trim() &&
                obj.domain_or_link.toLowerCase().trim() === domain_or_link.toLowerCase().trim() &&
                1 * obj.kieu_chay === 1 * kieu_chay;
            });

            if (idxLink !== -1) {
              // Cập nhật gTop
              arrRows[idxLink]['gtop'] = gTop;
              console.log('[message.save] Updated gtop to:', gTop);

              // Cập nhật global state
              window.dataUserOption = arrRows;

              // Trigger afterEdit để sync dữ liệu (giống như thay đổi từ grid)
              // Đây là trigger định nghĩa trong m_configs
              console.log('[message.save] Syncing data via afterEdit trigger');

              // Lưu qua csmUserData
              if (window.csmUserData && typeof window.csmUserData.set === 'function') {
                window.csmUserData.set(arrRows, function (success, error) {
                  if (success) {
                    canhbao("Lưu top google " + gTop);
                    console.log('[message.save] ✅ Saved to csmUserData');
                  } else {
                    console.error('[message.save] ❌ Failed to save to csmUserData:', error);
                  }
                });
              } else {
                // Fallback: localStorage
                try {
                  localStorage.setItem('user_address', JSON.stringify(arrRows));
                  canhbao("Lưu top google " + gTop);
                  console.log('[message.save] ✅ Saved to localStorage');
                } catch (err) {
                  console.error('[message.save] ❌ localStorage error:', err);
                }
              }
            } else {
              console.warn('[message.save] Row not found with keyword:', tu_khoa);
            }
          }
          else if (message.type === "error") {
            console.log(message.msg);
          }
          else if (message.type === "close") {
            // Clear fallback timeout nếu có (tránh duplicate close)
            const wv = document.getElementById('U_' + message.tabid);
            if (wv && wv.dataset.autoCloseTimeoutId) {
              clearTimeout(parseInt(wv.dataset.autoCloseTimeoutId));
              console.log(`[message.close] ✅ Đã clear fallback timeout ${wv.dataset.autoCloseTimeoutId} cho tab ${message.tabid}`);
            }
            fnRemoveTab(message.tabid);
          }
          else if (message.type === "resetip") {
            console.warn('🔄 [message.resetip] Nhận lệnh reset IP từ webview');
            window.__proxyNeedsReset = true;
            if (isRunning && typeof fnResetIP === 'function') {
              fnResetIP();
            }
          }
        }
      } catch { }
    });
    webview.addEventListener('loadabort',function(e) {
      var self=this;
      setTimeout(function(){
        try{
          if(document.querySelector('#U_'+id_tab))
              document.querySelector('#U_'+id_tab).reload();
        }catch{}
      },15000);
    });
    if (script_code) {
      var strScript = 'window.tabid="' + id_tab + '";\n window.fnBililiteRange=' + fnBililiteRange.toString() + ';\n window.bililiteRange=fnBililiteRange();\n try{\n console.log(JSON.stringify({type:"title",tabid:tabid,title:document.title||location.href})); \n ' + script_code + '\n}catch(exT){console.log(JSON.stringify({type:"error",tabid:tabid,msg:exT.message}));} \n ';
      // alert(id_tab)
      // if(id_tab!=="reset3G")
      //   console.log(strScript);
      strScript += `
      if(document.querySelector('[type="submit"]').parentNode.parentNode.parentNode.parentNode.parentNode.parentNode.parentNode && !document.getElementById('uagen'))
      {
          const container = document.querySelector('[type="submit"]').parentNode.parentNode.parentNode.parentNode.parentNode.parentNode.parentNode;
          const newChild = document.createElement('div');
          newChild.id = 'uagen';
          newChild.textContent = "`+ curentUserAgent + `";
          container.prepend(newChild);
      }
      `;
      var strCode = 'var scriptAu=document.createElement("script");\n';
      strCode += '  scriptAu.src="data:text/javascript;base64,' + seft.Base64.encode(strScript) + '";\n';
      strCode += '  scriptAu.type="text/javascript";\n';
      strCode += '  document.head.appendChild(scriptAu);\n';
      webview.addContentScripts([
        {
          js: { code: strCode, },
          name: 'params', matches: ['<all_urls>'], all_frames: true, run_at: 'document_end',
        }]);
    }
    webview.addEventListener('loadstop', function (e) {
      // Xử lý Google Sorry Page (CAPTCHA)
      if (webview.src.includes("google.com/sorry/index")) {
        console.log(`[loadstop] Phát hiện captcha gooogle phải tắt tab ${id_tab}`);
        if (typeof fnRemoveTab === 'function') fnRemoveTab(id_tab);
      }
      
      // ❌ XÓA TIMEOUT Ở ĐÂY - loadstop có thể trigger nhiều lần (mỗi redirect)
      // Timeout sẽ được set MỘT LẦN DUY NHẤT khi tạo tab (xem phía dưới)
      // if (auto_close && auto_close > 0) {
      //   setTimeout(function () {
      //     console.log(`[loadstop] ⏰ Fallback: Tự động đóng tab ${id_tab} sau ${Math.round(auto_close / 1000)} giây.`);
      //     if (typeof fnRemoveTab === 'function') fnRemoveTab(id_tab);
      //   }, auto_close + 5000);
      // }
    });
    
    // Append webview vào content
    content.appendChild(webview);
    
    // Append header và content vào panelItem
    panelItem.appendChild(header);
    panelItem.appendChild(content);
    
    // Append panelItem vào webviewContainer (không phải #context-auto .card-body)
    webviewContainer.appendChild(panelItem);
    
    // ⏰ QUAN TRỌNG: Set timeout fallback MỘT LẦN DUY NHẤT ngay sau khi tạo tab
    // Timeout này KHÔNG bị ảnh hưởng bởi loadstop/redirect events
    if (auto_close && auto_close > 0) {
      const tabTimeoutId = setTimeout(function () {
        console.log(`[fnCreateTab] ⏰ FALLBACK: Tự động đóng tab ${id_tab} sau ${Math.round(auto_close / 1000)}s (timeout được set khi tạo tab)`);
        if (typeof fnRemoveTab === 'function') fnRemoveTab(id_tab);
      }, auto_close + 5000); // +5s buffer để webview script có thời gian gửi close signal
      
      // Lưu timeout ID vào webview element để có thể clear nếu cần
      if (webview) webview.dataset.autoCloseTimeoutId = tabTimeoutId;
      console.log(`[fnCreateTab] ⏰ Đã set fallback timeout cho tab ${id_tab}: ${Math.round((auto_close + 5000) / 1000)}s (Timeout ID: ${tabTimeoutId})`);
    }
    
    // console.log("Tao Xong tab",id_tab);
    setTimeout(function () {
        if (document.querySelector('#U_' + id_tab))
            document.querySelector('#U_' + id_tab).scrollIntoView();
    }, 5000);
  } catch (exT) {
    console.log("Lỗi Tao tab", exT.message, id_tab, url_open, multi_tab_name, auto_close);
    fnRemoveTab(id_tab);
    // fnCreateTab(id_tab,url_open,script_code,multi_tab_name,auto_close);
  }
}

// Log ngay đầu để debug
console.log('=== seo.js execution started ===');
console.log('seft available:', typeof seft !== 'undefined');
console.log('document.querySelector(".ribbon-content-wrapper"):', !!document.querySelector('.ribbon-content-wrapper'));
console.log('document.querySelector("#context-auto"):', !!document.querySelector('#context-auto'));

// Hàm setup lắng nghe container
function setupWhenContainerReady() {
  console.log('Checking for #context-auto container...');

  // Nếu container đã tồn tại, setup ngay
  if (document.querySelector('#context-auto')) {
    console.log('✓ #context-auto container found immediately');
    initializeApp();
    return;
  }

  // Nếu chưa, lắng nghe DOM changes
  const observer = new MutationObserver((mutations) => {
    console.log('DOM mutation detected, checking for #context-auto...');
    if (document.querySelector('#context-auto')) {
      console.log('✓ #context-auto container found via MutationObserver');
      observer.disconnect();
      initializeApp();
    }
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true,
    attributes: false,
    characterData: false
  });

  // Timeout: nếu 5 giây vẫn chưa tìm được, thử setup anyway
  setTimeout(() => {
    if (!document.querySelector('#context-auto')) {
      console.warn('⚠ #context-auto not found after 5s, trying without it');
      observer.disconnect();
    }
  }, 5000);
}

// Hàm initialize app
function initializeApp() {
  console.log('Initializing app...');

  // Execute main code block
  try {
    mainAppCode();
  } catch (err) {
    console.error('Error in mainAppCode:', err);
  }
}

// Main app code
function mainAppCode() {
  console.log('✓ Entering main code block');

  // const gui = require('nw.gui'); 
  // gui.App.clearCache();
  // fnClearCache();
  window.save = function (message) {
    var gTop = message.gTop, tu_khoa = message.tu_khoa, domain_or_link = message.link_check, kieu_chay = message.isRunAds;
    var allGridItems = grdUserOption.getDataSource().items();
    var arrRows = [];
    allGridItems.forEach(function (objD) {
      var obj = JSON.parse(JSON.stringify(objD));
      delete obj["__KEY__"];
      arrRows.push(obj);
    });
    var idxLink = arrRows.findIndex(function (obj) {
      return obj.tu_khoa.toLowerCase() === tu_khoa.toLowerCase() && obj.domain_or_link.toLowerCase() === domain_or_link.toLowerCase() && obj.kieu_chay === kieu_chay;
    });
    if (idxLink !== -1) {
      arrRows[idxLink]['gtop'] = gTop;
      window.dataUserOption = arrRows;
      // Đồng bộ vào localStorage
      localStorage.setItem('user_address', JSON.stringify(window.dataUserOption));
      // Đồng bộ vào csmUserData nếu có
      if (window.csmUserData && typeof window.csmUserData.set === 'function') {
        window.csmUserData.set(window.dataUserOption, function (success, error) {
          if (success) {
            // Refresh lại từ database để đảm bảo đồng bộ
            window.dataUserOption = window.getDataUserOption(true);
            thongbao("Đã lưu thành công");
          } else {
            canhbao("Lưu thất bại: " + error);
          }
          // Sau khi lưu, reload lại lưới
          if (typeof window.renderKeywordGrid === 'function') {
            window.renderKeywordGrid();
          }
        });
      } else {
        // Nếu không có csmUserData, reload lại lưới
        if (typeof window.renderKeywordGrid === 'function') {
          window.renderKeywordGrid();
        }
      }
    }
  };
  // Lấy IP thật của máy: thử lần lượt ipinfo → ipify → ping.eu (HTML). Luôn gọi fn với string hoặc false.
  window.checkIP = function (fn) {
    const tryIpInfo = () => fetch('https://ipinfo.io/json', { method: 'GET', headers: { 'Accept': 'application/json' } })
      .then(r => r.ok ? r.json() : Promise.reject())
      .then(res => res?.ip || Promise.reject());

    const tryIpify = () => fetch('https://api.ipify.org/?format=json', { method: 'GET', headers: { 'Accept': 'application/json' } })
      .then(r => r.ok ? r.json() : Promise.reject())
      .then(res => res?.ip || Promise.reject());

    const tryPingEu = () => fetch('https://ping.eu/', { method: 'GET' })
      .then(r => r.text())
      .then(html => {
        const parser = new DOMParser();
        const doc = parser.parseFromString(html, 'text/html');
        const ip = doc.querySelector('.ip-td>b')?.innerText;
        if (ip) return ip;
        return Promise.reject();
      });

    tryIpInfo()
      .catch(tryIpify)
      .catch(tryPingEu)
      .then(ip => fn(ip))
      .catch(() => fn(false));
  }
  // Legacy sync helpers removed (checkIP_old, checkIPFromPingEU) – logic folded above
  /**
   * Lấy danh sách các proxy có sẵn từ API wwproxy.com.
   *
   * @returns {Promise<Object|null>} Một Promise trả về dữ liệu proxy (dạng Object) nếu thành công,
   * hoặc null nếu có lỗi.
   */
  async function getAvailableProxies(api_key, provinceId = -1) {
    // URL của API mà bạn muốn gọi. Key API được nhúng trực tiếp vào đây.
    const apiUrl = "https://wwproxy.com/api/client/proxy/available?key=" + api_key + "&provinceId=" + provinceId;

    try {
      console.log("Đang gửi yêu cầu đến API proxy...");

      // Thực hiện yêu cầu GET bằng fetch()
      const response = await fetch(apiUrl);

      // Kiểm tra xem phản hồi có thành công không (status code 200-299)
      if (!response.ok) {
        // Nếu không thành công, ném lỗi với status code và tin nhắn từ server nếu có
        const errorText = await response.text();
        return JSON.parse(errorText);
        // throw new Error(`Lỗi HTTP! Trạng thái: ${response.status} - ${response.statusText}. Phản hồi: ${errorText}`);
      }

      // Phân tích cú pháp phản hồi JSON
      const data = await response.json();

      console.log("Dữ liệu proxy đã được lấy thành công.");
      return data; // Trả về dữ liệu đã lấy được

    } catch (error) {
      // Xử lý bất kỳ lỗi nào xảy ra trong quá trình fetch
      console.error("Có lỗi xảy ra khi lấy dữ liệu proxy:", error.message);
      return null; // Trả về null khi có lỗi
    }
  }

  // Ghi chú: `provinceId=-1` thường có nghĩa là lấy tất cả các tỉnh.
  // Nếu bạn muốn lọc theo tỉnh cụ thể, bạn cần thay đổi giá trị này.
  // Ví dụ: `provinceId=1` cho một tỉnh cụ thể (bạn cần biết ID của tỉnh).

  // Throttle mechanism để ngăn request liên tục
  window.__getTMProxyInProgress = false;
  window.__getTMProxyLastTime = 0;
  window.__getTMProxyNextRequest = null; // ✅ Thời điểm tiếp theo được phép request (từ API)
  window.__getTMProxyRetryTimer = null;
  window.__getTMProxyRetryPending = false;
  window.__getTMProxyRetryCount = 0; // Theo dõi số lần retry
  window.__getTMProxyRequestPool = null; // Cache kết quả request hiện tại
  window.__getTMProxyCallbackQueue = []; // Queue callbacks khi request đang chạy
  const GET_TM_PROXY_MIN_INTERVAL = window.PROXY_CONFIG?.MIN_REQUEST_INTERVAL || 360000; // 6 phút minimum (per API requirement: 6 phút sử dụng tối thiểu)

  window.getTMProxy = async function (api_key, api_token_wwproxy, fn) {
    const now = Date.now();

    // ✅ Tối ưu 1: Nếu có cached request result VÀ chưa hết hạn, reuse nó
    // QUAN TRỌNG: Cache chỉ valid trong thời gian < GET_TM_PROXY_MIN_INTERVAL
    const cacheAge = window.__getTMProxyRequestPool ? (now - window.__getTMProxyRequestPool.timestamp) : Infinity;
    const isCacheValid = cacheAge < GET_TM_PROXY_MIN_INTERVAL;
    
    if (window.__getTMProxyRequestPool && isCacheValid) {
      console.log("✅ getTMProxy: Reusing cached proxy result (" + Math.ceil(cacheAge/1000) + "s old, valid for " + Math.ceil((GET_TM_PROXY_MIN_INTERVAL - cacheAge)/1000) + "s more)");
      fn(window.__getTMProxyRequestPool.data);
      return;
    }

    // ✅ Tối ưu 2: Nếu request đang chạy, subscribe vào kết quả
    if (window.__getTMProxyInProgress) {
      console.log("✅ getTMProxy đang chạy, chờ kết quả...");
      // Sử dụng callback queue để không block request
      if (!window.__getTMProxyCallbackQueue) {
        window.__getTMProxyCallbackQueue = [];
      }
      window.__getTMProxyCallbackQueue.push(fn);
      return;
    }

    // Nếu retry đã pending, skip (tránh tạo nhiều timeout)
    if (window.__getTMProxyRetryPending) {
      console.log("✅ getTMProxy retry đã pending, skip request mới");
      return;
    }

    // ✅ Tối ưu 3: Throttle - nhưng CHỈ KHI cache đã hết hạn
    // Nếu cache còn valid -> đã return ở trên
    // Nếu cache hết hạn -> cho phép gọi ngay, không cần chờ thêm
    const timeSinceLastRequest = now - window.__getTMProxyLastTime;
    if (timeSinceLastRequest < GET_TM_PROXY_MIN_INTERVAL && isCacheValid) {
      // Chỉ throttle nếu cache còn valid (tránh spam request)
      const delay = GET_TM_PROXY_MIN_INTERVAL - timeSinceLastRequest;
      console.log("⏳ getTMProxy throttled - chờ " + Math.ceil(delay/1000) + "s (" + Math.ceil(GET_TM_PROXY_MIN_INTERVAL/60000) + "phút minimum)");
      // Clear timeout cũ nếu có
      if (window.__getTMProxyRetryTimer) {
        clearTimeout(window.__getTMProxyRetryTimer);
      }
      window.__getTMProxyRetryPending = true;
      window.__getTMProxyRetryTimer = setTimeout(() => {
        window.__getTMProxyRetryPending = false;
        window.__getTMProxyRetryTimer = null;
        window.getTMProxy(api_key, api_token_wwproxy, fn);
      }, delay);
      return;
    }
    
    // Nếu cache đã hết hạn, cho phép gọi API ngay lập tức
    if (!isCacheValid) {
      console.log("🔄 Cache đã hết hạn (" + Math.ceil(cacheAge/1000) + "s old), gọi API lấy proxy mới ngay");
    }

    window.__getTMProxyInProgress = true;
    window.__getTMProxyLastTime = now;
    window.__getTMProxyRetryCount = 0; // Reset retry counter

    try {
      const proxyStatus = await proxy_status_check();
      console.log("Trạng thái proxy:" + proxyStatus);

      // Chỉ gọi proxy_deactivate() nếu proxy đang bật
      if (proxyStatus) {
        const deactivateStatus = await proxy_deactivate();
        if (!deactivateStatus) {
          console.warn("Không thể hủy kích hoạt proxy. Sẽ thử lại sau 60 giây.");
          window.__getTMProxyInProgress = false;
          setTimeout(() => { window.getTMProxy(api_key, api_token_wwproxy, fn); }, 60000);
          return; // Kết thúc hàm
        }
        // nw.App.setProxyConfig('');
        // console.log("Đã gọi hàm setProxy.");
      }
      // Thực hiện các bước còn lại sau khi đã đảm bảo proxy đã tắt
      try {
        if (api_token_wwproxy) {
          const proxies = await getAvailableProxiesWithTimeout(api_token_wwproxy, 1 * document.querySelector('#location_wwproxy').value);
          if (proxies) {
            console.log("✅ Danh sách proxy:", proxies);
            // ✅ Cache kết quả để tái sử dụng
            window.__getTMProxyRequestPool = {
              data: proxies,
              timestamp: Date.now()
            };
            fn(proxies);
          } else {
            console.warn("❌ Không thể lấy dữ liệu proxy.");
            fn({error: 'Failed to get proxies', code: -1});
          }
        }
        else if (api_key) {
          const response = await fetchWithTimeout("https://tmproxy.com/api/proxy/get-new-proxy", {
            headers: {
              'Accept': 'application/json',
              'Content-Type': 'application/json',
              'Connection': 'keep-alive' // ✅ Keep-alive để tái sử dụng kết nối
            },
            method: "POST",
            body: JSON.stringify({
              api_key: api_key,
              id_location: 1 * document.querySelector('#location').value
            })
          }, window.PROXY_CONFIG.CONNECTION_TIMEOUT);
          const data = await response.json();
          console.log("✅ Proxy API response:", data);
          // ✅ Cache kết quả để tái sử dụng
          window.__getTMProxyRequestPool = {
            data: data,
            timestamp: Date.now()
          };
          fn(data);
        }
      } catch (error) {
        console.error("Lỗi khi lấy proxy mới:", error);
        fn(false);
      }
    } catch (error) {
      console.error("❌ Lỗi trong quá trình xử lý proxy:", error);
      // ✅ Tối ưu 4: Retry mechanism với exponential backoff
      if (window.__getTMProxyRetryCount < window.PROXY_CONFIG.RETRY_ATTEMPTS) {
        window.__getTMProxyRetryCount++;
        const retryDelay = window.PROXY_CONFIG.RETRY_DELAY * window.__getTMProxyRetryCount;
        console.log("⏳ Retry " + window.__getTMProxyRetryCount + "/" + window.PROXY_CONFIG.RETRY_ATTEMPTS + " sau " + (retryDelay/1000) + "s");
        setTimeout(() => { window.getTMProxy(api_key, api_token_wwproxy, fn); }, retryDelay);
      } else {
        console.error("❌ Đã retry " + window.PROXY_CONFIG.RETRY_ATTEMPTS + " lần, vẫn lỗi. Chờ " + (GET_TM_PROXY_MIN_INTERVAL/60000) + " phút trước retry tiếp");
        setTimeout(() => { window.getTMProxy(api_key, api_token_wwproxy, fn); }, GET_TM_PROXY_MIN_INTERVAL);
      }
    } finally {
      window.__getTMProxyInProgress = false;
      // ✅ Thực thi tất cả pending callbacks
      if (window.__getTMProxyCallbackQueue && window.__getTMProxyCallbackQueue.length > 0) {
        const callbacks = window.__getTMProxyCallbackQueue;
        window.__getTMProxyCallbackQueue = [];
        callbacks.forEach(cb => {
          try {
            if (window.__getTMProxyRequestPool) {
              cb(window.__getTMProxyRequestPool.data);
            }
          } catch (e) {
            console.error("❌ Lỗi khi execute callback:", e);
          }
        });
      }
    }
  };

  // ✅ Helper function: Fetch với timeout
  window.fetchWithTimeout = function(url, options, timeout) {
    return Promise.race([
      fetch(url, options),
      new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Fetch timeout')), timeout)
      )
    ]);
  };

  // ✅ Helper function: getAvailableProxies với timeout
  window.getAvailableProxiesWithTimeout = async function(api_token, location) {
    try {
      return await Promise.race([
        getAvailableProxies(api_token, location),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('getAvailableProxies timeout')), window.PROXY_CONFIG.READ_TIMEOUT)
        )
      ]);
    } catch (error) {
      console.error("❌ getAvailableProxies timeout/error:", error);
      return null;
    }
  };
  window.fnRemoveTab = function (id_tab) {
    try {
        if (!id_tab)
            return false;
        
        console.log(`[fnRemoveTab] 🗑️ Bắt đầu đóng tab và xóa toàn bộ dữ liệu: ${id_tab}`);
        
        // 1. Lấy reference webview và partition info
        const webview = document.querySelector('#U_' + id_tab);
        let partitionId = null;
        
        if (webview) {
            // Lấy partition ID từ webview attribute
            const partition = webview.getAttribute('partition');
            if (partition) {
                partitionId = partition.replace('persist:', '');
                console.log(`[fnRemoveTab] 📦 Partition ID: ${partitionId}`);
            }
            
            const webviewId = 'U_' + id_tab;
            
            // BƯỚC 1: Stop tất cả hoạt động của webview
            console.log(`[fnRemoveTab] ⏹️ Stop webview...`);
            try {
                // Stop loading
                if (typeof webview.stop === 'function') {
                    webview.stop();
                }
                // Set blank để giải phóng tài nguyên
                webview.src = 'about:blank';
            } catch (stopErr) {
                console.warn(`[fnRemoveTab] ⚠️ Lỗi khi stop webview:`, stopErr.message);
            }
            
            // BƯỚC 2: Clear toàn bộ browsing data NGAY LẬP TỨC (cả in-memory và disk)
            // Sử dụng getStoragePartition() + clearData() theo NW.js API
            console.log(`[fnRemoveTab] 🧹 Xóa browsing data CỦA WEBVIEW...`);
            try {
                // Cách 1: webview.clearData() (tương thích NW.js)
                if (typeof webview.clearData === 'function') {
                    webview.clearData(
                        { since: 0 }, // Xóa tất cả từ đầu (chỉ của webview này)
                        {
                            appcache: true,
                            cache: true,
                            cookies: true,
                            fileSystems: true,
                            indexedDB: true,
                            localStorage: true,
                            webSQL: true
                        },
                        () => {
                            console.log(`[fnRemoveTab] ✅ Đã xóa browsing data cho ${id_tab}`);
                        }
                    );
                }
                // Cách 2: getStoragePartition() (NW.js Chromium API)
                else if (typeof webview.getStoragePartition === 'function') {
                    const storagePartition = webview.getStoragePartition();
                    if (storagePartition && typeof storagePartition.clearData === 'function') {
                        storagePartition.clearData(
                            { since: 0 },
                            {
                                appcache: true,
                                cache: true,
                                cookies: true,
                                fileSystems: true,
                                indexedDB: true,
                                localStorage: true,
                                webSQL: true
                            },
                            () => {
                                console.log(`[fnRemoveTab] ✅ Đã xóa storage partition data cho ${id_tab}`);
                            }
                        );
                    }
                }
            } catch (clearErr) {
                console.warn(`[fnRemoveTab] ⚠️ Lỗi clearData:`, clearErr.message);
            }
            
            // BƯỚC 3: Remove tất cả event listeners
            console.log(`[fnRemoveTab] 🔌 Remove event listeners...`);
            try {
                // Tạo empty handler để remove
                const emptyHandler = function() {};
                const events = ['did-fail-load', 'dom-ready', 'exit', 'dialog', 'consolemessage', 
                               'loadabort', 'loadstop', 'loadstart', 'loadcommit', 'contentload',
                               'close', 'crashed', 'destroyed', 'newwindow', 'permissionrequest'];
                
                events.forEach(eventName => {
                    try {
                        webview.removeEventListener(eventName, emptyHandler);
                    } catch(e) {}
                });
            } catch (eventErr) {
                console.warn(`[fnRemoveTab] ⚠️ Lỗi remove listeners:`, eventErr.message);
            }
            
            // BƯỚC 4: Terminate webview process (quan trọng!)
            console.log(`[fnRemoveTab] 💀 Terminate webview process...`);
            try {
                if (typeof webview.terminate === 'function') {
                    webview.terminate();
                    console.log(`[fnRemoveTab] ✅ Process terminated`);
                }
            } catch (termErr) {
                console.warn(`[fnRemoveTab] ⚠️ Lỗi terminate:`, termErr.message);
            }
            
            // BƯỚC 5: Remove DOM element
            console.log(`[fnRemoveTab] 🗑️ Remove DOM element...`);
            webview.remove();
            
            // BƯỚC 6: Gọi fnClearWebviewCache để xóa partition storage files
            console.log(`[fnRemoveTab] 🧹 Xóa partition storage files...`);
            if (typeof fnClearWebviewCache === 'function') {
                // Delay 500ms để đảm bảo webview đã terminate hoàn toàn
                setTimeout(() => {
                    fnClearWebviewCache(webviewId, true); // true = force cleanup
                    console.log(`[fnRemoveTab] ✅ Đã gọi fnClearWebviewCache`);
                }, 500);
            }
        }
        
        // 2. Xóa panelItem (container chứa header, content, webview)
        const panelItem = document.querySelector('#' + id_tab);
        if (panelItem) {
            console.log(`[fnRemoveTab] 🗑️ Remove panel container...`);
            
            // Remove close button listener
            const closeBtn = panelItem.querySelector('button');
            if (closeBtn) {
                const clone = closeBtn.cloneNode(true);
                closeBtn.parentNode.replaceChild(clone, closeBtn);
            }
            
            // Remove toàn bộ panelItem
            panelItem.remove();
            console.log(`[fnRemoveTab] ✅ Removed panel container`);
        }
        
        // 3. Fallback: Remove theo selector cũ (backward compatibility)
        const oldStylePanel = document.querySelector('#context-auto .card-body #' + id_tab);
        if (oldStylePanel) {
            oldStylePanel.remove();
        }
        
        // 4. Clean up global references
        console.log(`[fnRemoveTab] 🧹 Clean up global references...`);
        if (window[`customTabListeners_${id_tab}`]) {
            delete window[`customTabListeners_${id_tab}`];
        }
        
        // 5. Xóa thư mục partition storage files từ filesystem (nếu có partitionId)
        if (partitionId && window.hasOwnProperty('process')) {
            setTimeout(() => {
                try {
                    const fs = require('fs');
                    const Path = require('path');
                    const gui = require('nw.gui');
                    
                    const userDataPath = gui.App.dataPath;
                    const storagePath = Path.join(userDataPath, 'Default', 'Storage', 'ext', partitionId);
                    
                    if (fs.existsSync(storagePath)) {
                        console.log(`[fnRemoveTab] 🗑️ Xóa thư mục Storage/ext/${partitionId}...`);
                        deleteFolderRecursive(storagePath);
                        console.log(`[fnRemoveTab] ✅ Đã xóa thư mục partition storage`);
                    }
                } catch (fsErr) {
                    console.warn(`[fnRemoveTab] ⚠️ Lỗi xóa partition folder:`, fsErr.message);
                }
            }, 1000); // Delay 1s để đảm bảo process đã dừng hoàn toàn
        }
        
        // Cập nhật TabManager nếu đang dùng
        if (window.TabManager && typeof window.TabManager.removeTab === 'function') {
            window.TabManager.removeTab(id_tab);
        }
        
        console.log(`[fnRemoveTab] ✅ Hoàn tất đóng tab và xóa toàn bộ dữ liệu: ${id_tab}`);
        
    } catch (err) {
        console.error(`[fnRemoveTab] ❌ Lỗi nghiêm trọng khi đóng tab ${id_tab}:`, err.message, err.stack);
        
        // CRITICAL RETRY: Đảm bảo ít nhất DOM element bị xóa
        setTimeout(() => {
            try {
                console.log(`[fnRemoveTab] 🔄 Retry cleanup cho ${id_tab}...`);
                
                const webview = document.querySelector('#U_' + id_tab);
                if (webview) {
                    try {
                        webview.src = 'about:blank';
                        if (typeof webview.terminate === 'function') webview.terminate();
                    } catch(e) {}
                    webview.remove();
                }
                
                const panel = document.querySelector('#' + id_tab);
                if (panel) panel.remove();
                
                console.log(`[fnRemoveTab] ✅ Retry cleanup thành công`);
            } catch (retryErr) {
                console.error(`[fnRemoveTab] ❌ Retry cleanup thất bại:`, retryErr.message);
            }
        }, 1000);
    }
  }
  var strFB_Agen = '{"0":"Mozilla/5.0 (iPhone; CPU iPhone OS 7_1 like Mac OS X) AppleWebKit/537.51.2 (KHTML, like Gecko) Mobile/11D167 [FBAN/FBIOS;FBAV/8.0.0.28.18;FBBV/1665515;FBDV/iPhone5,2;FBMD/iPhone;FBSN/iPhone OS;FBSV/7.1;FBSS/2; FBCR/","1":"Mozilla/5.0 (iPhone; CPU iPhone OS 9_3_2 like Mac OS X) AppleWebKit/601.1.46 (KHTML, like Gecko) Mobile/13F69 [FBAN/FBIOS;FBAV/59.0.0.51.142;FBBV/33266808;FBRV/0;FBDV/iPhone7,1;FBMD/iPhone;FBSN/iPhone OS;FBSV/9.3.2;FBSS/3;FBCR/Telkomsel;FBID/phone;FBLC/en_US;FBOP/5] evaliant","2":"Mozilla/5.0 (iPhone; CPU iPhone OS 9_3_2 like Mac OS X) AppleWebKit/601.1.46 (KHTML, like Gecko) Mobile/13F69 [FBAN/FBIOS;FBAV/59.0.0.51.142;FBBV/33266808;FBRV/0;FBDV/iPhone7,1;FBMD/iPhone;FBSN/iPhone OS;FBSV/9.3.2;FBSS/3;FBCR/Telkomsel;FBID/phone;FBLC/en_US;FBOP/5]","3":"Mozilla/5.0 (iPad; CPU OS 6_0_1 like Mac OS X) AppleWebKit/536.26 (KHTML, like Gecko) Mobile/10A523 [FBAN/FBIOS;FBAV/6.0.1;FBBV/180945;FBDV/iPad2,1;FBMD/iPad;FBSN/iPhone OS;FBSV/6.0.1;FBSS/1; FBCR/;FBID/tablet;FBLC/en_US;FBOP/1]","4":"Mozilla/5.0 (iPhone; CPU iPhone OS 6_0_1 like Mac OS X) AppleWebKit/536.26 (KHTML, like Gecko) Mobile/10A523 [FBAN/FBIOS;FBAV/6.0.1;FBBV/180945;FBDV/iPhone3,2;FBMD/iPhone;FBSN/iPhone OS;FBSV/6.0.1;FBSS/2; FBCR/AT&T;FBID/phone;FBLC/en_US;FBOP/1]","5":"Mozilla/5.0 (iPad; U; CPU OS 4_3 like Mac OS X; en-us) AppleWebKit/533.17.9 (KHTML, like Gecko) Mobile/8F191 [FBAN/FBIOS;FBAV/5.2.2;FBBV/82131;FBDV/iPad2,1;FBMD/iPad;FBSN/iPhone OS;FBSV/4.3;FBSS/1; FBCR/;FBID/tablet;FBLC/en_US]","6":"Mozilla/5.0 (iPhone; CPU iPhone OS 10_3_1 like Mac OS X) AppleWebKit/603.1.30 (KHTML, like Gecko) Mobile/14E304 [FBAN/FBIOS;FBAV/136.0.0.29.91;FBBV/67565708;FBDV/iPhone7,2;FBMD/iPhone;FBSN/iOS;FBSV/10.3.1;FBSS/2;FBCR/Verizon;FBID/phone;FBLC/en_US;FBOP/5;FBRV/68343122]","7":"Mozilla/5.0 (iPhone; CPU iPhone OS 6_1_3 like Mac OS X) AppleWebKit/536.26 (KHTML, like Gecko) Mobile/10B329 [FBAN/FBIOS;FBAV/6.0.2;FBBV/183159;FBDV/iPhone4,1;FBMD/iPhone;FBSN/iPhone OS;FBSV/6.1.3;FBSS/2; FBCR/AT&T;FBID/phone;FBLC/en_US;FBOP/1]","8":"Mozilla/5.0 (iPhone; CPU iPhone OS 7_1_2 like Mac OS X) AppleWebKit/537.51.2 (KHTML, like Gecko) Mobile/11D257 [FBAN/FBIOS;FBAV/12.1.0.24.20;FBBV/3214247;FBDV/iPhone6,1;FBMD/iPhone;FBSN/iPhone OS;FBSV/7.1.2;FBSS/2; FBCR/AT&T;FBID/phone;FBLC/en_US;FBOP/5]","9":"Mozilla/5.0 (iPad; CPU OS 6_1_3 like Mac OS X) AppleWebKit/536.26 (KHTML, like Gecko) Mobile/10B329 [FBAN/FBIOS;FBAV/6.0.2;FBBV/183159;FBDV/iPad2,2;FBMD/iPad;FBSN/iPhone OS;FBSV/6.1.3;FBSS/1; FBCR/AT&T;FBID/tablet;FBLC/en_US;FBOP/1]","10":"Mozilla/5.0 (iPhone; CPU iPhone OS 6_1_3 like Mac OS X) AppleWebKit/536.26 (KHTML, like Gecko) Mobile/10B329 [FBAN/FBIOS;FBAV/5.6;FBBV/144493;FBDV/iPhone4,1;FBMD/iPhone;FBSN/iPhone OS;FBSV/6.1.3;FBSS/2; FBCR/Sprint;FBID/phone;FBLC/en_US;FBOP/0]","11":"Mozilla/5.0 (iPad; CPU OS 6_1_3 like Mac OS X) AppleWebKit/536.26 (KHTML, like Gecko) Mobile/10B329 [FBAN/FBIOS;FBAV/6.1.1;FBBV/202949;FBDV/iPad3,2;FBMD/iPad;FBSN/iPhone OS;FBSV/6.1.3;FBSS/2; FBCR/Verizon;FBID/tablet;FBLC/en_US;FBOP/1]","12":"Mozilla/5.0 (iPad; CPU OS 6_1_3 like Mac OS X) AppleWebKit/536.26 (KHTML, like Gecko) Mobile/10B329 [FBAN/FBIOS;FBAV/6.0.2;FBBV/183159;FBDV/iPad2,1;FBMD/iPad;FBSN/iPhone OS;FBSV/6.1.3;FBSS/1; FBCR/;FBID/tablet;FBLC/en_US;FBOP/1]","13":"Mozilla/5.0 (iPhone; CPU iPhone OS 7_1_2 like Mac OS X) AppleWebKit/537.51.2 (KHTML, like Gecko) Mobile/11D257 [FBAN/FBIOS;FBAV/12.1.0.24.20;FBBV/3214247;FBDV/iPhone6,1;FBMD/iPhone;FBSN/iPhone OS;FBSV/7.1.2;FBSS/2; FBCR/Verizon;FBID/phone;FBLC/en_US;FBOP/5]","14":"Mozilla/5.0 (iPhone; CPU iPhone OS 6_1_3 like Mac OS X) AppleWebKit/536.26 (KHTML, like Gecko) Mobile/10B329 [FBAN/FBIOS;FBAV/6.1.1;FBBV/202949;FBDV/iPhone4,1;FBMD/iPhone;FBSN/iPhone OS;FBSV/6.1.3;FBSS/2; FBCR/AT&T;FBID/phone;FBLC/en_US;FBOP/1]","15":"Mozilla/5.0 (iPad; CPU OS 6_1_3 like Mac OS X) AppleWebKit/536.26 (KHTML, like Gecko) Mobile/10B329 [FBAN/FBIOS;FBAV/6.0.2;FBBV/183159;FBDV/iPad2,3;FBMD/iPad;FBSN/iPhone OS;FBSV/6.1.3;FBSS/1; FBCR/Verizon;FBID/tablet;FBLC/en_US;FBOP/1]","16":"Mozilla/5.0 (iPhone; CPU iPhone OS 10_3_3 like Mac OS X) AppleWebKit/603.3.8 (KHTML, like Gecko) Mobile/14G60 [FBAN/FBIOS;FBAV/136.0.0.29.91;FBBV/67565708;FBDV/iPhone9,2;FBMD/iPhone;FBSN/iOS;FBSV/10.3.3;FBSS/3;FBCR/Sprint;FBID/phone;FBLC/en_US;FBOP/5;FBRV/0]","17":"Mozilla/5.0 (iPhone; CPU iPhone OS 7_1_1 like Mac OS X) AppleWebKit/537.51.2 (KHTML, like Gecko) Mobile/11D201 [FBAN/FBIOS;FBAV/12.1.0.24.20;FBBV/3214247;FBDV/iPhone6,1;FBMD/iPhone;FBSN/iPhone OS;FBSV/7.1.1;FBSS/2; FBCR/Verizon;FBID/phone;FBLC/en_US;FBOP/5]","18":"Mozilla/5.0 (iPhone; CPU iPhone OS 6_1_3 like Mac OS X) AppleWebKit/536.26 (KHTML, like Gecko) Mobile/10B329 [FBAN/FBIOS;FBAV/6.1.1;FBBV/202949;FBDV/iPhone4,1;FBMD/iPhone;FBSN/iPhone OS;FBSV/6.1.3;FBSS/2; FBCR/Verizon;FBID/phone;FBLC/en_US;FBOP/1]","19":"Mozilla/5.0 (iPad; CPU OS 6_0_1 like Mac OS X) AppleWebKit/536.26 (KHTML, like Gecko) Mobile/10A8426 [FBAN/FBIOS;FBAV/5.3;FBBV/89182;FBDV/iPad3,6;FBMD/iPad;FBSN/iPhone OS;FBSV/6.0.1;FBSS/2; FBCR/Verizon;FBID/tablet;FBLC/en_US]","20":"Mozilla/5.0 (iPhone; CPU iPhone OS 6_1_3 like Mac OS X) AppleWebKit/536.26 (KHTML, like Gecko) Mobile/10B329 [FBAN/FBIOS;FBAV/5.6;FBBV/144493;FBDV/iPhone5,2;FBMD/iPhone;FBSN/iPhone OS;FBSV/6.1.3;FBSS/2; FBCR/Verizon;FBID/phone;FBLC/en_US;FBOP/0]","21":"Mozilla/5.0 (iPhone; CPU iPhone OS 7_1_2 like Mac OS X) AppleWebKit/537.51.2 (KHTML, like Gecko) Mobile/11D257 [FBAN/FBIOS;FBAV/12.1.0.24.20;FBBV/3214247;FBDV/iPhone5,3;FBMD/iPhone;FBSN/iPhone OS;FBSV/7.1.2;FBSS/2; FBCR/Verizon;FBID/phone;FBLC/en_US;FBOP/5]","22":"Mozilla/5.0 (iPhone; CPU iPhone OS 6_1_3 like Mac OS X) AppleWebKit/536.26 (KHTML, like Gecko) Mobile/10B329 [FBAN/FBIOS;FBAV/6.0.2;FBBV/183159;FBDV/iPhone4,1;FBMD/iPhone;FBSN/iPhone OS;FBSV/6.1.3;FBSS/2; FBCR/Verizon;FBID/phone;FBLC/en_US;FBOP/1]","23":"Mozilla/5.0 (iPhone; CPU iPhone OS 9_3_2 like Mac OS X) AppleWebKit/601.1.46 (KHTML, like Gecko) Mobile/13F69 [FBAN/FBIOS;FBAV/58.0.0.49.140;FBBV/32437772;FBRV/0;FBDV/iPhone7,1;FBMD/iPhone;FBSN/iPhone OS;FBSV/9.3.2;FBSS/3;FBCR/Rogers;FBID/phone;FBLC/en_US;FBOP/5]","24":"Mozilla/5.0 (iPad; U; CPU iPhone OS 4_3_5 like Mac OS X; en_US) AppleWebKit (KHTML, like Gecko) Mobile [FBAN/FBForIPhone;FBAV/4.1.1;FBBV/4110.0;FBDV/iPad2,1;FBMD/iPad;FBSN/iPhone OS;FBSV/4.3.5;FBSS/1; FBCR/;FBID/tablet;FBLC/en_US;FBSF/1.0]","25":"Mozilla/5.0 (iPhone; CPU iPhone OS 7_1_2 like Mac OS X) AppleWebKit/537.51.2 (KHTML, like Gecko) Mobile/11D257 [FBAN/FBIOS;FBAV/12.1.0.24.20;FBBV/3214247;FBDV/iPhone5,2;FBMD/iPhone;FBSN/iPhone OS;FBSV/7.1.2;FBSS/2; FBCR/Verizon;FBID/phone;FBLC/en_US;FBOP/5]","26":"Mozilla/5.0 (iPad; CPU OS 6_1_3 like Mac OS X) AppleWebKit/536.26 (KHTML, like Gecko) Mobile/10B329 [FBAN/FBIOS;FBAV/6.0.2;FBBV/183159;FBDV/iPad3,1;FBMD/iPad;FBSN/iPhone OS;FBSV/6.1.3;FBSS/2; FBCR/;FBID/tablet;FBLC/en_US;FBOP/1]","27":"Mozilla/5.0 (iPad; CPU OS 6_1_3 like Mac OS X) AppleWebKit/536.26 (KHTML, like Gecko) Mobile/10B329 [FBAN/FBIOS;FBAV/5.6;FBBV/144493;FBDV/iPad2,3;FBMD/iPad;FBSN/iPhone OS;FBSV/6.1.3;FBSS/1; FBCR/Verizon;FBID/tablet;FBLC/en_US;FBOP/0]","28":"Mozilla/5.0 (iPhone; CPU iPhone OS 7_1_1 like Mac OS X) AppleWebKit/537.51.2 (KHTML, like Gecko) Mobile/11D201 [FBAN/MessengerForiOS;FBAV/5.1.0.35.2;FBBV/2418522;FBDV/iPhone3,2;FBMD/iPhone;FBSN/iPhone OS;FBSV/7.1.1;FBSS/2; FBCR/AT&T;FBID/phone;FBLC/en_US;FBOP/5]","29":"Mozilla/5.0 (iPhone; CPU iPhone OS 6_1_3 like Mac OS X) AppleWebKit/536.26 (KHTML, like Gecko) Mobile/10B329 [FBAN/FBIOS;FBAV/6.0.2;FBBV/183159;FBDV/iPhone5,2;FBMD/iPhone;FBSN/iPhone OS;FBSV/6.1.3;FBSS/2; FBCR/Verizon;FBID/phone;FBLC/en_US;FBOP/1]","30":"Mozilla/5.0 (iPad; CPU OS 9_3_2 like Mac OS X) AppleWebKit/601.1.46 (KHTML, like Gecko) Mobile/13F69 [FBAN/MessengerForiOS;FBAV/79.0.0.26.69;FBBV/33551959;FBRV/0;FBDV/iPad2,5;FBMD/iPad;FBSN/iPhone OS;FBSV/9.3.2;FBSS/1;FBCR/;FBID/tablet;FBLC/en_GB;FBOP/5]","31":"Mozilla/5.0 (iPad; CPU OS 6_1_3 like Mac OS X) AppleWebKit/536.26 (KHTML, like Gecko) Mobile/10B329 [FBAN/FBIOS;FBAV/6.1.1;FBBV/202949;FBDV/iPad2,5;FBMD/iPad;FBSN/iPhone OS;FBSV/6.1.3;FBSS/1; FBCR/;FBID/tablet;FBLC/en_US;FBOP/1]","32":"Mozilla/5.0 (iPad; CPU OS 6_1_3 like Mac OS X) AppleWebKit/536.26 (KHTML, like Gecko) Mobile/10B329 [FBAN/FBIOS;FBAV/6.0.2;FBBV/183159;FBDV/iPad2,5;FBMD/iPad;FBSN/iPhone OS;FBSV/6.1.3;FBSS/1; FBCR/;FBID/tablet;FBLC/en_US;FBOP/1]","33":"Mozilla/5.0 (iPad; CPU OS 6_1_2 like Mac OS X) AppleWebKit/536.26 (KHTML, like Gecko) Mobile/10B146 [FBAN/FBIOS;FBAV/5.5;FBBV/123337;FBDV/iPad3,1;FBMD/iPad;FBSN/iPhone OS;FBSV/6.1.2;FBSS/2; FBCR/;FBID/tablet;FBLC/en_US;FBOP/0]","34":"Mozilla/5.0 (iPad; CPU OS 6_1_3 like Mac OS X) AppleWebKit/536.26 (KHTML, like Gecko) Mobile/10B329 [FBAN/FBIOS;FBAV/6.0.2;FBBV/183159;FBDV/iPad3,4;FBMD/iPad;FBSN/iPhone OS;FBSV/6.1.3;FBSS/2; FBCR/;FBID/tablet;FBLC/en_US;FBOP/1]","35":"Mozilla/5.0 (iPad; CPU OS 6_1_3 like Mac OS X) AppleWebKit/536.26 (KHTML, like Gecko) Mobile/10B329 [FBAN/FBIOS;FBAV/5.6;FBBV/144493;FBDV/iPad3,1;FBMD/iPad;FBSN/iPhone OS;FBSV/6.1.3;FBSS/2; FBCR/;FBID/tablet;FBLC/en_US;FBOP/0]","36":"Mozilla/5.0 (iPhone; CPU iPhone OS 7_1_2 like Mac OS X) AppleWebKit/537.51.2 (KHTML, like Gecko) Mobile/11D257 [FBAN/FBIOS;FBAV/12.1.0.24.20;FBBV/3214247;FBDV/iPhone4,1;FBMD/iPhone;FBSN/iPhone OS;FBSV/7.1.2;FBSS/2; FBCR/Verizon;FBID/phone;FBLC/en_US;FBOP/5]","37":"Mozilla/5.0 (iPad; CPU OS 10_3_3 like Mac OS X) AppleWebKit/603.3.8 (KHTML, like Gecko) Mobile/14G60 [FBAN/FBIOS;FBAV/136.0.0.29.91;FBBV/67565708;FBDV/iPad6,4;FBMD/iPad;FBSN/iOS;FBSV/10.3.3;FBSS/2;FBCR/AT&T;FBID/tablet;FBLC/en_US;FBOP/5;FBRV/0]","38":"Mozilla/5.0 (iPad; CPU OS 6_1_3 like Mac OS X) AppleWebKit/536.26 (KHTML, like Gecko) Mobile/10B329 [FBAN/FBIOS;FBAV/6.1.1;FBBV/202949;FBDV/iPad2,1;FBMD/iPad;FBSN/iPhone OS;FBSV/6.1.3;FBSS/1; FBCR/;FBID/tablet;FBLC/en_US;FBOP/1]","39":"Mozilla/5.0 (iPad; CPU OS 6_1_3 like Mac OS X) AppleWebKit/536.26 (KHTML, like Gecko) Mobile/10B329 [FBAN/FBIOS;FBAV/6.0.2;FBBV/183159;FBDV/iPad2,2;FBMD/iPad;FBSN/iPhone OS;FBSV/6.1.3;FBSS/1; FBCR/Telstra;FBID/tablet;FBLC/en_US;FBOP/1]","40":"Mozilla/5.0 (iPad; CPU OS 6_0_1 like Mac OS X) AppleWebKit/536.26 (KHTML, like Gecko) Mobile/10A523 [FBAN/FBIOS;FBAV/5.5;FBBV/123337;FBDV/iPad2,2;FBMD/iPad;FBSN/iPhone OS;FBSV/6.0.1;FBSS/1; FBCR/O2;FBID/tablet;FBLC/en_US;FBOP/0]","41":"Mozilla/5.0 (iPhone; CPU iPhone OS 6_1 like Mac OS X) AppleWebKit/536.26 (KHTML, like Gecko) Mobile/10B144 [FBAN/FBIOS;FBAV/5.4.2;FBBV/114387;FBDV/iPhone3,1;FBMD/iPhone;FBSN/iPhone OS;FBSV/6.1;FBSS/2; FBCR/MTS;FBID/phone;FBLC/en_US]","42":"Mozilla/5.0 (iPad; CPU OS 6_1_3 like Mac OS X) AppleWebKit/536.26 (KHTML, like Gecko) Mobile/10B329 [FBAN/FBIOS;FBAV/5.3;FBBV/89182;FBDV/iPad2,2;FBMD/iPad;FBSN/iPhone OS;FBSV/6.1.3;FBSS/1; FBCR/OPTUS;FBID/tablet;FBLC/en_US]","43":"Mozilla/5.0 (iPad; CPU OS 6_1_3 like Mac OS X) AppleWebKit/536.26 (KHTML, like Gecko) Mobile/10B329 [FBAN/FBIOS;FBAV/5.5;FBBV/123337;FBDV/iPad2,3;FBMD/iPad;FBSN/iPhone OS;FBSV/6.1.3;FBSS/1; FBCR/Verizon;FBID/tablet;FBLC/en_US;FBOP/0]","44":"Mozilla/5.0 (iPhone; CPU iPhone OS 7_1_1 like Mac OS X) AppleWebKit/537.51.2 (KHTML, like Gecko) Mobile/11D201 [FBAN/FBIOS;FBAV/12.1.0.24.20;FBBV/3214247;FBDV/iPhone6,1;FBMD/iPhone;FBSN/iPhone OS;FBSV/7.1.1;FBSS/2; FBCR/AT&T;FBID/phone;FBLC/en_US;FBOP/5]","45":"Mozilla/5.0 (iPhone; CPU iPhone OS 8_1_1 like Mac OS X) AppleWebKit/600.1.4 (KHTML, like Gecko) Mobile/12B436 [FBAN/FBIOS;FBAV/18.1.0.14.11;FBBV/5295262;FBDV/iPhone7,2;FBMD/iPhone;FBSN/iPhone OS;FBSV/8.1.1;FBSS/2; FBCR/Sprint;FBID/phone;FBLC/en_US;FBOP/5]","46":"Mozilla/5.0 (iPad; CPU OS 5_1_1 like Mac OS X) AppleWebKit/534.46 (KHTML, like Gecko) Mobile/9B206 [FBAN/FBIOS;FBAV/5.2.1;FBBV/79939;FBDV/iPad3,3;FBMD/iPad;FBSN/iPhone OS;FBSV/5.1.1;FBSS/2; FBCR/;FBID/tablet;FBLC/en_US]","47":"Mozilla/5.0 (iPhone; CPU iPhone OS 8_0_2 like Mac OS X) AppleWebKit/600.1.4 (KHTML, like Gecko) Mobile/12A405 [FBAN/FBIOS;FBAV/16.0.0.13.22;FBBV/4697910;FBDV/iPhone5,1;FBMD/iPhone;FBSN/iPhone OS;FBSV/8.0.2;FBSS/2; FBCR/AT&T;FBID/phone;FBLC/en_US;FBOP/5]","48":"Mozilla/5.0 (iPhone; CPU iPhone OS 7_1_1 like Mac OS X) AppleWebKit/537.51.2 (KHTML, like Gecko) Mobile/11D201 [FBAN/MessengerForiOS;FBAV/10.0.0.13.15;FBBV/3763173;FBDV/iPhone6,1;FBMD/iPhone;FBSN/iPhone OS;FBSV/7.1.1;FBSS/2; FBCR/Telcel;FBID/phone;FBLC/es_ES;FBOP/5]","49":"Mozilla/5.0 (iPhone; CPU iPhone OS 10_3_3 like Mac OS X) AppleWebKit/603.3.8 (KHTML, like Gecko) Mobile/14G60 [FBAN/FBIOS;FBAV/136.0.0.29.91;FBBV/67565708;FBDV/iPhone9,4;FBMD/iPhone;FBSN/iOS;FBSV/10.3.3;FBSS/3;FBCR/AT&T;FBID/phone;FBLC/en_US;FBOP/5;FBRV/0]","50":"Mozilla/5.0 (iPhone; CPU iPhone OS 6_1_3 like Mac OS X) AppleWebKit/536.26 (KHTML, like Gecko) Mobile/10B329 [FBAN/FBIOS;FBAV/6.0.2;FBBV/183159;FBDV/iPhone5,1;FBMD/iPhone;FBSN/iPhone OS;FBSV/6.1.3;FBSS/2; FBCR/AT&T;FBID/phone;FBLC/en_US;FBOP/1]"}';
  strFB_Agen = '{"0":"Mozilla/5.0 (iPhone; CPU iPhone OS 9_1 like Mac OS X) AppleWebKit/601.1.46 (KHTML","1":" like Gecko) Version/9.0 Mobile/13B143 Safari/601.1","2":"Mozilla/5.0 (iPhone; CPU iPhone OS 10_2_1 like Mac OS X) AppleWebKit/602.4.6 (KHTML","3":" like Gecko) Version/10.0 Mobile/14D27 Safari/602.1","4":"Mozilla/5.0 (iPhone; CPU iPhone OS 9_3 like Mac OS X) AppleWebKit/601.1.46 (KHTML","5":" like Gecko) Version/9.0 Mobile/13E188a Safari/601.1","6":"Mozilla/5.0 (iPhone; CPU iPhone OS 8_1 like Mac OS X) AppleWebKit/600.1.4 (KHTML","7":" like Gecko) Version/8.0 Mobile/12B410 Safari/600.1.4","8":"Mozilla/5.0 (iPhone; CPU iPhone OS 9_3_2 like Mac OS X) AppleWebKit/601.1.46 (KHTML","9":" like Gecko) Version/9.0 Mobile/13F69 Safari/601.1","10":"Mozilla/5.0 (iPhone; CPU iPhone OS 9_3_1 like Mac OS X) AppleWebKit/601.1.46 (KHTML","11":" like Gecko) Version/9.0 Mobile/13E238 Safari/601.1","12":"Mozilla/5.0 (iPhone; CPU iPhone OS 9_2_1 like Mac OS X) AppleWebKit/601.1.46 (KHTML","13":" like Gecko) Version/9.0 Mobile/13D15 Safari/601.1","14":"Mozilla/5.0 (iPhone; CPU iPhone OS 10_2 like Mac OS X) AppleWebKit/602.3.12 (KHTML","15":" like Gecko) Version/10.0 Mobile/14C92 Safari/602.1","16":"Mozilla/5.0 (iPhone; CPU iPhone OS 10_1_1 like Mac OS X) AppleWebKit/602.2.14 (KHTML","17":" like Gecko) Version/10.0 Mobile/14B100 Safari/602.1","18":"Mozilla/5.0 (iPhone; CPU iPhone OS 10_0_2 like Mac OS X) AppleWebKit/602.1.50 (KHTML","19":" like Gecko) Version/10.0 Mobile/14A456 Safari/602.1","20":"Mozilla/5.0 (iPhone; CPU iPhone OS 10_3_3 like Mac OS X) AppleWebKit/603.3.8 (KHTML","21":" like Gecko) Version/10.0 Mobile/14G60 Safari/602.1","22":"Mozilla/5.0 (iPhone; CPU iPhone OS 9_2 like Mac OS X) AppleWebKit/601.1.46 (KHTML","23":" like Gecko) Version/9.0 Mobile/13C75 Safari/601.1","24":"Mozilla/5.0 (iPhone; CPU iPhone OS 10_3_2 like Mac OS X) AppleWebKit/603.2.4 (KHTML","25":" like Gecko) Version/10.0 Mobile/14F89 Safari/602.1","26":"Mozilla/5.0 (iPhone; CPU iPhone OS 9_3_5 like Mac OS X) AppleWebKit/601.1.46 (KHTML","27":" like Gecko) Version/9.0 Mobile/13G36 Safari/601.1","28":"Mozilla/5.0 (iPhone; CPU iPhone OS 9_3_3 like Mac OS X) AppleWebKit/601.1.46 (KHTML","29":" like Gecko) Version/9.0 Mobile/13G34 Safari/601.1","30":"Mozilla/5.0 (iPhone; CPU iPhone OS 9_3_4 like Mac OS X) AppleWebKit/601.1.46 (KHTML","31":" like Gecko) Version/9.0 Mobile/13G35 Safari/601.1","32":"Mozilla/5.0 (iPhone; CPU iPhone OS 10_3_1 like Mac OS X) AppleWebKit/603.1.30 (KHTML","33":" like Gecko) Version/10.0 Mobile/14E304 Safari/602.1","34":"Mozilla/5.0 (iPhone; CPU iPhone OS 7_1_2 like Mac OS X) AppleWebKit/537.51.2 (KHTML","35":" like Gecko) Version/7.0 Mobile/11D257 Safari/9537.53","36":"Mozilla/5.0 (iPhone; CPU iPhone OS 8_4_1 like Mac OS X) AppleWebKit/600.1.4 (KHTML","37":" like Gecko) Version/8.0 Mobile/12H321 Safari/600.1.4","38":"Mozilla/5.0 (iPhone; CPU iPhone OS 10_0_1 like Mac OS X) AppleWebKit/602.1.50 (KHTML","39":" like Gecko) Version/10.0 Mobile/14A403 Safari/602.1","40":"Mozilla/5.0 (iPhone; CPU iPhone OS 9_0_2 like Mac OS X) AppleWebKit/601.1.46 (KHTML","41":" like Gecko) Version/9.0 Mobile/13A452 Safari/601.1","42":"Mozilla/5.0 (iPhone; CPU iPhone OS 8_3 like Mac OS X) AppleWebKit/600.1.4 (KHTML","43":" like Gecko) Version/8.0 Mobile/12F70 Safari/600.1.4","44":"Mozilla/5.0 (iPhone; CPU iPhone OS 8_4 like Mac OS X) AppleWebKit/600.1.4 (KHTML","45":" like Gecko) Version/8.0 Mobile/12H143 Safari/600.1.4","46":"Mozilla/5.0 (iPhone; CPU iPhone OS 11_0 like Mac OS X) AppleWebKit/604.1.38 (KHTML","47":" like Gecko) Version/11.0 Mobile/15A372 Safari/604.1","48":"Mozilla/5.0 (iPhone; CPU iPhone OS 6_0 like Mac OS X) AppleWebKit/536.26 (KHTML","49":" like Gecko) Version/6.0 Mobile/10A5376e Safari/8536.25","50":"Mozilla/5.0 (iPhone; CPU iPhone OS 9_3 like Mac OS X) AppleWebKit/601.1.46 (KHTML","51":" like Gecko) Version/9.0 Mobile/13E233 Safari/601.1","52":"Mozilla/5.0 (iPhone; CPU iPhone OS 6_1_3 like Mac OS X) AppleWebKit/536.26 (KHTML","53":" like Gecko) Version/6.0 Mobile/10B329 Safari/8536.25","54":"Mozilla/5.0 (iPhone; U; CPU iPhone OS 3_0 like Mac OS X; en-us) AppleWebKit/528.18 (KHTML","55":" like Gecko) Version/4.0 Mobile/7A341 Safari/528.16","56":"Mozilla/5.0 (iPhone; CPU iPhone OS 9_0 like Mac OS X) AppleWebKit/601.1.46 (KHTML","57":" like Gecko) Version/9.0 Mobile/13A344 Safari/601.1","58":"Mozilla/5.0 (iPhone; CPU iPhone OS 7_0_2 like Mac OS X) AppleWebKit/537.51.1 (KHTML","59":" like Gecko) Version/7.0 Mobile/11A4449d Safari/9537.53","60":"Mozilla/5.0 (iPhone; CPU iPhone OS 9_3 like Mac OS X) AppleWebKit/601.1.46 (KHTML","61":" like Gecko) Version/9.0 Mobile/13E234 Safari/601.1","62":"Mozilla/5.0 (iPhone; CPU iPhone OS 8_1 like Mac OS X) AppleWebKit/600.1.4 (KHTML","63":" like Gecko) Version/8.0 Mobile/12B410 Safari/600.1.4 (Applebot/0.1; +http://www.apple.com/go/applebot)","64":"Mozilla/5.0 (iPhone; CPU iPhone OS 8_0 like Mac OS X) AppleWebKit/600.1.3 (KHTML","65":" like Gecko) Version/8.0 Mobile/12A4345d Safari/600.1.4","66":"Mozilla/5.0 (iPhone; CPU iPhone OS 9_0_1 like Mac OS X) AppleWebKit/601.1.46 (KHTML","67":" like Gecko) Version/9.0 Mobile/13A404 Safari/601.1","68":"Mozilla/5.0 (iPhone; CPU iPhone OS 9_3_2 like Mac OS X) AppleWebKit/601.1 (KHTML","69":" like Gecko) CriOS/51.0.2704.104 Mobile/13F69 Safari/601.1.46","70":"Mozilla/5.0 (iPhone; CPU iPhone OS 8_1_2 like Mac OS X) AppleWebKit/600.1.4 (KHTML","71":" like Gecko) Version/8.0 Mobile/12B440 Safari/600.1.4","72":"Mozilla/5.0 (iPhone; CPU iPhone OS 7_0 like Mac OS X) AppleWebKit/534.46 (KHTML","73":" like Gecko) Version/5.1 Mobile/9A334 Safari/7534.48.3","74":"Mozilla/5.0 (iPhone; CPU iPhone OS 9_3_2 like Mac OS X) AppleWebKit/601.1 (KHTML","75":" like Gecko) CriOS/51.0.2704.104 Mobile/13F69 Safari/601.1.46 evaliant","76":"Mozilla/5.0 (iPhone; CPU iPhone OS 7_0_4 like Mac OS X) AppleWebKit/537.51.1 (KHTML","77":" like Gecko) Version/7.0 Mobile/11B554a Safari/9537.53","78":"Mozilla/5.0 (iPhone; CPU iPhone OS 8_1_3 like Mac OS X) AppleWebKit/600.1.4 (KHTML","79":" like Gecko) Version/8.0 Mobile/12B466 Safari/600.1.4","80":"Mozilla/5.0 (iPhone; CPU iPhone OS 8_2 like Mac OS X) AppleWebKit/600.1.4 (KHTML","81":" like Gecko) Version/8.0 Mobile/12D508 Safari/600.1.4","82":"Mozilla/5.0 (iPhone; CPU iPhone OS 5_1_1 like Mac OS X) AppleWebKit/534.46 (KHTML","83":" like Gecko) Version/5.1 Mobile/9B206 Safari/7534.48.3","84":"Mozilla/5.0 (iPhone; CPU iPhone OS 7_1_1 like Mac OS X) AppleWebKit/537.51.2 (KHTML","85":" like Gecko) Version/7.0 Mobile/11D201 Safari/9537.53","86":"Mozilla/5.0 (iPhone; CPU iPhone OS 6_1_2 like Mac OS X) AppleWebKit/536.26 (KHTML","87":" like Gecko) Version/6.0 Mobile/10B146 Safari/8536.25","88":"Mozilla/5.0 (iPhone; U; CPU iPhone OS 4_0 like Mac OS X; en-us) AppleWebKit/532.9 (KHTML","89":" like Gecko) Version/4.0.5 Mobile/8A293 Safari/6531.22.7","90":"Mozilla/5.0 (iPhone; CPU iPhone OS 6_0_1 like Mac OS X) AppleWebKit/536.26 (KHTML","91":" like Gecko) Version/6.0 Mobile/10A523 Safari/8536.25","92":"Mozilla/5.0 (iPhone; CPU iPhone OS 10_2_1 like Mac OS X) AppleWebKit/602.1.50 (KHTML","93":" like Gecko) CriOS/56.0.2924.79 Mobile/14D27 Safari/602.1","94":"Mozilla/5.0 (iPhone; CPU iPhone OS 10_1 like Mac OS X) AppleWebKit/602.2.14 (KHTML","95":" like Gecko) Version/10.0 Mobile/14B72 Safari/602.1","96":"Mozilla/5.0 (iPhone; CPU iPhone OS 5_0 like Mac OS X) AppleWebKit/534.46 (KHTML","97":" like Gecko) Version/5.1 Mobile/9A334 Safari/7534.48.3","98":"Mozilla/5.0 (iPhone; CPU iPhone OS 9_3_2 like Mac OS X) AppleWebKit/600.1.4 (KHTML","99":" like Gecko) GSA/16.0.124986583 Mobile/13F69 Safari/600.1.4"}';
  var strUserAgen_old = '{"0":"Mozilla/5.0 (Windows NT 6.1) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/41.0.2228.0 Safari/537.36","1":"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_10_1) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/41.0.2227.1 Safari/537.36","2":"Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/41.0.2227.0 Safari/537.36","3":"Mozilla/5.0 (Windows NT 6.1; WOW64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/41.0.2227.0 Safari/537.36","4":"Mozilla/5.0 (Windows NT 6.3; WOW64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/41.0.2226.0 Safari/537.36","5":"Mozilla/5.0 (Windows NT 6.4; WOW64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/41.0.2225.0 Safari/537.36","6":"Mozilla/5.0 (Windows NT 6.3; WOW64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/41.0.2225.0 Safari/537.36","7":"Mozilla/5.0 (Windows NT 5.1) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/41.0.2224.3 Safari/537.36","8":"Mozilla/5.0 (Windows NT 10.0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/40.0.2214.93 Safari/537.36","9":"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_10_1) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/37.0.2062.124 Safari/537.36","10":"Mozilla/5.0 (Windows NT 6.3; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/37.0.2049.0 Safari/537.36","11":"Mozilla/5.0 (Windows NT 4.0; WOW64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/37.0.2049.0 Safari/537.36","12":"Mozilla/5.0 (Windows NT 6.1; WOW64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/36.0.1985.67 Safari/537.36","13":"Mozilla/5.0 (Windows NT 5.1) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/36.0.1985.67 Safari/537.36","14":"Mozilla/5.0 (X11; OpenBSD i386) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/36.0.1985.125 Safari/537.36","15":"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_9_2) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/36.0.1944.0 Safari/537.36","16":"Mozilla/5.0 (Windows NT 5.1) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/35.0.3319.102 Safari/537.36","17":"Mozilla/5.0 (Windows NT 5.1) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/35.0.2309.372 Safari/537.36","18":"Mozilla/5.0 (Windows NT 5.1) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/35.0.2117.157 Safari/537.36","19":"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_9_3) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/35.0.1916.47 Safari/537.36","20":"Mozilla/5.0 (Windows NT 5.1) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/34.0.1866.237 Safari/537.36","21":"Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/34.0.1847.137 Safari/4E423F","22":"Mozilla/5.0 (Windows NT 5.1) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/34.0.1847.116 Safari/537.36 Mozilla/5.0 (iPad; U; CPU OS 3_2 like Mac OS X; en-us) AppleWebKit/531.21.10 (KHTML, like Gecko) Version/4.0.4 Mobile/7B334b Safari/531.21.10","23":"Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/33.0.1750.517 Safari/537.36","24":"Mozilla/5.0 (Windows NT 6.2; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/32.0.1667.0 Safari/537.36","25":"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_9_0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/32.0.1664.3 Safari/537.36","26":"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_8_0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/32.0.1664.3 Safari/537.36","27":"Mozilla/5.0 (Windows NT 5.1) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/31.0.1650.16 Safari/537.36","28":"Mozilla/5.0 (Windows NT 6.1; WOW64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/31.0.1623.0 Safari/537.36","29":"Mozilla/5.0 (Windows NT 6.2; WOW64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/30.0.1599.17 Safari/537.36","30":"Mozilla/5.0 (Windows NT 6.1; WOW64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/29.0.1547.62 Safari/537.36","31":"Mozilla/5.0 (X11; CrOS i686 4319.74.0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/29.0.1547.57 Safari/537.36","32":"Mozilla/5.0 (Windows NT 6.2; WOW64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/29.0.1547.2 Safari/537.36","33":"Mozilla/5.0 (Windows NT 6.1) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/28.0.1468.0 Safari/537.36","34":"Mozilla/5.0 (Windows NT 6.2) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/28.0.1467.0 Safari/537.36","35":"Mozilla/5.0 (Windows NT 6.2) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/28.0.1464.0 Safari/537.36","36":"Mozilla/5.0 (Windows NT 6.2; WOW64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/27.0.1500.55 Safari/537.36","37":"Mozilla/5.0 (Windows NT 6.2; WOW64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/27.0.1453.93 Safari/537.36","38":"Mozilla/5.0 (Windows NT 6.1; WOW64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/27.0.1453.93 Safari/537.36","39":"Mozilla/5.0 (Windows NT 6.1) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/27.0.1453.93 Safari/537.36","40":"Mozilla/5.0 (Windows NT 5.1) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/27.0.1453.93 Safari/537.36","41":"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_8_3) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/27.0.1453.93 Safari/537.36","42":"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_7_5) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/27.0.1453.93 Safari/537.36","43":"Mozilla/5.0 (Windows NT 6.1) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/27.0.1453.90 Safari/537.36","44":"Mozilla/5.0 (X11; NetBSD) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/27.0.1453.116 Safari/537.36","45":"Mozilla/5.0 (X11; CrOS i686 3912.101.0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/27.0.1453.116 Safari/537.36","46":"Mozilla/5.0 (Windows NT 6.1; WOW64) AppleWebKit/537.17 (KHTML, like Gecko) Chrome/24.0.1312.60 Safari/537.17","47":"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_8_2) AppleWebKit/537.17 (KHTML, like Gecko) Chrome/24.0.1309.0 Safari/537.17","48":"Mozilla/5.0 (Windows NT 6.2; WOW64) AppleWebKit/537.15 (KHTML, like Gecko) Chrome/24.0.1295.0 Safari/537.15","49":"Mozilla/5.0 (Windows NT 6.2; WOW64) AppleWebKit/537.14 (KHTML, like Gecko) Chrome/24.0.1292.0 Safari/537.14","50":"Mozilla/5.0 (Windows NT 6.2; WOW64) AppleWebKit/537.13 (KHTML, like Gecko) Chrome/24.0.1290.1 Safari/537.13","51":"Mozilla/5.0 (Windows NT 6.2) AppleWebKit/537.13 (KHTML, like Gecko) Chrome/24.0.1290.1 Safari/537.13","52":"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_8_2) AppleWebKit/537.13 (KHTML, like Gecko) Chrome/24.0.1290.1 Safari/537.13","53":"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_7_4) AppleWebKit/537.13 (KHTML, like Gecko) Chrome/24.0.1290.1 Safari/537.13","54":"Mozilla/5.0 (Windows NT 6.1) AppleWebKit/537.13 (KHTML, like Gecko) Chrome/24.0.1284.0 Safari/537.13","55":"Mozilla/5.0 (Windows NT 5.1) AppleWebKit/537.11 (KHTML, like Gecko) Chrome/23.0.1271.6 Safari/537.11","56":"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_8_2) AppleWebKit/537.11 (KHTML, like Gecko) Chrome/23.0.1271.6 Safari/537.11","57":"Mozilla/5.0 (Windows NT 6.2) AppleWebKit/537.11 (KHTML, like Gecko) Chrome/23.0.1271.26 Safari/537.11","58":"Mozilla/5.0 (Windows NT 6.0) yi; AppleWebKit/345667.12221 (KHTML, like Gecko) Chrome/23.0.1271.26 Safari/453667.1221","59":"Mozilla/5.0 (Windows NT 6.2; WOW64) AppleWebKit/537.11 (KHTML, like Gecko) Chrome/23.0.1271.17 Safari/537.11","60":"Mozilla/5.0 (Windows NT 6.2) AppleWebKit/537.4 (KHTML, like Gecko) Chrome/22.0.1229.94 Safari/537.4","61":"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_6_0) AppleWebKit/537.4 (KHTML, like Gecko) Chrome/22.0.1229.79 Safari/537.4","62":"Mozilla/5.0 (Windows NT 6.1) AppleWebKit/537.2 (KHTML, like Gecko) Chrome/22.0.1216.0 Safari/537.2","63":"Mozilla/5.0 (Windows NT 6.1; WOW64) AppleWebKit/537.1 (KHTML, like Gecko) Chrome/22.0.1207.1 Safari/537.1","64":"Mozilla/5.0 (X11; CrOS i686 2268.111.0) AppleWebKit/536.11 (KHTML, like Gecko) Chrome/20.0.1132.57 Safari/536.11","65":"Mozilla/5.0 (Windows NT 6.1; WOW64) AppleWebKit/536.6 (KHTML, like Gecko) Chrome/20.0.1092.0 Safari/536.6","66":"Mozilla/5.0 (Windows NT 6.2) AppleWebKit/536.6 (KHTML, like Gecko) Chrome/20.0.1090.0 Safari/536.6","67":"Mozilla/5.0 (Windows NT 6.2; WOW64) AppleWebKit/537.1 (KHTML, like Gecko) Chrome/19.77.34.5 Safari/537.1","68":"Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/536.5 (KHTML, like Gecko) Chrome/19.0.1084.9 Safari/536.5","69":"Mozilla/5.0 (X11; FreeBSD amd64) AppleWebKit/536.5 (KHTML like Gecko) Chrome/19.0.1084.56 Safari/1EA69","70":"Mozilla/5.0 (Windows NT 6.0) AppleWebKit/536.5 (KHTML, like Gecko) Chrome/19.0.1084.36 Safari/536.5","71":"Mozilla/5.0 (Windows NT 6.1; WOW64) AppleWebKit/536.3 (KHTML, like Gecko) Chrome/19.0.1063.0 Safari/536.3","72":"Mozilla/5.0 (Windows NT 5.1) AppleWebKit/536.3 (KHTML, like Gecko) Chrome/19.0.1063.0 Safari/536.3","73":"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_8_0) AppleWebKit/536.3 (KHTML, like Gecko) Chrome/19.0.1063.0 Safari/536.3","74":"Mozilla/5.0 (Windows NT 6.2) AppleWebKit/536.3 (KHTML, like Gecko) Chrome/19.0.1062.0 Safari/536.3","75":"Mozilla/5.0 (Windows NT 6.1; WOW64) AppleWebKit/536.3 (KHTML, like Gecko) Chrome/19.0.1062.0 Safari/536.3","76":"Mozilla/5.0 (Windows NT 6.2) AppleWebKit/536.3 (KHTML, like Gecko) Chrome/19.0.1061.1 Safari/536.3","77":"Mozilla/5.0 (Windows NT 6.1; WOW64) AppleWebKit/536.3 (KHTML, like Gecko) Chrome/19.0.1061.1 Safari/536.3","78":"Mozilla/5.0 (Windows NT 6.1) AppleWebKit/536.3 (KHTML, like Gecko) Chrome/19.0.1061.1 Safari/536.3","79":"Mozilla/5.0 (Windows NT 6.2) AppleWebKit/536.3 (KHTML, like Gecko) Chrome/19.0.1061.0 Safari/536.3","80":"Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/535.24 (KHTML, like Gecko) Chrome/19.0.1055.1 Safari/535.24","81":"Mozilla/5.0 (Windows NT 6.2; WOW64) AppleWebKit/535.24 (KHTML, like Gecko) Chrome/19.0.1055.1 Safari/535.24","82":"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_7_2) AppleWebKit/535.24 (KHTML, like Gecko) Chrome/19.0.1055.1 Safari/535.24","83":"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_7_3) AppleWebKit/535.22 (KHTML, like Gecko) Chrome/19.0.1047.0 Safari/535.22","84":"Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/535.21 (KHTML, like Gecko) Chrome/19.0.1042.0 Safari/535.21","85":"Mozilla/5.0 (X11; Linux i686) AppleWebKit/535.21 (KHTML, like Gecko) Chrome/19.0.1041.0 Safari/535.21","86":"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_7_3) AppleWebKit/535.20 (KHTML, like Gecko) Chrome/19.0.1036.7 Safari/535.20","87":"Mozilla/5.0 (Windows NT 6.1) AppleWebKit/535.2 (KHTML, like Gecko) Chrome/18.6.872.0 Safari/535.2 UNTRUSTED/1.0 3gpp-gba UNTRUSTED/1.0","88":"Mozilla/5.0 (Macintosh; AMD Mac OS X 10_8_2) AppleWebKit/535.22 (KHTML, like Gecko) Chrome/18.6.872","89":"Mozilla/5.0 (X11; CrOS i686 1660.57.0) AppleWebKit/535.19 (KHTML, like Gecko) Chrome/18.0.1025.46 Safari/535.19","90":"Mozilla/5.0 (Windows NT 6.0; WOW64) AppleWebKit/535.19 (KHTML, like Gecko) Chrome/18.0.1025.45 Safari/535.19","91":"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_7_2) AppleWebKit/535.19 (KHTML, like Gecko) Chrome/18.0.1025.45 Safari/535.19","92":"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_6_8) AppleWebKit/535.19 (KHTML, like Gecko) Chrome/18.0.1025.45 Safari/535.19","93":"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_6_8) AppleWebKit/535.19 (KHTML, like Gecko) Chrome/18.0.1025.166 Safari/535.19","94":"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_5_8) AppleWebKit/535.19 (KHTML, like Gecko) Chrome/18.0.1025.151 Safari/535.19","95":"Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/535.19 (KHTML, like Gecko) Ubuntu/11.10 Chromium/18.0.1025.142 Chrome/18.0.1025.142 Safari/535.19","96":"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_6_8) AppleWebKit/535.19 (KHTML, like Gecko) Chrome/18.0.1025.11 Safari/535.19","97":"Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/535.11 (KHTML, like Gecko) Chrome/17.0.963.66 Safari/535.11","98":"Mozilla/5.0 (X11; Linux i686) AppleWebKit/535.11 (KHTML, like Gecko) Chrome/17.0.963.66 Safari/535.11","99":"Mozilla/5.0 (Windows NT 6.2; WOW64) AppleWebKit/535.11 (KHTML, like Gecko) Chrome/17.0.963.66 Safari/535.11","100":"Mozilla/5.0 (Windows NT 6.2) AppleWebKit/535.11 (KHTML, like Gecko) Chrome/17.0.963.66 Safari/535.11","101":"Mozilla/5.0 (Windows NT 6.1; WOW64) AppleWebKit/535.11 (KHTML, like Gecko) Chrome/17.0.963.66 Safari/535.11","102":"Mozilla/5.0 (Windows NT 6.1) AppleWebKit/535.11 (KHTML, like Gecko) Chrome/17.0.963.66 Safari/535.11","103":"Mozilla/5.0 (Windows NT 6.0; WOW64) AppleWebKit/535.11 (KHTML, like Gecko) Chrome/17.0.963.66 Safari/535.11","104":"Mozilla/5.0 (Windows NT 6.0) AppleWebKit/535.11 (KHTML, like Gecko) Chrome/17.0.963.66 Safari/535.11","105":"Mozilla/5.0 (Windows NT 5.1) AppleWebKit/535.11 (KHTML, like Gecko) Chrome/17.0.963.66 Safari/535.11","106":"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_7_3) AppleWebKit/535.11 (KHTML, like Gecko) Chrome/17.0.963.66 Safari/535.11","107":"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_7_2) AppleWebKit/535.11 (KHTML, like Gecko) Chrome/17.0.963.66 Safari/535.11","108":"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_6_8) AppleWebKit/535.11 (KHTML, like Gecko) Chrome/17.0.963.66 Safari/535.11","109":"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_5_8) AppleWebKit/535.11 (KHTML, like Gecko) Chrome/17.0.963.66 Safari/535.11","110":"Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/535.11 (KHTML, like Gecko) Ubuntu/11.10 Chromium/17.0.963.65 Chrome/17.0.963.65 Safari/535.11","111":"Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/535.11 (KHTML, like Gecko) Ubuntu/11.04 Chromium/17.0.963.65 Chrome/17.0.963.65 Safari/535.11","112":"Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/535.11 (KHTML, like Gecko) Ubuntu/10.10 Chromium/17.0.963.65 Chrome/17.0.963.65 Safari/535.11","113":"Mozilla/5.0 (X11; Linux i686) AppleWebKit/535.11 (KHTML, like Gecko) Ubuntu/11.10 Chromium/17.0.963.65 Chrome/17.0.963.65 Safari/535.11","114":"Mozilla/5.0 (X11; Linux i686) AppleWebKit/535.11 (KHTML, like Gecko) Chrome/17.0.963.65 Safari/535.11","115":"Mozilla/5.0 (X11; FreeBSD amd64) AppleWebKit/535.11 (KHTML, like Gecko) Chrome/17.0.963.65 Safari/535.11","116":"Mozilla/5.0 (Windows NT 6.2; WOW64) AppleWebKit/535.11 (KHTML, like Gecko) Chrome/17.0.963.65 Safari/535.11","117":"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_7_2) AppleWebKit/535.11 (KHTML, like Gecko) Chrome/17.0.963.65 Safari/535.11","118":"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_7_0) AppleWebKit/535.11 (KHTML, like Gecko) Chrome/17.0.963.65 Safari/535.11","119":"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_6_4) AppleWebKit/535.11 (KHTML, like Gecko) Chrome/17.0.963.65 Safari/535.11","120":"Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/535.11 (KHTML, like Gecko) Ubuntu/11.04 Chromium/17.0.963.56 Chrome/17.0.963.56 Safari/535.11","121":"Mozilla/5.0 (X11; Linux i686) AppleWebKit/535.11 (KHTML, like Gecko) Chrome/17.0.963.56 Safari/535.11","122":"Mozilla/5.0 (Windows NT 6.1; WOW64) AppleWebKit/535.11 (KHTML, like Gecko) Chrome/17.0.963.56 Safari/535.11","123":"Mozilla/5.0 (Windows NT 6.0; WOW64) AppleWebKit/535.11 (KHTML, like Gecko) Chrome/17.0.963.56 Safari/535.11","124":"Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/535.11 (KHTML, like Gecko) Chrome/17.0.963.12 Safari/535.11","125":"Mozilla/5.0 (Windows NT 6.1; WOW64) AppleWebKit/535.8 (KHTML, like Gecko) Chrome/17.0.940.0 Safari/535.8","126":"Mozilla/5.0 (Windows NT 6.1) AppleWebKit/535.7 (KHTML, like Gecko) Chrome/16.0.912.77 Safari/535.7ad-imcjapan-syosyaman-xkgi3lqg03!wgz","127":"Mozilla/5.0 (X11; CrOS i686 1193.158.0) AppleWebKit/535.7 (KHTML, like Gecko) Chrome/16.0.912.75 Safari/535.7","128":"Mozilla/5.0 (Windows NT 6.0; WOW64) AppleWebKit/535.7 (KHTML, like Gecko) Chrome/16.0.912.75 Safari/535.7","129":"Mozilla/5.0 (Windows NT 6.0) AppleWebKit/535.7 (KHTML, like Gecko) Chrome/16.0.912.75 Safari/535.7","130":"Mozilla/5.0 (Windows NT 6.1; WOW64) AppleWebKit/535.7 (KHTML, like Gecko) Chrome/16.0.912.63 Safari/535.7xs5D9rRDFpg2g","131":"Mozilla/5.0 (Windows NT 6.1) AppleWebKit/535.8 (KHTML, like Gecko) Chrome/16.0.912.63 Safari/535.8","132":"Mozilla/5.0 (Windows NT 5.2; WOW64) AppleWebKit/535.7 (KHTML, like Gecko) Chrome/16.0.912.63 Safari/535.7","133":"Mozilla/5.0 (Windows NT 6.1; WOW64) AppleWebKit/535.7 (KHTML, like Gecko) Chrome/16.0.912.36 Safari/535.7","134":"Mozilla/5.0 (Windows NT 6.0; WOW64) AppleWebKit/535.7 (KHTML, like Gecko) Chrome/16.0.912.36 Safari/535.7","135":"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_6_8) AppleWebKit/535.7 (KHTML, like Gecko) Chrome/16.0.912.36 Safari/535.7","136":"Mozilla/5.0 (Windows NT 5.1) AppleWebKit/535.6 (KHTML, like Gecko) Chrome/16.0.897.0 Safari/535.6","137":"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_6_8) AppleWebKit/535.2 (KHTML, like Gecko) Chrome/15.0.874.54 Safari/535.2","138":"Mozilla/5.0 (X11; FreeBSD i386) AppleWebKit/535.2 (KHTML, like Gecko) Chrome/15.0.874.121 Safari/535.2","139":"Mozilla/5.0 (X11; Linux i686) AppleWebKit/535.2 (KHTML, like Gecko) Ubuntu/11.10 Chromium/15.0.874.120 Chrome/15.0.874.120 Safari/535.2","140":"Mozilla/5.0 (Windows NT 6.0) AppleWebKit/535.2 (KHTML, like Gecko) Chrome/15.0.874.120 Safari/535.2","141":"Mozilla/5.0 (Windows NT 5.1) AppleWebKit/535.2 (KHTML, like Gecko) Chrome/15.0.872.0 Safari/535.2","142":"Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/535.2 (KHTML, like Gecko) Ubuntu/11.04 Chromium/15.0.871.0 Chrome/15.0.871.0 Safari/535.2","143":"Mozilla/5.0 (Windows NT 5.1) AppleWebKit/535.2 (KHTML, like Gecko) Chrome/15.0.864.0 Safari/535.2","144":"Mozilla/5.0 (Windows NT 6.1) AppleWebKit/535.2 (KHTML, like Gecko) Chrome/15.0.861.0 Safari/535.2","145":"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_7_0) AppleWebKit/535.2 (KHTML, like Gecko) Chrome/15.0.861.0 Safari/535.2","146":"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_6_8) AppleWebKit/535.2 (KHTML, like Gecko) Chrome/15.0.861.0 Safari/535.2","147":"Mozilla/5.0 (Windows NT 5.1) AppleWebKit/535.2 (KHTML, like Gecko) Chrome/15.0.860.0 Safari/535.2","148":"Chrome/15.0.860.0 (Windows; U; Windows NT 6.0; en-US) AppleWebKit/533.20.25 (KHTML, like Gecko) Version/15.0.860.0","149":"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_7_2) AppleWebKit/535.1 (KHTML, like Gecko) Chrome/14.0.835.186 Safari/535.1","150":"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_7_2) AppleWebKit/535.1 (KHTML, like Gecko) Chrome/14.0.834.0 Safari/535.1","151":"Mozilla/5.0 (X11; Linux i686) AppleWebKit/535.1 (KHTML, like Gecko) Ubuntu/11.04 Chromium/14.0.825.0 Chrome/14.0.825.0 Safari/535.1","152":"Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/535.1 (KHTML, like Gecko) Chrome/14.0.824.0 Safari/535.1","153":"Mozilla/5.0 (Windows NT 6.1) AppleWebKit/535.1 (KHTML, like Gecko) Chrome/14.0.815.10913 Safari/535.1","154":"Mozilla/5.0 (Windows NT 5.1) AppleWebKit/535.1 (KHTML, like Gecko) Chrome/14.0.815.0 Safari/535.1","155":"Mozilla/5.0 (X11; Linux i686) AppleWebKit/535.1 (KHTML, like Gecko) Ubuntu/11.04 Chromium/14.0.814.0 Chrome/14.0.814.0 Safari/535.1","156":"Mozilla/5.0 (Windows NT 6.1; WOW64) AppleWebKit/535.1 (KHTML, like Gecko) Chrome/14.0.814.0 Safari/535.1","157":"Mozilla/5.0 (X11; Linux i686) AppleWebKit/535.1 (KHTML, like Gecko) Ubuntu/10.04 Chromium/14.0.813.0 Chrome/14.0.813.0 Safari/535.1","158":"Mozilla/5.0 (Windows NT 6.1; WOW64) AppleWebKit/535.1 (KHTML, like Gecko) Chrome/14.0.813.0 Safari/535.1","159":"Mozilla/5.0 (Windows NT 5.2) AppleWebKit/535.1 (KHTML, like Gecko) Chrome/14.0.813.0 Safari/535.1","160":"Mozilla/5.0 (Windows NT 5.1) AppleWebKit/535.1 (KHTML, like Gecko) Chrome/14.0.813.0 Safari/535.1","161":"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_6_7) AppleWebKit/535.1 (KHTML, like Gecko) Chrome/14.0.813.0 Safari/535.1","162":"Mozilla/5.0 (Windows NT 6.1) AppleWebKit/535.1 (KHTML, like Gecko) Chrome/14.0.812.0 Safari/535.1","163":"Mozilla/5.0 (Windows NT 6.1; WOW64) AppleWebKit/535.1 (KHTML, like Gecko) Chrome/14.0.811.0 Safari/535.1","164":"Mozilla/5.0 (Windows NT 6.1; WOW64) AppleWebKit/535.1 (KHTML, like Gecko) Chrome/14.0.810.0 Safari/535.1","165":"Mozilla/5.0 (Windows NT 5.1) AppleWebKit/535.1 (KHTML, like Gecko) Chrome/14.0.810.0 Safari/535.1","166":"Mozilla/5.0 (Windows NT 5.1) AppleWebKit/535.1 (KHTML, like Gecko) Chrome/14.0.809.0 Safari/535.1","167":"Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/535.1 (KHTML, like Gecko) Ubuntu/10.10 Chromium/14.0.808.0 Chrome/14.0.808.0 Safari/535.1","168":"Mozilla/5.0 (X11; Linux i686) AppleWebKit/535.1 (KHTML, like Gecko) Ubuntu/10.04 Chromium/14.0.808.0 Chrome/14.0.808.0 Safari/535.1","169":"Mozilla/5.0 (X11; Linux i686) AppleWebKit/535.1 (KHTML, like Gecko) Ubuntu/10.04 Chromium/14.0.804.0 Chrome/14.0.804.0 Safari/535.1","170":"Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/535.1 (KHTML, like Gecko) Chrome/14.0.803.0 Safari/535.1","171":"Mozilla/5.0 (X11; Linux i686) AppleWebKit/535.1 (KHTML, like Gecko) Ubuntu/11.04 Chromium/14.0.803.0 Chrome/14.0.803.0 Safari/535.1","172":"Mozilla/5.0 (X11; Linux i686) AppleWebKit/535.1 (KHTML, like Gecko) Chrome/14.0.803.0 Safari/535.1","173":"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_7_0) AppleWebKit/535.1 (KHTML, like Gecko) Chrome/14.0.803.0 Safari/535.1","174":"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_6_7) AppleWebKit/535.1 (KHTML, like Gecko) Chrome/14.0.803.0 Safari/535.1","175":"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_5_8) AppleWebKit/535.1 (KHTML, like Gecko) Chrome/14.0.803.0 Safari/535.1","176":"Mozilla/5.0 (Windows NT 6.1) AppleWebKit/535.1 (KHTML, like Gecko) Chrome/14.0.801.0 Safari/535.1","177":"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_5_8) AppleWebKit/535.1 (KHTML, like Gecko) Chrome/14.0.801.0 Safari/535.1","178":"Mozilla/5.0 (Windows NT 5.2) AppleWebKit/535.1 (KHTML, like Gecko) Chrome/14.0.794.0 Safari/535.1","179":"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_7_0) AppleWebKit/535.1 (KHTML, like Gecko) Chrome/14.0.794.0 Safari/535.1","180":"Mozilla/5.0 (Windows NT 6.0) AppleWebKit/535.1 (KHTML, like Gecko) Chrome/14.0.792.0 Safari/535.1","181":"Mozilla/5.0 (Windows NT 5.2) AppleWebKit/535.1 (KHTML, like Gecko) Chrome/14.0.792.0 Safari/535.1","182":"Mozilla/5.0 (Windows NT 5.1) AppleWebKit/535.1 (KHTML, like Gecko) Chrome/14.0.792.0 Safari/535.1","183":"Mozilla/5.0 (Macintosh; PPC Mac OS X 10_6_7) AppleWebKit/535.1 (KHTML, like Gecko) Chrome/14.0.790.0 Safari/535.1","184":"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_6_7) AppleWebKit/535.1 (KHTML, like Gecko) Chrome/14.0.790.0 Safari/535.1","185":"Mozilla/5.0 (Windows; U; Windows NT 6.1) AppleWebKit/526.3 (KHTML, like Gecko) Chrome/14.0.564.21 Safari/526.3","186":"Mozilla/5.0 (X11; CrOS i686 13.587.48) AppleWebKit/535.1 (KHTML, like Gecko) Chrome/13.0.782.43 Safari/535.1","187":"Mozilla/5.0 Slackware/13.37 (X11; U; Linux x86_64; en-US) AppleWebKit/535.1 (KHTML, like Gecko) Chrome/13.0.782.41","188":"Mozilla/5.0 ArchLinux (X11; Linux x86_64) AppleWebKit/535.1 (KHTML, like Gecko) Chrome/13.0.782.41 Safari/535.1","189":"Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/535.1 (KHTML, like Gecko) Ubuntu/11.04 Chromium/13.0.782.41 Chrome/13.0.782.41 Safari/535.1","190":"Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/535.1 (KHTML, like Gecko) Chrome/13.0.782.41 Safari/535.1","191":"Mozilla/5.0 (X11; Linux i686) AppleWebKit/535.1 (KHTML, like Gecko) Chrome/13.0.782.41 Safari/535.1","192":"Mozilla/5.0 (Windows NT 6.0; WOW64) AppleWebKit/535.1 (KHTML, like Gecko) Chrome/13.0.782.41 Safari/535.1","193":"Mozilla/5.0 (Windows NT 6.0) AppleWebKit/535.1 (KHTML, like Gecko) Chrome/13.0.782.41 Safari/535.1","194":"Mozilla/5.0 (Windows NT 5.2; WOW64) AppleWebKit/535.1 (KHTML, like Gecko) Chrome/13.0.782.41 Safari/535.1","195":"Mozilla/5.0 (Windows NT 5.1) AppleWebKit/535.1 (KHTML, like Gecko) Chrome/13.0.782.41 Safari/535.1","196":"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_6_7) AppleWebKit/535.1 (KHTML, like Gecko) Chrome/13.0.782.41 Safari/535.1","197":"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_6_3) AppleWebKit/535.1 (KHTML, like Gecko) Chrome/13.0.782.41 Safari/535.1","198":"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_6_2) AppleWebKit/535.1 (KHTML, like Gecko) Chrome/13.0.782.41 Safari/535.1","199":"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_6_3) AppleWebKit/535.1 (KHTML, like Gecko) Chrome/13.0.782.32 Safari/535.1","200":"Mozilla/5.0 (X11; Linux amd64) AppleWebKit/535.1 (KHTML, like Gecko) Chrome/13.0.782.24 Safari/535.1","201":"Mozilla/5.0 (Windows NT 6.1; WOW64) AppleWebKit/535.1 (KHTML, like Gecko) Chrome/13.0.782.24 Safari/535.1","202":"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_6_8) AppleWebKit/535.1 (KHTML, like Gecko) Chrome/13.0.782.24 Safari/535.1","203":"Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/535.1 (KHTML, like Gecko) Chrome/13.0.782.220 Safari/535.1","204":"Mozilla/5.0 (Windows NT 6.0; WOW64) AppleWebKit/535.1 (KHTML, like Gecko) Chrome/13.0.782.220 Safari/535.1","205":"Mozilla/5.0 (Windows NT 6.0) AppleWebKit/535.1 (KHTML, like Gecko) Chrome/13.0.782.220 Safari/535.1","206":"Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/535.1 (KHTML, like Gecko) Chrome/13.0.782.215 Safari/535.1","207":"Mozilla/5.0 (X11; Linux i686) AppleWebKit/535.1 (KHTML, like Gecko) Chrome/13.0.782.215 Safari/535.1","208":"Mozilla/5.0 (Windows NT 6.1) AppleWebKit/535.1 (KHTML, like Gecko) Chrome/13.0.782.215 Safari/535.1","209":"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_7_2) AppleWebKit/535.1 (KHTML, like Gecko) Chrome/13.0.782.215 Safari/535.1","210":"Mozilla/5.0 (X11; U; Linux x86_64; en-US) AppleWebKit/535.1 (KHTML, like Gecko) Chrome/13.0.782.20 Safari/535.1","211":"Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/535.1 (KHTML, like Gecko) Chrome/13.0.782.20 Safari/535.1","212":"Mozilla/5.0 (Windows NT 6.0) AppleWebKit/535.1 (KHTML, like Gecko) Chrome/13.0.782.20 Safari/535.1","213":"Mozilla/5.0 (Windows NT 5.1) AppleWebKit/535.1 (KHTML, like Gecko) Chrome/13.0.782.20 Safari/535.1","214":"Mozilla/5.0 (X11; CrOS i686 0.13.587) AppleWebKit/535.1 (KHTML, like Gecko) Chrome/13.0.782.14 Safari/535.1","215":"Mozilla/5.0 (Windows; U; Windows NT 6.0; en-US) AppleWebKit/535.1 (KHTML, like Gecko) Chrome/13.0.782.107 Safari/535.1","216":"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_6_2) AppleWebKit/535.1 (KHTML, like Gecko) Chrome/13.0.782.107 Safari/535.1","217":"Mozilla/5.0 (Windows NT 6.0) AppleWebKit/535.1 (KHTML, like Gecko) Chrome/13.0.782.1 Safari/535.1","218":"Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/534.36 (KHTML, like Gecko) Chrome/13.0.766.0 Safari/534.36","219":"Mozilla/5.0 (X11; Linux amd64) AppleWebKit/534.36 (KHTML, like Gecko) Chrome/13.0.766.0 Safari/534.36","220":"Mozilla/5.0 (X11; Linux i686) AppleWebKit/534.35 (KHTML, like Gecko) Ubuntu/10.10 Chromium/13.0.764.0 Chrome/13.0.764.0 Safari/534.35","221":"Mozilla/5.0 (X11; CrOS i686 0.13.507) AppleWebKit/534.35 (KHTML, like Gecko) Chrome/13.0.763.0 Safari/534.35","222":"Mozilla/5.0 (X11; Linux i686) AppleWebKit/534.33 (KHTML, like Gecko) Ubuntu/9.10 Chromium/13.0.752.0 Chrome/13.0.752.0 Safari/534.33","223":"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_5_8) AppleWebKit/534.31 (KHTML, like Gecko) Chrome/13.0.748.0 Safari/534.31","224":"Mozilla/5.0 (Windows NT 6.1; en-US) AppleWebKit/534.30 (KHTML, like Gecko) Chrome/12.0.750.0 Safari/534.30","225":"Mozilla/5.0 (X11; CrOS i686 12.433.109) AppleWebKit/534.30 (KHTML, like Gecko) Chrome/12.0.742.93 Safari/534.30","226":"Mozilla/5.0 (X11; CrOS i686 12.0.742.91) AppleWebKit/534.30 (KHTML, like Gecko) Chrome/12.0.742.93 Safari/534.30","227":"Mozilla/5.0 Slackware/13.37 (X11; U; Linux x86_64; en-US) AppleWebKit/534.16 (KHTML, like Gecko) Chrome/12.0.742.91","228":"Mozilla/5.0 (X11; Linux i686) AppleWebKit/534.30 (KHTML, like Gecko) Chrome/12.0.742.91 Chromium/12.0.742.91 Safari/534.30","229":"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_6_8) AppleWebKit/534.30 (KHTML, like Gecko) Chrome/12.0.742.68 Safari/534.30","230":"Mozilla/5.0 ArchLinux (X11; U; Linux x86_64; en-US) AppleWebKit/534.30 (KHTML, like Gecko) Chrome/12.0.742.60 Safari/534.30","231":"Mozilla/5.0 (Windows NT 6.1; WOW64) AppleWebKit/534.30 (KHTML, like Gecko) Chrome/12.0.742.53 Safari/534.30","232":"Mozilla/5.0 (Windows NT 6.1) AppleWebKit/534.30 (KHTML, like Gecko) Chrome/12.0.742.113 Safari/534.30","233":"Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/534.30 (KHTML, like Gecko) Ubuntu/11.04 Chromium/12.0.742.112 Chrome/12.0.742.112 Safari/534.30","234":"Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/534.30 (KHTML, like Gecko) Ubuntu/10.10 Chromium/12.0.742.112 Chrome/12.0.742.112 Safari/534.30","235":"Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/534.30 (KHTML, like Gecko) Ubuntu/10.04 Chromium/12.0.742.112 Chrome/12.0.742.112 Safari/534.30","236":"Mozilla/5.0 (X11; Linux i686) AppleWebKit/534.30 (KHTML, like Gecko) Ubuntu/11.04 Chromium/12.0.742.112 Chrome/12.0.742.112 Safari/534.30","237":"Mozilla/5.0 (X11; Linux i686) AppleWebKit/534.30 (KHTML, like Gecko) Ubuntu/10.10 Chromium/12.0.742.112 Chrome/12.0.742.112 Safari/534.30","238":"Mozilla/5.0 (X11; Linux i686) AppleWebKit/534.30 (KHTML, like Gecko) Ubuntu/10.04 Chromium/12.0.742.112 Chrome/12.0.742.112 Safari/534.30","239":"Mozilla/5.0 (Windows NT 7.1) AppleWebKit/534.30 (KHTML, like Gecko) Chrome/12.0.742.112 Safari/534.30","240":"Mozilla/5.0 (Windows NT 5.2) AppleWebKit/534.30 (KHTML, like Gecko) Chrome/12.0.742.112 Safari/534.30","241":"Mozilla/5.0 (Windows 8) AppleWebKit/534.30 (KHTML, like Gecko) Chrome/12.0.742.112 Safari/534.30","242":"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_6_6) AppleWebKit/534.30 (KHTML, like Gecko) Chrome/12.0.742.112 Safari/534.30","243":"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_6_4) AppleWebKit/534.30 (KHTML, like Gecko) Chrome/12.0.742.112 Safari/534.30","244":"Mozilla/5.0 (X11; CrOS i686 12.433.216) AppleWebKit/534.30 (KHTML, like Gecko) Chrome/12.0.742.105 Safari/534.30","245":"Mozilla/5.0 ArchLinux (X11; U; Linux x86_64; en-US) AppleWebKit/534.30 (KHTML, like Gecko) Chrome/12.0.742.100 Safari/534.30","246":"Mozilla/5.0 ArchLinux (X11; U; Linux x86_64; en-US) AppleWebKit/534.30 (KHTML, like Gecko) Chrome/12.0.742.100","247":"Mozilla/5.0 (X11; Linux i686) AppleWebKit/534.30 (KHTML, like Gecko) Slackware/Chrome/12.0.742.100 Safari/534.30","248":"Mozilla/5.0 (X11; Linux i686) AppleWebKit/534.30 (KHTML, like Gecko) Chrome/12.0.742.100 Safari/534.30","249":"Mozilla/5.0 (Windows NT 6.0) AppleWebKit/534.30 (KHTML, like Gecko) Chrome/12.0.742.100 Safari/534.30","250":"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_7_0) AppleWebKit/534.30 (KHTML, like Gecko) Chrome/12.0.742.100 Safari/534.30","251":"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_6_4) AppleWebKit/534.30 (KHTML, like Gecko) Chrome/12.0.742.100 Safari/534.30","252":"Mozilla/5.0 (Windows; U; Windows NT 5.1; en-US) AppleWebKit/534.30 (KHTML, like Gecko) Chrome/12.0.724.100 Safari/534.30","253":"Mozilla/5.0 (Windows NT 5.1) AppleWebKit/534.25 (KHTML, like Gecko) Chrome/12.0.706.0 Safari/534.25","254":"Mozilla/5.0 (Windows NT 5.1) AppleWebKit/534.25 (KHTML, like Gecko) Chrome/12.0.704.0 Safari/534.25","255":"Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/534.24 (KHTML, like Gecko) Ubuntu/10.10 Chromium/12.0.703.0 Chrome/12.0.703.0 Safari/534.24","256":"Mozilla/5.0 (X11; Linux i686) AppleWebKit/534.24 (KHTML, like Gecko) Ubuntu/10.10 Chromium/12.0.702.0 Chrome/12.0.702.0 Safari/534.24","257":"Mozilla/5.0 (Windows NT 6.1; WOW64) AppleWebKit/534.24 (KHTML, like Gecko) Chrome/12.0.702.0 Safari/534.24","258":"Mozilla/5.0 (Windows NT 6.1) AppleWebKit/534.24 (KHTML, like Gecko) Chrome/12.0.702.0 Safari/534.24","259":"Mozilla/5.0 (Windows NT 5.1) AppleWebKit/534.24 (KHTML, like Gecko) Chrome/11.0.700.3 Safari/534.24","260":"Mozilla/5.0 (Windows NT 6.1) AppleWebKit/534.24 (KHTML, like Gecko) Chrome/11.0.699.0 Safari/534.24","261":"Mozilla/5.0 (Windows NT 6.0; WOW64) AppleWebKit/534.24 (KHTML, like Gecko) Chrome/11.0.699.0 Safari/534.24","262":"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_6_6) AppleWebKit/534.24 (KHTML, like Gecko) Chrome/11.0.698.0 Safari/534.24","263":"Mozilla/5.0 (Windows NT 6.1) AppleWebKit/534.24 (KHTML, like Gecko) Chrome/11.0.697.0 Safari/534.24","264":"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_6_8) AppleWebKit/534.24 (KHTML, like Gecko) Chrome/11.0.696.71 Safari/534.24","265":"Mozilla/5.0 (Windows NT 6.1) AppleWebKit/534.24 (KHTML, like Gecko) Chrome/11.0.696.68 Safari/534.24","266":"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_6_7) AppleWebKit/534.24 (KHTML, like Gecko) Chrome/11.0.696.68 Safari/534.24","267":"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_5_8) AppleWebKit/534.24 (KHTML, like Gecko) Chrome/11.0.696.68 Safari/534.24","268":"Mozilla/5.0 Slackware/13.37 (X11; U; Linux x86_64; en-US) AppleWebKit/534.16 (KHTML, like Gecko) Chrome/11.0.696.50","269":"Mozilla/5.0 (Windows NT 5.1) AppleWebKit/534.24 (KHTML, like Gecko) Chrome/11.0.696.43 Safari/534.24","270":"Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/534.24 (KHTML, like Gecko) Chrome/11.0.696.34 Safari/534.24","271":"Mozilla/5.0 (Windows NT 6.0; WOW64) AppleWebKit/534.24 (KHTML, like Gecko) Chrome/11.0.696.34 Safari/534.24","272":"Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/534.24 (KHTML, like Gecko) Chrome/11.0.696.3 Safari/534.24","273":"Mozilla/5.0 (Windows NT 6.1) AppleWebKit/534.24 (KHTML, like Gecko) Chrome/11.0.696.3 Safari/534.24","274":"Mozilla/5.0 (Windows NT 6.0) AppleWebKit/534.24 (KHTML, like Gecko) Chrome/11.0.696.3 Safari/534.24","275":"Mozilla/5.0 (X11; Linux i686) AppleWebKit/534.24 (KHTML, like Gecko) Chrome/11.0.696.14 Safari/534.24","276":"Mozilla/5.0 (Windows NT 6.1; WOW64) AppleWebKit/534.24 (KHTML, like Gecko) Chrome/11.0.696.12 Safari/534.24","277":"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_6_6) AppleWebKit/534.24 (KHTML, like Gecko) Chrome/11.0.696.12 Safari/534.24","278":"Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/534.24 (KHTML, like Gecko) Ubuntu/10.04 Chromium/11.0.696.0 Chrome/11.0.696.0 Safari/534.24","279":"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_7_0) AppleWebKit/534.24 (KHTML, like Gecko) Chrome/11.0.696.0 Safari/534.24","280":"Mozilla/5.0 (Windows NT 6.1) AppleWebKit/534.24 (KHTML, like Gecko) Chrome/11.0.694.0 Safari/534.24","281":"Mozilla/5.0 (X11; Linux i686) AppleWebKit/534.23 (KHTML, like Gecko) Chrome/11.0.686.3 Safari/534.23","282":"Mozilla/5.0 (Windows; U; Windows NT 5.1; en-US) AppleWebKit/534.21 (KHTML, like Gecko) Chrome/11.0.682.0 Safari/534.21","283":"Mozilla/5.0 (Windows; U; Windows NT 5.1; en-US) AppleWebKit/534.21 (KHTML, like Gecko) Chrome/11.0.678.0 Safari/534.21","284":"Mozilla/5.0 (Macintosh; U; Intel Mac OS X 10_7_0; en-US) AppleWebKit/534.21 (KHTML, like Gecko) Chrome/11.0.678.0 Safari/534.21","285":"Mozilla/5.0 (Windows; U; Windows NT 6.0; en-US) AppleWebKit/534.20 (KHTML, like Gecko) Chrome/11.0.672.2 Safari/534.20","286":"Mozilla/5.0 (Windows NT) AppleWebKit/534.20 (KHTML, like Gecko) Chrome/11.0.672.2 Safari/534.20","287":"Mozilla/5.0 (Macintosh; U; Intel Mac OS X 10_6_6; en-US) AppleWebKit/534.20 (KHTML, like Gecko) Chrome/11.0.672.2 Safari/534.20","288":"Mozilla/5.0 (Windows; U; Windows NT 6.1; en-US) AppleWebKit/534.20 (KHTML, like Gecko) Chrome/11.0.669.0 Safari/534.20","289":"Mozilla/5.0 (Windows; U; Windows NT 5.1; en-US) AppleWebKit/534.19 (KHTML, like Gecko) Chrome/11.0.661.0 Safari/534.19","290":"Mozilla/5.0 (Windows; U; Windows NT 5.1; en-US) AppleWebKit/534.18 (KHTML, like Gecko) Chrome/11.0.661.0 Safari/534.18","291":"Mozilla/5.0 (Macintosh; U; Intel Mac OS X 10_6_6; en-US) AppleWebKit/534.18 (KHTML, like Gecko) Chrome/11.0.660.0 Safari/534.18","292":"Mozilla/5.0 (Windows; U; Windows NT 6.1; en-US) AppleWebKit/534.17 (KHTML, like Gecko) Chrome/11.0.655.0 Safari/534.17","293":"Mozilla/5.0 (Macintosh; U; Intel Mac OS X 10_6_4; en-US) AppleWebKit/534.17 (KHTML, like Gecko) Chrome/11.0.655.0 Safari/534.17","294":"Mozilla/5.0 (Windows; U; Windows NT 6.1; en-US) AppleWebKit/534.17 (KHTML, like Gecko) Chrome/11.0.654.0 Safari/534.17","295":"Mozilla/5.0 (Windows; U; Windows NT 5.2; en-US) AppleWebKit/534.17 (KHTML, like Gecko) Chrome/11.0.652.0 Safari/534.17","296":"Mozilla/4.0 (Windows NT 6.3; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/11.0.1245.0 Safari/537.36","297":"Mozilla/5.0 (Windows; U; Windows NT 6.1; en-US) AppleWebKit/534.17 (KHTML, like Gecko) Chrome/10.0.649.0 Safari/534.17","298":"Mozilla/5.0 (Windows; U; Windows NT 6.1; de-DE) AppleWebKit/534.17 (KHTML, like Gecko) Chrome/10.0.649.0 Safari/534.17","299":"Mozilla/5.0 (X11; U; Linux x86_64; en-US) AppleWebKit/534.16 (KHTML, like Gecko) Chrome/10.0.648.82 Safari/534.16","300":"Mozilla/5.0 (X11; U; Linux armv7l; en-US) AppleWebKit/534.16 (KHTML, like Gecko) Chrome/10.0.648.204 Safari/534.16","301":"Mozilla/5.0 (X11; U; FreeBSD x86_64; en-US) AppleWebKit/534.16 (KHTML, like Gecko) Chrome/10.0.648.204 Safari/534.16","302":"Mozilla/5.0 (X11; U; FreeBSD i386; en-US) AppleWebKit/534.16 (KHTML, like Gecko) Chrome/10.0.648.204 Safari/534.16","303":"Mozilla/5.0 (Macintosh; U; Intel Mac OS X 10_6_5; en-US) AppleWebKit/534.16 (KHTML, like Gecko) Chrome/10.0.648.204","304":"Mozilla/5.0 (X11; U; Linux i686; en-US) AppleWebKit/534.16 (KHTML, like Gecko) Chrome/10.0.648.134 Safari/534.16","305":"Mozilla/5.0 (Windows; U; Windows NT 6.1; en-US) AppleWebKit/534.16 (KHTML, like Gecko) Chrome/10.0.648.134 Safari/534.16","306":"Mozilla/5.0 (Windows; U; Windows NT 5.1; en-US) AppleWebKit/534.16 (KHTML, like Gecko) Chrome/10.0.648.134 Safari/534.16","307":"Mozilla/5.0 (Macintosh; U; Intel Mac OS X 10_6_6; en-US) AppleWebKit/534.16 (KHTML, like Gecko) Chrome/10.0.648.134 Safari/534.16","308":"Mozilla/5.0 (X11; U; Linux x86_64; en-US) AppleWebKit/534.16 (KHTML, like Gecko) Ubuntu/10.10 Chromium/10.0.648.133 Chrome/10.0.648.133 Safari/534.16","309":"Mozilla/5.0 (X11; U; Linux x86_64; en-US) AppleWebKit/534.16 (KHTML, like Gecko) Chrome/10.0.648.133 Safari/534.16","310":"Mozilla/5.0 (X11; U; Linux i686; en-US) AppleWebKit/534.16 (KHTML, like Gecko) Ubuntu/10.10 Chromium/10.0.648.133 Chrome/10.0.648.133 Safari/534.16","311":"Mozilla/5.0 (X11; U; Linux i686; en-US) AppleWebKit/534.16 (KHTML, like Gecko) Chrome/10.0.648.133 Safari/534.16","312":"Mozilla/5.0 (Windows; U; Windows NT 6.0; en-US) AppleWebKit/534.16 (KHTML, like Gecko) Chrome/10.0.648.133 Safari/534.16","313":"Mozilla/5.0 (Macintosh; U; Intel Mac OS X 10_6_3; en-US) AppleWebKit/534.16 (KHTML, like Gecko) Chrome/10.0.648.133 Safari/534.16","314":"Mozilla/5.0 (Macintosh; U; Intel Mac OS X 10_6_2; en-US) AppleWebKit/534.16 (KHTML, like Gecko) Chrome/10.0.648.133 Safari/534.16","315":"Mozilla/5.0 (X11; U; Linux x86_64; en-US) AppleWebKit/534.16 (KHTML, like Gecko) Ubuntu/10.10 Chromium/10.0.648.127 Chrome/10.0.648.127 Safari/534.16","316":"Mozilla/5.0 (X11; U; Linux x86_64; en-US) AppleWebKit/534.16 (KHTML, like Gecko) Chrome/10.0.648.127 Safari/534.16","317":"Mozilla/5.0 (Macintosh; U; Intel Mac OS X 10_6_4; en-US) AppleWebKit/534.16 (KHTML, like Gecko) Chrome/10.0.648.127 Safari/534.16","318":"Mozilla/5.0 (Macintosh; U; Intel Mac OS X 10_5_8; en-US) AppleWebKit/534.16 (KHTML, like Gecko) Chrome/10.0.648.127 Safari/534.16","319":"Mozilla/5.0 (X11; U; Linux x86_64; en-US) AppleWebKit/534.16 (KHTML, like Gecko) Chrome/10.0.648.11 Safari/534.16","320":"Mozilla/5.0 (Windows; U; Windows NT 6.1; ru-RU; AppleWebKit/534.16; KHTML; like Gecko; Chrome/10.0.648.11;Safari/534.16)","321":"Mozilla/5.0 (Windows; U; Windows NT 6.1; ru-RU) AppleWebKit/534.16 (KHTML, like Gecko) Chrome/10.0.648.11 Safari/534.16","322":"Mozilla/5.0 (Windows; U; Windows NT 6.1; en-US) AppleWebKit/534.16 (KHTML, like Gecko) Chrome/10.0.648.11 Safari/534.16","323":"Mozilla/5.0 (X11; U; Linux x86_64; en-US) AppleWebKit/534.16 (KHTML, like Gecko) Ubuntu/10.10 Chromium/10.0.648.0 Chrome/10.0.648.0 Safari/534.16","324":"Mozilla/5.0 (X11; U; Linux i686; en-US) AppleWebKit/534.16 (KHTML, like Gecko) Ubuntu/10.10 Chromium/10.0.648.0 Chrome/10.0.648.0 Safari/534.16","325":"Mozilla/5.0 (Macintosh; U; Intel Mac OS X 10_6_4; en-US) AppleWebKit/534.16 (KHTML, like Gecko) Chrome/10.0.648.0 Safari/534.16","326":"Mozilla/5.0 (X11; U; Linux x86_64; en-US) AppleWebKit/534.16 (KHTML, like Gecko) Ubuntu/10.10 Chromium/10.0.642.0 Chrome/10.0.642.0 Safari/534.16","327":"Mozilla/5.0 (Macintosh; U; Intel Mac OS X 10_6_5; en-US) AppleWebKit/534.16 (KHTML, like Gecko) Chrome/10.0.639.0 Safari/534.16","328":"Mozilla/5.0 (Windows; U; Windows NT 6.1; en-US) AppleWebKit/534.16 (KHTML, like Gecko) Chrome/10.0.638.0 Safari/534.16","329":"Mozilla/5.0 (X11; U; Linux i686 (x86_64); en-US) AppleWebKit/534.16 (KHTML, like Gecko) Chrome/10.0.634.0 Safari/534.16","330":"Mozilla/5.0 (Windows; U; Windows NT 5.1; en-US) AppleWebKit/534.16 (KHTML, like Gecko) Chrome/10.0.634.0 Safari/534.16","331":"Mozilla/5.0 (X11; U; Linux x86_64; en-US) AppleWebKit/534.16 SUSE/10.0.626.0 (KHTML, like Gecko) Chrome/10.0.626.0 Safari/534.16","332":"Mozilla/5.0 (X11; U; Linux x86_64; en-US) AppleWebKit/534.15 (KHTML, like Gecko) Chrome/10.0.613.0 Safari/534.15","333":"Mozilla/5.0 (X11; U; Linux i686; en-US) AppleWebKit/534.15 (KHTML, like Gecko) Ubuntu/10.10 Chromium/10.0.613.0 Chrome/10.0.613.0 Safari/534.15","334":"Mozilla/5.0 (X11; U; Linux i686; en-US) AppleWebKit/534.15 (KHTML, like Gecko) Ubuntu/10.04 Chromium/10.0.612.3 Chrome/10.0.612.3 Safari/534.15","335":"Mozilla/5.0 (X11; U; Linux i686; en-US) AppleWebKit/534.15 (KHTML, like Gecko) Chrome/10.0.612.1 Safari/534.15","336":"Mozilla/5.0 (X11; U; Linux i686; en-US) AppleWebKit/534.15 (KHTML, like Gecko) Ubuntu/10.10 Chromium/10.0.611.0 Chrome/10.0.611.0 Safari/534.15","337":"Mozilla/5.0 (Windows; U; Windows NT 5.1; en-US) AppleWebKit/534.14 (KHTML, like Gecko) Chrome/10.0.602.0 Safari/534.14","338":"Mozilla/5.0 (Windows; U; Windows NT 6.1; en-US) AppleWebKit/534.14 (KHTML, like Gecko) Chrome/10.0.601.0 Safari/534.14","339":"Mozilla/5.0 (Windows; U; Windows NT 5.1; en-US) AppleWebKit/534.14 (KHTML, like Gecko) Chrome/10.0.601.0 Safari/534.14","340":"Mozilla/5.0 (X11; U; Linux x86_64; en-US) AppleWebKit/540.0 (KHTML,like Gecko) Chrome/9.1.0.0 Safari/540.0","341":"Mozilla/5.0 (X11; U; Linux x86_64; en-US) AppleWebKit/540.0 (KHTML, like Gecko) Ubuntu/10.10 Chrome/9.1.0.0 Safari/540.0","342":"Mozilla/5.0 (Windows; U; Windows NT 6.0; en-US) AppleWebKit/534.14 (KHTML, like Gecko) Chrome/9.0.601.0 Safari/534.14","343":"Mozilla/5.0 (X11; U; Linux x86_64; en-US) AppleWebKit/534.14 (KHTML, like Gecko) Ubuntu/10.10 Chromium/9.0.600.0 Chrome/9.0.600.0 Safari/534.14","344":"Mozilla/5.0 (Windows; U; Windows NT 5.1; en-US) AppleWebKit/534.14 (KHTML, like Gecko) Chrome/9.0.600.0 Safari/534.14","345":"Mozilla/5.0 (Windows; U; Windows NT 5.1; en-US) AppleWebKit/534.13 (KHTML, like Gecko) Chrome/9.0.599.0 Safari/534.13","346":"Mozilla/5.0 (Windows; U; Windows NT 5.1; en-CA) AppleWebKit/534.13 (KHTML like Gecko) Chrome/9.0.597.98 Safari/534.13","347":"Mozilla/5.0 (X11; U; Linux i686; en-US) AppleWebKit/534.13 (KHTML, like Gecko) Chrome/9.0.597.84 Safari/534.13","348":"Mozilla/5.0 (X11; U; Linux i686; en-US) AppleWebKit/534.13 (KHTML, like Gecko) Chrome/9.0.597.44 Safari/534.13","349":"Mozilla/5.0 (Windows; U; Windows NT 6.1; en-US) AppleWebKit/534.13 (KHTML, like Gecko) Chrome/9.0.597.19 Safari/534.13","350":"Mozilla/5.0 (Windows; U; Windows NT 5.1; en-US) AppleWebKit/534.13 (KHTML, like Gecko) Chrome/9.0.597.15 Safari/534.13","351":"Mozilla/5.0 (Macintosh; U; Intel Mac OS X 10_6_5; en-US) AppleWebKit/534.13 (KHTML, like Gecko) Chrome/9.0.597.15 Safari/534.13","352":"Mozilla/5.0 (X11; U; Linux x86_64; en-US) AppleWebKit/534.13 (KHTML, like Gecko) Chrome/9.0.597.107 Safari/534.13 v1416758524.9051","353":"Mozilla/5.0 (X11; U; Linux x86_64; en-US) AppleWebKit/534.13 (KHTML, like Gecko) Chrome/9.0.597.107 Safari/534.13 v1416748405.3871","354":"Mozilla/5.0 (X11; U; Linux x86_64; en-US) AppleWebKit/534.13 (KHTML, like Gecko) Chrome/9.0.597.107 Safari/534.13 v1416670950.695","355":"Mozilla/5.0 (X11; U; Linux x86_64; en-US) AppleWebKit/534.13 (KHTML, like Gecko) Chrome/9.0.597.107 Safari/534.13 v1416664997.4379","356":"Mozilla/5.0 (X11; U; Linux x86_64; en-US) AppleWebKit/534.13 (KHTML, like Gecko) Chrome/9.0.597.107 Safari/534.13 v1333515017.9196","357":"Mozilla/5.0 (X11; U; Linux x86_64; en-US) AppleWebKit/534.13 (KHTML, like Gecko) Chrome/9.0.597.0 Safari/534.13","358":"Mozilla/5.0 (Windows; U; Windows NT 6.1; en-US) AppleWebKit/534.13 (KHTML, like Gecko) Chrome/9.0.597.0 Safari/534.13","359":"Mozilla/5.0 (Windows; U; Windows NT 6.0; en-US) AppleWebKit/534.13 (KHTML, like Gecko) Chrome/9.0.597.0 Safari/534.13","360":"Mozilla/5.0 (Windows; U; Windows NT 5.1; en-US) AppleWebKit/534.13 (KHTML, like Gecko) Chrome/9.0.597.0 Safari/534.13","361":"Mozilla/5.0 (Macintosh; U; Intel Mac OS X 10_6_5; en-US) AppleWebKit/534.13 (KHTML, like Gecko) Chrome/9.0.597.0 Safari/534.13","362":"Mozilla/5.0 (Macintosh; U; Intel Mac OS X 10_6_4; en-US) AppleWebKit/534.13 (KHTML, like Gecko) Chrome/9.0.597.0 Safari/534.13","363":"Mozilla/5.0 (Windows; U; Windows NT 6.1; en-US) AppleWebKit/534.13 (KHTML, like Gecko) Chrome/9.0.596.0 Safari/534.13","364":"Mozilla/5.0 (X11; U; Linux x86_64; en-US) AppleWebKit/534.13 (KHTML, like Gecko) Ubuntu/10.04 Chromium/9.0.595.0 Chrome/9.0.595.0 Safari/534.13","365":"Mozilla/5.0 (X11; U; Linux i686; en-US) AppleWebKit/534.13 (KHTML, like Gecko) Ubuntu/9.10 Chromium/9.0.592.0 Chrome/9.0.592.0 Safari/534.13","366":"Mozilla/5.0 (X11; U; Windows NT 6; en-US) AppleWebKit/534.12 (KHTML, like Gecko) Chrome/9.0.587.0 Safari/534.12","367":"Mozilla/5.0 (Windows U Windows NT 5.1 en-US) AppleWebKit/534.12 (KHTML, like Gecko) Chrome/9.0.583.0 Safari/534.12","368":"Mozilla/5.0 (X11; U; Linux i686; en-US) AppleWebKit/534.12 (KHTML, like Gecko) Chrome/9.0.579.0 Safari/534.12","369":"Mozilla/5.0 (X11; U; Linux i686 (x86_64); en-US) AppleWebKit/534.12 (KHTML, like Gecko) Chrome/9.0.576.0 Safari/534.12","370":"Mozilla/5.0 (X11; U; Linux x86_64; en-US) AppleWebKit/540.0 (KHTML, like Gecko) Ubuntu/10.10 Chrome/8.1.0.0 Safari/540.0","371":"Mozilla/5.0 (Windows; U; Windows NT 5.2; en-US) AppleWebKit/534.10 (KHTML, like Gecko) Chrome/8.0.558.0 Safari/534.10","372":"Mozilla/5.0 (X11; U; CrOS i686 0.9.130; en-US) AppleWebKit/534.10 (KHTML, like Gecko) Chrome/8.0.552.344 Safari/534.10","373":"Mozilla/5.0 (X11; U; CrOS i686 0.9.128; en-US) AppleWebKit/534.10 (KHTML, like Gecko) Chrome/8.0.552.343 Safari/534.10","374":"Mozilla/5.0 (X11; U; CrOS i686 0.9.128; en-US) AppleWebKit/534.10 (KHTML, like Gecko) Chrome/8.0.552.341 Safari/534.10","375":"Mozilla/5.0 (X11; U; CrOS i686 0.9.128; en-US) AppleWebKit/534.10 (KHTML, like Gecko) Chrome/8.0.552.339 Safari/534.10","376":"Mozilla/5.0 (X11; U; CrOS i686 0.9.128; en-US) AppleWebKit/534.10 (KHTML, like Gecko) Chrome/8.0.552.339","377":"Mozilla/5.0 (X11; U; Linux x86_64; en-US) AppleWebKit/534.10 (KHTML, like Gecko) Ubuntu/10.10 Chromium/8.0.552.237 Chrome/8.0.552.237 Safari/534.10","378":"Mozilla/5.0 (Windows; U; Windows NT 6.1; de-DE) AppleWebKit/534.10 (KHTML, like Gecko) Chrome/8.0.552.224 Safari/534.10","379":"Mozilla/5.0 (Windows; U; Windows NT 6.0; en-US) AppleWebKit/533.3 (KHTML, like Gecko) Chrome/8.0.552.224 Safari/533.3","380":"Mozilla/5.0 (Macintosh; U; Intel Mac OS X 10_6_8; en-US) AppleWebKit/534.10 (KHTML, like Gecko) Chrome/8.0.552.224 Safari/534.10","381":"Mozilla/5.0 (Macintosh; U; Intel Mac OS X 10_5_8; en-US) AppleWebKit/534.10 (KHTML, like Gecko) Chrome/8.0.552.224 Safari/534.10","382":"Mozilla/5.0 (X11; U; Linux x86_64; en-US) AppleWebKit/534.10 (KHTML, like Gecko) Chrome/8.0.552.215 Safari/534.10","383":"Mozilla/5.0 (Windows; U; Windows NT 6.1; en-US) AppleWebKit/534.10 (KHTML, like Gecko) Chrome/8.0.552.215 Safari/534.10","384":"Mozilla/5.0 (Windows; U; Windows NT 5.1; en-US) AppleWebKit/534.10 (KHTML, like Gecko) Chrome/8.0.552.215 Safari/534.10","385":"Mozilla/5.0 (Macintosh; U; Intel Mac OS X 10_6_4; en-US) AppleWebKit/534.10 (KHTML, like Gecko) Chrome/8.0.552.210 Safari/534.10","386":"Mozilla/5.0 (X11; U; Linux x86_64; en-US) AppleWebKit/534.10 (KHTML, like Gecko) Chrome/8.0.552.200 Safari/534.10","387":"Mozilla/5.0 (X11; U; Linux i686; en-US) AppleWebKit/534.10 (KHTML, like Gecko) Chrome/8.0.551.0 Safari/534.10","388":"Mozilla/5.0 (Windows; U; Windows NT 5.1; en-US) AppleWebKit/534.10 (KHTML, like Gecko) Chrome/7.0.548.0 Safari/534.10","389":"Mozilla/5.0 (X11; U; Linux x86_64; en-US) AppleWebKit/534.10 (KHTML, like Gecko) Chrome/7.0.544.0 Safari/534.10","390":"Mozilla/5.0 (X11; U; Linux x86_64; en-US; rv:1.9.1.15) Gecko/20101027 Mozilla/5.0 (Windows; U; Windows NT 5.2; en-US) AppleWebKit/534.10 (KHTML, like Gecko) Chrome/7.0.540.0 Safari/534.10","391":"Mozilla/5.0 (Windows; U; Windows NT 6.1; en-US) AppleWebKit/534.10 (KHTML, like Gecko) Chrome/7.0.540.0 Safari/534.10","392":"Mozilla/5.0 (Windows; U; Windows NT 6.1; de-DE) AppleWebKit/534.10 (KHTML, like Gecko) Chrome/7.0.540.0 Safari/534.10","393":"Mozilla/5.0 (Windows; U; Windows NT 5.2; en-US) AppleWebKit/534.10 (KHTML, like Gecko) Chrome/7.0.540.0 Safari/534.10","394":"Mozilla/5.0 (Windows; U; Windows NT 5.1; en-US) AppleWebKit/534.9 (KHTML, like Gecko) Chrome/7.0.531.0 Safari/534.9","395":"Mozilla/5.0 (Windows; U; Windows NT 6.0; en-US) AppleWebKit/534.8 (KHTML, like Gecko) Chrome/7.0.521.0 Safari/534.8","396":"Mozilla/5.0 (X11; U; Linux i686; en-US) AppleWebKit/534.7 (KHTML, like Gecko) Chrome/7.0.517.24 Safari/534.7","397":"Mozilla/5.0 (X11; U; Linux x86_64; fr-FR) AppleWebKit/534.7 (KHTML, like Gecko) Chrome/7.0.514.0 Safari/534.7","398":"Mozilla/5.0 (X11; U; Linux x86_64; en-US) AppleWebKit/534.7 (KHTML, like Gecko) Chrome/7.0.514.0 Safari/534.7","399":"Mozilla/5.0 (Windows; U; Windows NT 5.1; en-US) AppleWebKit/534.7 (KHTML, like Gecko) Chrome/7.0.514.0 Safari/534.7","400":"Mozilla/5.0 (Windows; U; Windows NT 5.1; en-US) AppleWebKit/534.6 (KHTML, like Gecko) Chrome/7.0.500.0 Safari/534.6","401":"Mozilla/5.0 (Windows; U; Windows NT 6.1; en-US) AppleWebKit/534.6 (KHTML, like Gecko) Chrome/7.0.498.0 Safari/534.6","402":"Mozilla/5.0 (ipad Windows; U; Windows NT 6.1; en-US) AppleWebKit/534.6 (KHTML, like Gecko) Chrome/7.0.498.0 Safari/534.6","403":"Mozilla/5.0 (Windows; U; Windows NT 5.1; en-US) AppleWebKit/525.13 (KHTML, like Gecko) Chrome/7.0.0 Safari/700.13","404":"Mozilla/5.0 (Windows; U; Windows NT 5.2; en-US) AppleWebKit/534.4 (KHTML, like Gecko) Chrome/6.0.481.0 Safari/534.4","405":"Mozilla/5.0 (Macintosh; U; Intel Mac OS X 10_6_1; en-US) AppleWebKit/534.3 (KHTML, like Gecko) Chrome/6.0.472.63 Safari/534.3","406":"Mozilla/5.0 (Windows; U; Windows NT 5.1; en-US) AppleWebKit/534.3 (KHTML, like Gecko) Chrome/6.0.472.53 Safari/534.3","407":"Mozilla/5.0 (Windows; U; Windows NT 5.2; en-US) AppleWebKit/534.3 (KHTML, like Gecko) Chrome/6.0.472.33 Safari/534.3","408":"Mozilla/5.0 (X11; U; Linux x86_64; en-US) AppleWebKit/534.3 (KHTML, like Gecko) Chrome/6.0.470.0 Safari/534.3","409":"Mozilla/5.0 (Windows; U; Windows NT 6.1; en-US) AppleWebKit/534.3 (KHTML, like Gecko) Chrome/6.0.464.0 Safari/534.3","410":"Mozilla/5.0 (Macintosh; U; Intel Mac OS X 10_6_4; en-US) AppleWebKit/534.3 (KHTML, like Gecko) Chrome/6.0.464.0 Safari/534.3","411":"Mozilla/5.0 (Windows; U; Windows NT 5.2; en-US) AppleWebKit/534.3 (KHTML, like Gecko) Chrome/6.0.463.0 Safari/534.3","412":"Mozilla/5.0 (X11; U; Linux i686; en-US) AppleWebKit/534.3 (KHTML, like Gecko) Chrome/6.0.462.0 Safari/534.3","413":"Mozilla/5.0 (Windows; U; Windows NT 5.2; en-US) AppleWebKit/534.3 (KHTML, like Gecko) Chrome/6.0.462.0 Safari/534.3","414":"Mozilla/5.0 (Windows; U; Windows NT 6.1; en-US) AppleWebKit/534.3 (KHTML, like Gecko) Chrome/6.0.461.0 Safari/534.3","415":"Mozilla/5.0 (Windows; U; Windows NT 5.1; en-US) AppleWebKit/534.3 (KHTML, like Gecko) Chrome/6.0.461.0 Safari/534.3","416":"Mozilla/5.0 (Macintosh; U; Intel Mac OS X 10_6_4; en-US) AppleWebKit/534.3 (KHTML, like Gecko) Chrome/6.0.461.0 Safari/534.3","417":"Mozilla/5.0 (X11; U; Linux i686; en-US) AppleWebKit/534.3 (KHTML, like Gecko) Chrome/6.0.460.0 Safari/534.3","418":"Mozilla/5.0 (Windows; U; Windows NT 6.1; en-US) AppleWebKit/534.3 (KHTML, like Gecko) Chrome/6.0.460.0 Safari/534.3","419":"Mozilla/5.0 (Windows; U; Windows NT 5.2; en-US) AppleWebKit/534.3 (KHTML, like Gecko) Chrome/6.0.460.0 Safari/534.3","420":"Mozilla/5.0 (Windows; U; Windows NT 6.1; en-US) AppleWebKit/534.3 (KHTML, like Gecko) Chrome/6.0.459.0 Safari/534.3","421":"Mozilla/5.0 (X11; U; Linux x86_64; en-US) AppleWebKit/534.3 (KHTML, like Gecko) Chrome/6.0.458.1 Safari/534.3","422":"Mozilla/5.0 (Windows; U; Windows NT 6.1; en-US) AppleWebKit/534.3 (KHTML, like Gecko) Chrome/6.0.458.1 Safari/534.3","423":"Mozilla/5.0 (Windows; U; Windows NT 6.0; en-US) AppleWebKit/534.3 (KHTML, like Gecko) Chrome/6.0.458.1 Safari/534.3","424":"Mozilla/5.0 (Windows; U; Windows NT 5.1; en-US) AppleWebKit/534.3 (KHTML, like Gecko) Chrome/6.0.458.1 Safari/534.3","425":"Mozilla/5.0 (Macintosh; U; Intel Mac OS X 10_6_4; en-US) AppleWebKit/534.3 (KHTML, like Gecko) Chrome/6.0.458.1 Safari/534.3","426":"Mozilla/5.0 (X11; U; Linux i686; en-US) AppleWebKit/534.3 (KHTML, like Gecko) Chrome/6.0.458.0 Safari/534.3","427":"Mozilla/5.0 (Windows; U; Windows NT 5.2; en-US) AppleWebKit/534.3 (KHTML, like Gecko) Chrome/6.0.458.0 Safari/534.3","428":"Mozilla/5.0 (X11; U; Linux i686; en-US) AppleWebKit/534.3 (KHTML, like Gecko) Chrome/6.0.457.0 Safari/534.3","429":"Mozilla/5.0 (Macintosh; U; Intel Mac OS X 10_6_3; en-US) AppleWebKit/534.3 (KHTML, like Gecko) Chrome/6.0.456.0 Safari/534.3","430":"Mozilla/5.0 (Windows; U; Windows NT 6.1; en-US) AppleWebKit/534.2 (KHTML, like Gecko) Chrome/6.0.454.0 Safari/534.2","431":"Mozilla/5.0 (Windows; U; Windows NT 5.2; en-US) AppleWebKit/534.2 (KHTML, like Gecko) Chrome/6.0.454.0 Safari/534.2","432":"Mozilla/5.0 (X11; U; Linux i686; en-US) AppleWebKit/534.2 (KHTML, like Gecko) Chrome/6.0.453.1 Safari/534.2","433":"Mozilla/5.0 (Macintosh; U; Intel Mac OS X 10_6_3; en-US) AppleWebKit/534.2 (KHTML, like Gecko) Chrome/6.0.453.1 Safari/534.2","434":"Mozilla/5.0 (Macintosh; U; Intel Mac OS X 10_5_8; en-US) AppleWebKit/534.2 (KHTML, like Gecko) Chrome/6.0.453.1 Safari/534.2","435":"Mozilla/5.0 (Macintosh; U; Intel Mac OS X 10_6_4; en-US) AppleWebKit/534.2 (KHTML, like Gecko) Chrome/6.0.451.0 Safari/534.2","436":"Mozilla/5.0 (X11; U; Linux i686; en-US) AppleWebKit/534.1 SUSE/6.0.428.0 (KHTML, like Gecko) Chrome/6.0.428.0 Safari/534.1","437":"Mozilla/5.0 (Windows; U; Windows NT 6.1; en-US) AppleWebKit/534.1 (KHTML, like Gecko) Chrome/6.0.428.0 Safari/534.1","438":"Mozilla/5.0 (Windows; U; Windows NT 6.1; en-GB) AppleWebKit/534.1 (KHTML, like Gecko) Chrome/6.0.428.0 Safari/534.1","439":"Mozilla/5.0 (Macintosh; U; Intel Mac OS X 10_6_3; en-US) AppleWebKit/534.1 (KHTML, like Gecko) Chrome/6.0.428.0 Safari/534.1","440":"Mozilla/5.0 (X11; U; Linux x86_64; en-US) AppleWebKit/534.1 (KHTML, like Gecko) Chrome/6.0.427.0 Safari/534.1","441":"Mozilla/5.0 (Macintosh; U; Intel Mac OS X 10_5_8; en-US) AppleWebKit/534.1 (KHTML, like Gecko) Chrome/6.0.422.0 Safari/534.1","442":"Mozilla/5.0 (X11; U; Linux x86_64; en-US) AppleWebKit/534.1 (KHTML, like Gecko) Chrome/6.0.417.0 Safari/534.1","443":"Mozilla/5.0 (X11; U; Linux i686; en-US) AppleWebKit/534.1 (KHTML, like Gecko) Chrome/6.0.416.0 Safari/534.1","444":"Mozilla/5.0 (Macintosh; U; Intel Mac OS X 10_6_4; en-US) AppleWebKit/534.1 (KHTML, like Gecko) Chrome/6.0.414.0 Safari/534.1","445":"Mozilla/5.0 (Windows; U; Windows NT 6.1; en-US) AppleWebKit/533.9 (KHTML, like Gecko) Chrome/6.0.400.0 Safari/533.9","446":"Mozilla/5.0 (Windows; U; Windows NT 5.1; en-US) AppleWebKit/533.8 (KHTML, like Gecko) Chrome/6.0.397.0 Safari/533.8","447":"Mozilla/5.0 (Windows; U; Windows NT 6.1; en-US) AppleWebKit/533.2 (KHTML, like Gecko) Chrome/6.0","448":"Mozilla/5.0 (Windows; U; Windows NT 6.1; en-US) AppleWebKit/533.4 (KHTML, like Gecko) Chrome/5.0.375.999 Safari/533.4","449":"Mozilla/5.0 (X11; U; Linux x86_64; en-US) AppleWebKit/533.4 (KHTML, like Gecko) Chrome/5.0.375.99 Safari/533.4","450":"Mozilla/5.0 (Windows; U; Windows NT 5.2; en-US) AppleWebKit/533.4 (KHTML, like Gecko) Chrome/5.0.375.99 Safari/533.4","451":"Mozilla/5.0 (Macintosh; U; Intel Mac OS X 10_6_2; en-US) AppleWebKit/533.4 (KHTML, like Gecko) Chrome/5.0.375.99 Safari/533.4","452":"Mozilla/5.0 (Macintosh; U; Intel Mac OS X 10_6_0; en-US) AppleWebKit/533.4 (KHTML, like Gecko) Chrome/5.0.375.99 Safari/533.4","453":"Mozilla/5.0 (Macintosh; U; Intel Mac OS X 10_5_6; en-US) AppleWebKit/533.4 (KHTML, like Gecko) Chrome/5.0.375.99 Safari/533.4","454":"Mozilla/5.0 (Macintosh; U; Intel Mac OS X; en-US) AppleWebKit/533.4 (KHTML, like Gecko) Chrome/5.0.375.86 Safari/533.4","455":"Mozilla/5.0 (Macintosh; U; Intel Mac OS X 10_6_1; en-US) AppleWebKit/533.4 (KHTML, like Gecko) Chrome/5.0.375.86 Safari/533.4","456":"Mozilla/5.0 (Macintosh; U; Intel Mac OS X 10_6_0; en-US) AppleWebKit/533.4 (KHTML, like Gecko) Chrome/5.0.375.86 Safari/533.4","457":"Mozilla/5.0 (Macintosh; U; Intel Mac OS X 10_6_2; en-US) AppleWebKit/533.4 (KHTML, like Gecko) Chrome/5.0.375.70 Safari/533.4","458":"Mozilla/5.0 (Windows; U; Windows NT 6.0; en-US) AppleWebKit/533.4 (KHTML, like Gecko) Chrome/5.0.375.127 Safari/533.4","459":"Mozilla/5.0 (Windows; U; Windows NT 5.2; en-US) AppleWebKit/533.4 (KHTML, like Gecko) Chrome/5.0.375.126 Safari/533.4","460":"Mozilla/5.0 (Macintosh; U; Intel Mac OS X 10_6_4; fr-FR) AppleWebKit/533.4 (KHTML, like Gecko) Chrome/5.0.375.126 Safari/533.4","461":"Mozilla/5.0 (Macintosh; U; Intel Mac OS X 10_6_8; en-US) AppleWebKit/533.4 (KHTML, like Gecko) Chrome/5.0.375.125 Safari/533.4","462":"Mozilla/5.0 (Windows; U; Windows NT 6.1; en-US) AppleWebKit/533.4 (KHTML, like Gecko) Chrome/5.0.370.0 Safari/533.4","463":"Mozilla/5.0 (X11; U; Linux x86_64; en-US) AppleWebKit/533.4 (KHTML, like Gecko) Chrome/5.0.368.0 Safari/533.4","464":"Mozilla/5.0 (X11; U; Linux i686; en-US) AppleWebKit/533.4 (KHTML, like Gecko) Chrome/5.0.366.2 Safari/533.4","465":"Mozilla/5.0 (Macintosh; U; Intel Mac OS X 10_6_3; en-US) AppleWebKit/533.4 (KHTML, like Gecko) Chrome/5.0.366.0 Safari/533.4","466":"Mozilla/5.0 (Macintosh; U; Intel Mac OS X 10_6_2; en-US) AppleWebKit/533.4 (KHTML, like Gecko) Chrome/5.0.366.0 Safari/533.4","467":"Mozilla/5.0 (Macintosh; U; Intel Mac OS X 10_6_3; en-US) AppleWebKit/533.3 (KHTML, like Gecko) Chrome/5.0.363.0 Safari/533.3","468":"Mozilla/5.0 (X11; U; OpenBSD i386; en-US) AppleWebKit/533.3 (KHTML, like Gecko) Chrome/5.0.359.0 Safari/533.3","469":"Mozilla/5.0 (X11; U; x86_64 Linux; en_GB, en_US) AppleWebKit/533.3 (KHTML, like Gecko) Chrome/5.0.358.0 Safari/533.3","470":"Mozilla/5.0 (X11; U; Linux x86_64; en-US) AppleWebKit/533.3 (KHTML, like Gecko) Chrome/5.0.358.0 Safari/533.3","471":"Mozilla/5.0 (X11; U; Linux i686; en-US) AppleWebKit/533.3 (KHTML, like Gecko) Chrome/5.0.358.0 Safari/533.3","472":"Mozilla/5.0 (Windows; U; Windows NT 5.1; en-US) AppleWebKit/533.3 (KHTML, like Gecko) Chrome/5.0.357.0 Safari/533.3","473":"Mozilla/5.0 (Windows; U; Windows NT 5.1; en-US) AppleWebKit/533.3 (KHTML, like Gecko) Chrome/5.0.356.0 Safari/533.3","474":"Mozilla/5.0 (Windows; U; Windows NT 5.1; en-US) AppleWebKit/533.3 (KHTML, like Gecko) Chrome/5.0.355.0 Safari/533.3","475":"Mozilla/5.0 (X11; U; Linux x86_64; en-US) AppleWebKit/533.3 (KHTML, like Gecko) Chrome/5.0.354.0 Safari/533.3","476":"Mozilla/5.0 (Windows; U; Windows NT 6.1; en-US) AppleWebKit/533.3 (KHTML, like Gecko) Chrome/5.0.354.0 Safari/533.3","477":"Mozilla/5.0 (X11; U; Linux x86_64; en-US) AppleWebKit/533.3 (KHTML, like Gecko) Chrome/5.0.353.0 Safari/533.3","478":"Mozilla/5.0 (Windows; U; Windows NT 5.1; en-US) AppleWebKit/533.3 (KHTML, like Gecko) Chrome/5.0.353.0 Safari/533.3","479":"Mozilla/5.0 (Macintosh; U; Intel Mac OS X 10_6_2; en-US) AppleWebKit/533.2 (KHTML, like Gecko) Chrome/5.0.343.0 Safari/533.2","480":"Mozilla/5.0 (Macintosh; U; Intel Mac OS X 10_5_8; en-US) AppleWebKit/533.2 (KHTML, like Gecko) Chrome/5.0.343.0 Safari/533.2","481":"Mozilla/5.0 (Macintosh; U; Intel Mac OS X 10_7_0; en-US) AppleWebKit/533.2 (KHTML, like Gecko) Chrome/5.0.342.7 Safari/533.2","482":"Mozilla/5.0 (Macintosh; U; Intel Mac OS X 10_6_4; en-US) AppleWebKit/533.2 (KHTML, like Gecko) Chrome/5.0.342.7 Safari/533.2","483":"Mozilla/5.0 (Windows; U; Windows NT 6.0; en-US) AppleWebKit/533.2 (KHTML, like Gecko) Chrome/5.0.342.5 Safari/533.2","484":"Mozilla/5.0 (X11; U; Linux x86_64; en-US) AppleWebKit/533.2 (KHTML, like Gecko) Chrome/5.0.342.3 Safari/533.2","485":"Mozilla/5.0 (Windows; U; Windows NT 6.1; en-US) AppleWebKit/533.2 (KHTML, like Gecko) Chrome/5.0.342.3 Safari/533.2","486":"Mozilla/5.0 (Windows; U; Windows NT 5.1; en-US) AppleWebKit/533.2 (KHTML, like Gecko) Chrome/5.0.342.2 Safari/533.2","487":"Mozilla/5.0 (X11; U; Linux x86_64; en-US) AppleWebKit/533.2 (KHTML, like Gecko) Chrome/5.0.342.1 Safari/533.2","488":"Mozilla/5.0 (X11; U; Linux i586; en-US) AppleWebKit/533.2 (KHTML, like Gecko) Chrome/5.0.342.1 Safari/533.2","489":"Mozilla/5.0 (Windows; U; Windows NT 6.0; en-US) AppleWebKit/533.2 (KHTML, like Gecko) Chrome/5.0.342.1 Safari/533.2","490":"Mozilla/5.0 (X11; U; Linux x86_64; en-US) AppleWebKit/533.1 (KHTML, like Gecko) Chrome/5.0.335.0 Safari/533.1","491":"Mozilla/5.0 (Windows; U; Windows NT 5.1; zh-CN) AppleWebKit/533.16 (KHTML, like Gecko) Chrome/5.0.335.0 Safari/533.16","492":"Mozilla/5.0 (Windows; U; Windows NT 5.2; en-US) AppleWebKit/532.9 (KHTML, like Gecko) Chrome/5.0.310.0 Safari/532.9","493":"Mozilla/5.0 (X11; U; Linux x86_64; en-US) AppleWebKit/532.9 (KHTML, like Gecko) Chrome/5.0.309.0 Safari/532.9","494":"Mozilla/5.0 (X11; U; Linux x86_64; en-US) AppleWebKit/532.9 (KHTML, like Gecko) Chrome/5.0.308.0 Safari/532.9","495":"Mozilla/5.0 (Macintosh; U; Intel Mac OS X 10_6_0; en-US) AppleWebKit/532.9 (KHTML, like Gecko) Chrome/5.0.307.11 Safari/532.9","496":"Mozilla/5.0 (Windows; U; Windows NT 6.1; en-US) AppleWebKit/532.9 (KHTML, like Gecko) Chrome/5.0.307.1 Safari/532.9","497":"Mozilla/5.0 (Windows; U; Windows NT 6.1; en-US) AppleWebKit/532.5 (KHTML, like Gecko) Chrome/4.1.249.1025 Safari/532.5","498":"Mozilla/5.0 (Macintosh; U; Intel Mac OS X 10_5_8; en-US) AppleWebKit/532.8 (KHTML, like Gecko) Chrome/4.0.302.2 Safari/532.8","499":"Mozilla/5.0 (Windows; U; Windows NT 5.1; en-US) AppleWebKit/532.8 (KHTML, like Gecko) Chrome/4.0.288.1 Safari/532.8","500":"Mozilla/5.0 (X11; U; Linux i686; en-US) AppleWebKit/532.8 (KHTML, like Gecko) Chrome/4.0.277.0 Safari/532.8","501":"Mozilla/5.0 (X11; U; Slackware Linux x86_64; en-US) AppleWebKit/532.5 (KHTML, like Gecko) Chrome/4.0.249.30 Safari/532.5","502":"Mozilla/5.0 (Windows; U; Windows NT 6.1; it-IT) AppleWebKit/532.5 (KHTML, like Gecko) Chrome/4.0.249.25 Safari/532.5","503":"Mozilla/5.0 (Windows; U; Windows NT 6.1; en-US) AppleWebKit/532.5 (KHTML, like Gecko) Chrome/4.0.249.0 Safari/532.5","504":"Mozilla/5.0 (Macintosh; U; Intel Mac OS X 10_8; en-US) AppleWebKit/532.5 (KHTML, like Gecko) Chrome/4.0.249.0 Safari/532.5","505":"Mozilla/5.0 (Windows; U; Windows NT 6.1; en-US) AppleWebKit/532.5 (KHTML, like Gecko) Chrome/4.0.246.0 Safari/532.5","506":"Mozilla/5.0 (Windows; U; Windows NT 6.0; en-US) AppleWebKit/532.4 (KHTML, like Gecko) Chrome/4.0.241.0 Safari/532.4","507":"Mozilla/5.0 (X11; U; Linux i686; en-US) AppleWebKit/532.4 (KHTML, like Gecko) Chrome/4.0.237.0 Safari/532.4 Debian","508":"Mozilla/5.0 (Windows; U; Windows NT 6.1; en-US) AppleWebKit/532.3 (KHTML, like Gecko) Chrome/4.0.227.0 Safari/532.3","509":"Mozilla/5.0 (Windows; U; Windows NT 6.0; en-US) AppleWebKit/532.3 (KHTML, like Gecko) Chrome/4.0.224.2 Safari/532.3","510":"Mozilla/5.0 (Windows; U; Windows NT 6.1; en-US) AppleWebKit/532.3 (KHTML, like Gecko) Chrome/4.0.223.5 Safari/532.3","511":"Mozilla/5.0 (Windows; U; Windows NT 5.1; en-US) AppleWebKit/532.2 (KHTML, like Gecko) Chrome/4.0.223.4 Safari/532.2","512":"Mozilla/5.0 (Windows; U; Windows NT 5.1; en-US) AppleWebKit/532.2 (KHTML, like Gecko) Chrome/4.0.223.3 Safari/532.2","513":"Mozilla/5.0 (Windows; U; Windows NT 5.1; de-DE) Chrome/4.0.223.3 Safari/532.2","514":"Mozilla/5.0 (X11; U; Linux x86_64; en-US) AppleWebKit/532.2 (KHTML, like Gecko) Chrome/4.0.223.2 Safari/532.2","515":"Mozilla/5.0 (X11; U; Linux i686; en-US) AppleWebKit/532.2 (KHTML, like Gecko) Chrome/4.0.223.2 Safari/532.2","516":"Mozilla/5.0 (Windows; U; Windows NT 5.2; en-US) AppleWebKit/532.2 (KHTML, like Gecko) Chrome/4.0.223.2 Safari/532.2","517":"Mozilla/5.0 (Windows; U; Windows NT 5.1; en-US) AppleWebKit/532.2 (KHTML, like Gecko) Chrome/4.0.223.2 Safari/532.2","518":"Mozilla/5.0 (X11; U; Linux i686; en-US) AppleWebKit/532.2 (KHTML, like Gecko) Chrome/4.0.223.1 Safari/532.2","519":"Mozilla/5.0 (Windows; U; Windows NT 6.1; en-US) AppleWebKit/532.2 (KHTML, like Gecko) Chrome/4.0.223.1 Safari/532.2","520":"Mozilla/5.0 (Windows; U; Windows NT 5.1; en-US) AppleWebKit/532.2 (KHTML, like Gecko) Chrome/4.0.223.1 Safari/532.2","521":"Mozilla/5.0 (Windows; U; Windows NT 6.0; en-US) AppleWebKit/532.2 (KHTML, like Gecko) Chrome/4.0.223.0 Safari/532.2","522":"Mozilla/5.0 (X11; U; Linux i686; en-US) AppleWebKit/532.2 (KHTML, like Gecko) Chrome/4.0.222.8 Safari/532.2","523":"Mozilla/5.0 (Windows; U; Windows NT 5.1; en-US) AppleWebKit/532.2 (KHTML, like Gecko) Chrome/4.0.222.7 Safari/532.2","524":"Mozilla/5.0 (X11; U; Linux x86_64; en-US) AppleWebKit/532.2 (KHTML, like Gecko) Chrome/4.0.222.6 Safari/532.2","525":"Mozilla/5.0 (X11; U; Linux i686; en-US) AppleWebKit/532.2 (KHTML, like Gecko) Chrome/4.0.222.6 Safari/532.2","526":"Mozilla/5.0 (Windows; U; Windows NT 5.2; en-US) AppleWebKit/532.2 (KHTML, like Gecko) Chrome/4.0.222.6 Safari/532.2","527":"Mozilla/5.0 (X11; U; Linux x86_64; en-US) AppleWebKit/532.2 (KHTML, like Gecko) Chrome/4.0.222.5 Safari/532.2","528":"Mozilla/5.0 (X11; U; Linux i686; en-US) AppleWebKit/532.2 (KHTML, like Gecko) Chrome/4.0.222.5 Safari/532.2","529":"Mozilla/5.0 (Windows; U; Windows NT 5.1; en-US) AppleWebKit/532.2 (KHTML, like Gecko) Chrome/4.0.222.5 Safari/532.2","530":"Mozilla/5.0 (Macintosh; U; Intel Mac OS X 10_5_8; en-US) AppleWebKit/532.2 (KHTML, like Gecko) Chrome/4.0.222.5 Safari/532.2","531":"Mozilla/5.0 (X11; U; Linux x86_64; en-US) AppleWebKit/532.2 (KHTML, like Gecko) Chrome/4.0.222.4 Safari/532.2","532":"Mozilla/5.0 (X11; U; Linux i686; en-US) AppleWebKit/532.2 (KHTML, like Gecko) Chrome/4.0.222.4 Safari/532.2","533":"Mozilla/5.0 (Windows; U; Windows NT 5.1; en-US) AppleWebKit/532.2 (KHTML, like Gecko) Chrome/4.0.222.4 Safari/532.2","534":"Mozilla/5.0 (Macintosh; U; Intel Mac OS X 10_6_1; en-US) AppleWebKit/532.2 (KHTML, like Gecko) Chrome/4.0.222.4 Safari/532.2","535":"Mozilla/5.0 (X11; U; Linux i686; en-US) AppleWebKit/532.2 (KHTML, like Gecko) Chrome/4.0.222.3 Safari/532.2","536":"Mozilla/5.0 (Windows; U; Windows NT 6.1; en-US) AppleWebKit/532.2 (KHTML, like Gecko) Chrome/4.0.222.3 Safari/532.2","537":"Mozilla/5.0 (Windows; U; Windows NT 5.1; en-US) AppleWebKit/532.2 (KHTML, like Gecko) Chrome/4.0.222.3 Safari/532.2","538":"Mozilla/5.0 (X11; U; Linux i686; en-US) AppleWebKit/532.2 (KHTML, like Gecko) Chrome/4.0.222.2 Safari/532.2","539":"Mozilla/5.0 (Macintosh; U; Intel Mac OS X 10_5_8; en-US) AppleWebKit/532.2 (KHTML, like Gecko) Chrome/4.0.222.2 Safari/532.2","540":"Mozilla/5.0 (Windows; U; Windows NT 6.1; en-US) AppleWebKit/532.2 (KHTML, like Gecko) Chrome/4.0.222.12 Safari/532.2","541":"Mozilla/5.0 (Windows; U; Windows NT 6.0; en-US) AppleWebKit/532.2 (KHTML, like Gecko) Chrome/4.0.222.12 Safari/532.2","542":"Mozilla/5.0 (Windows; U; Windows NT 5.1; en-US) AppleWebKit/532.2 (KHTML, like Gecko) Chrome/4.0.222.12 Safari/532.2","543":"Mozilla/5.0 (X11; U; Linux x86_64; en-US) AppleWebKit/532.2 (KHTML, like Gecko) Chrome/4.0.222.1 Safari/532.2","544":"Mozilla/5.0 (Windows; U; Windows NT 5.1; en-US) AppleWebKit/532.2 (KHTML, like Gecko) Chrome/4.0.222.0 Safari/532.2","545":"Mozilla/5.0 (X11; U; Linux i686; en-US) AppleWebKit/532.2 (KHTML, like Gecko) Chrome/4.0.221.8 Safari/532.2","546":"Mozilla/5.0 (X11; U; Linux i686 (x86_64); en-US) AppleWebKit/532.2 (KHTML, like Gecko) Chrome/4.0.221.8 Safari/532.2","547":"Mozilla/5.0 (Macintosh; U; Intel Mac OS X 10_6_1; en-US) AppleWebKit/532.2 (KHTML, like Gecko) Chrome/4.0.221.8 Safari/532.2","548":"Mozilla/5.0 (Macintosh; U; Intel Mac OS X 10_5_8; en-US) AppleWebKit/532.2 (KHTML, like Gecko) Chrome/4.0.221.8 Safari/532.2","549":"Mozilla/5.0 (X11; U; Linux x86_64; en-US) AppleWebKit/532.2 (KHTML, like Gecko) Chrome/4.0.221.7 Safari/532.2","550":"Mozilla/5.0 (Windows; U; Windows NT 6.0; en-US) AppleWebKit/532.2 (KHTML, like Gecko) Chrome/4.0.221.6 Safari/532.2","551":"Mozilla/5.0 (Windows; U; Windows NT 5.2; en-US) AppleWebKit/532.2 (KHTML, like Gecko) Chrome/4.0.221.6 Safari/532.2","552":"Mozilla/5.0 (Windows; U; Windows NT 5.1; en-US) AppleWebKit/532.2 (KHTML, like Gecko) Chrome/4.0.221.6 Safari/532.2","553":"Mozilla/5.0 (X11; U; Linux x86_64; en-US) AppleWebKit/532.2 (KHTML, like Gecko) Chrome/4.0.221.3 Safari/532.2","554":"Mozilla/5.0 (X11; U; Linux i686; en-US) AppleWebKit/532.2 (KHTML, like Gecko) Chrome/4.0.221.0 Safari/532.2","555":"Mozilla/5.0 (Windows; U; Windows NT 6.0; en-US) AppleWebKit/532.1 (KHTML, like Gecko) Chrome/4.0.220.1 Safari/532.1","556":"Mozilla/5.0 (Windows; U; Windows NT 5.1; en-US) AppleWebKit/532.1 (KHTML, like Gecko) Chrome/4.0.219.6 Safari/532.1","557":"Mozilla/5.0 (Windows; U; Windows NT 5.2; en-US) AppleWebKit/532.1 (KHTML, like Gecko) Chrome/4.0.219.5 Safari/532.1","558":"Mozilla/5.0 (Windows; U; Windows NT 5.1; en-US) AppleWebKit/532.1 (KHTML, like Gecko) Chrome/4.0.219.5 Safari/532.1","559":"Mozilla/5.0 (Windows; U; Windows NT 5.1; en-US) AppleWebKit/532.1 (KHTML, like Gecko) Chrome/4.0.219.4 Safari/532.1","560":"Mozilla/5.0 (X11; U; Linux x86_64; en-US) AppleWebKit/532.1 (KHTML, like Gecko) Chrome/4.0.219.3 Safari/532.1","561":"Mozilla/5.0 (Windows; U; Windows NT 5.2; en-US) AppleWebKit/532.1 (KHTML, like Gecko) Chrome/4.0.219.3 Safari/532.1","562":"Mozilla/5.0 (Windows; U; Windows NT 5.1; en-US) AppleWebKit/532.1 (KHTML, like Gecko) Chrome/4.0.219.3 Safari/532.1","563":"Mozilla/5.0 (Windows; U; Windows NT 5.1; en-US) AppleWebKit/532.1 (KHTML, like Gecko) Chrome/4.0.219.0 Safari/532.1","564":"Mozilla/5.0 (X11; U; Linux x86_64; en-US) AppleWebKit/532.1 (KHTML, like Gecko) Chrome/4.0.213.1 Safari/532.1","565":"Mozilla/5.0 (X11; U; Linux i686; en-US) AppleWebKit/532.1 (KHTML, like Gecko) Chrome/4.0.213.1 Safari/532.1","566":"Mozilla/5.0 (Windows; U; Windows NT 6.1; en-US) AppleWebKit/532.1 (KHTML, like Gecko) Chrome/4.0.213.1 Safari/532.1","567":"Mozilla/5.0 (Windows; U; Windows NT 6.0; en-US) AppleWebKit/532.1 (KHTML, like Gecko) Chrome/4.0.213.1 Safari/532.1","568":"Mozilla/5.0 (Windows; U; Windows NT 5.2; en-US) AppleWebKit/532.1 (KHTML, like Gecko) Chrome/4.0.213.1 Safari/532.1","569":"Mozilla/5.0 (Windows; U; Windows NT 5.1; en-US) AppleWebKit/532.1 (KHTML, like Gecko) Chrome/4.0.213.1 Safari/532.1","570":"Mozilla/5.0 (X11; U; Linux x86_64; en-US) AppleWebKit/532.1 (KHTML, like Gecko) Chrome/4.0.213.0 Safari/532.1","571":"Mozilla/5.0 (X11; U; Linux i686; en-US) AppleWebKit/532.1 (KHTML, like Gecko) Chrome/4.0.213.0 Safari/532.1","572":"Mozilla/5.0 (Windows; U; Windows NT 5.2; en-US) AppleWebKit/532.1 (KHTML, like Gecko) Chrome/4.0.213.0 Safari/532.1","573":"Mozilla/5.0 (Windows; U; Windows NT 5.1; en-US) AppleWebKit/532.1 (KHTML, like Gecko) Chrome/4.0.213.0 Safari/532.1","574":"Mozilla/5.0 (Macintosh; U; Intel Mac OS X 10_6_0; en-US) AppleWebKit/532.1 (KHTML, like Gecko) Chrome/4.0.212.1 Safari/532.1","575":"Mozilla/5.0 (Macintosh; U; Intel Mac OS X 10_5_7; en-US) AppleWebKit/532.1 (KHTML, like Gecko) Chrome/4.0.212.1 Safari/532.1","576":"Mozilla/5.0 (X11; U; Linux x86_64; en-US) AppleWebKit/532.0 (KHTML, like Gecko) Chrome/4.0.212.0 Safari/532.0","577":"Mozilla/5.0 (X11; U; Linux i686; en-US) AppleWebKit/532.1 (KHTML, like Gecko) Chrome/4.0.212.0 Safari/532.1","578":"Mozilla/5.0 (X11; U; Linux i686; en-US) AppleWebKit/532.0 (KHTML, like Gecko) Chrome/4.0.212.0 Safari/532.0","579":"Mozilla/5.0 (Windows; U; Windows NT 6.1; en-US) AppleWebKit/532.0 (KHTML, like Gecko) Chrome/4.0.212.0 Safari/532.0","580":"Mozilla/5.0 (Windows; U; Windows NT 5.2; en-US) AppleWebKit/532.0 (KHTML, like Gecko) Chrome/4.0.212.0 Safari/532.0","581":"Mozilla/5.0 (Windows; U; Windows NT 5.1; en-US) AppleWebKit/532.0 (KHTML, like Gecko) Chrome/4.0.212.0 Safari/532.0","582":"Mozilla/5.0 (Macintosh; U; Intel Mac OS X 10_6_1; en-US) AppleWebKit/532.0 (KHTML, like Gecko) Chrome/4.0.212.0 Safari/532.0","583":"Mozilla/5.0 (Windows; U; Windows NT 6.0; en-US) AppleWebKit/532.0 (KHTML, like Gecko) Chrome/4.0.211.7 Safari/532.0","584":"Mozilla/5.0 (Windows; U; Windows NT 5.1; en-US) AppleWebKit/532.0 (KHTML, like Gecko) Chrome/4.0.211.7 Safari/532.0","585":"Mozilla/5.0 (Windows; U; Windows NT 6.1; en-US) AppleWebKit/532.0 (KHTML, like Gecko) Chrome/4.0.211.4 Safari/532.0","586":"Mozilla/5.0 (Windows; U; Windows NT 6.0; en-US) AppleWebKit/532.0 (KHTML, like Gecko) Chrome/4.0.211.4 Safari/532.0","587":"Mozilla/5.0 (Windows; U; Windows NT 5.1; en-US) AppleWebKit/532.0 (KHTML, like Gecko) Chrome/4.0.211.4 Safari/532.0","588":"Mozilla/5.0 (X11; U; Linux x86_64; en-US) AppleWebKit/532.0 (KHTML, like Gecko) Chrome/4.0.211.2 Safari/532.0","589":"Mozilla/5.0 (X11; U; Linux i686; en-US) AppleWebKit/532.0 (KHTML, like Gecko) Chrome/4.0.211.2 Safari/532.0","590":"Mozilla/5.0 (Windows; U; Windows NT 6.0; en-US) AppleWebKit/532.0 (KHTML, like Gecko) Chrome/4.0.211.2 Safari/532.0","591":"Mozilla/5.0 (Windows; U; Windows NT 5.1; en-US) AppleWebKit/532.0 (KHTML, like Gecko) Chrome/4.0.211.2 Safari/532.0","592":"Mozilla/5.0 (Macintosh; U; Intel Mac OS X 10_6_1; en-US) AppleWebKit/532.0 (KHTML, like Gecko) Chrome/4.0.211.2 Safari/532.0","593":"Mozilla/5.0 (Macintosh; U; Intel Mac OS X 10_5_8; en-US) AppleWebKit/532.0 (KHTML, like Gecko) Chrome/4.0.211.2 Safari/532.0","594":"Mozilla/5.0 (X11; U; Linux x86_64; en-US) AppleWebKit/532.0 (KHTML, like Gecko) Chrome/4.0.211.0 Safari/532.0","595":"Mozilla/5.0 (X11; U; Linux i686; en-US) AppleWebKit/532.0 (KHTML, like Gecko) Chrome/4.0.211.0 Safari/532.0","596":"Mozilla/5.0 (Windows; U; Windows NT 6.1; en-US) AppleWebKit/532.0 (KHTML, like Gecko) Chrome/4.0.211.0 Safari/532.0","597":"Mozilla/5.0 (Windows; U; Windows NT 5.1; en-US) AppleWebKit/532.0 (KHTML, like Gecko) Chrome/4.0.211.0 Safari/532.0","598":"Mozilla/5.0 (Windows; U; Windows NT 5.2; en-US) AppleWebKit/532.0 (KHTML, like Gecko) Chrome/4.0.210.0 Safari/532.0","599":"Mozilla/5.0 (Macintosh; U; Intel Mac OS X 10_5_8; en-US) AppleWebKit/532.0 (KHTML, like Gecko) Chrome/4.0.210.0 Safari/532.0","600":"Mozilla/5.0 (X11; U; Linux x86_64; en-US) AppleWebKit/532.0 (KHTML, like Gecko) Chrome/4.0.209.0 Safari/532.0","601":"Mozilla/5.0 (X11; U; Linux i686; en-US) AppleWebKit/532.0 (KHTML, like Gecko) Chrome/4.0.209.0 Safari/532.0","602":"Mozilla/5.0 (Windows; U; Windows NT 5.1; en-US) AppleWebKit/532.0 (KHTML, like Gecko) Chrome/4.0.209.0 Safari/532.0","603":"Mozilla/5.0 (Macintosh; U; Intel Mac OS X 10_6_1; en-US) AppleWebKit/532.0 (KHTML, like Gecko) Chrome/4.0.209.0 Safari/532.0","604":"Mozilla/5.0 (X11; U; Linux x86_64; en-US) AppleWebKit/532.0 (KHTML, like Gecko) Chrome/4.0.208.0 Safari/532.0","605":"Mozilla/5.0 (Windows; U; Windows NT 6.1; en-US) AppleWebKit/532.0 (KHTML, like Gecko) Chrome/4.0.208.0 Safari/532.0","606":"Mozilla/5.0 (Windows; U; Windows NT 6.0; en-US) AppleWebKit/532.0 (KHTML, like Gecko) Chrome/4.0.208.0 Safari/532.0","607":"Mozilla/5.0 (Windows; U; Windows NT 5.1; en-US) AppleWebKit/532.0 (KHTML, like Gecko) Chrome/4.0.208.0 Safari/532.0","608":"Mozilla/5.0 (Macintosh; U; Intel Mac OS X 10_5_8; en-US) AppleWebKit/532.0 (KHTML, like Gecko) Chrome/4.0.208.0 Safari/532.0","609":"Mozilla/5.0 (X11; U; Linux x86_64; en-US) AppleWebKit/532.0 (KHTML, like Gecko) Chrome/4.0.207.0 Safari/532.0","610":"Mozilla/5.0 (X11; U; Linux i686; en-US) AppleWebKit/532.0 (KHTML, like Gecko) Chrome/4.0.207.0 Safari/532.0","611":"Mozilla/5.0 (X11; U; FreeBSD i386; en-US) AppleWebKit/532.0 (KHTML, like Gecko) Chrome/4.0.207.0 Safari/532.0","612":"Mozilla/5.0 (Windows; U; Windows NT 6.0; en-US) AppleWebKit/532.0 (KHTML, like Gecko) Chrome/4.0.207.0 Safari/532.0","613":"Mozilla/5.0 (Windows; U; Windows NT 5.1; en-US) AppleWebKit/532.0 (KHTML, like Gecko) Chrome/4.0.207.0 Safari/532.0","614":"Mozilla/5.0 (Macintosh; U; Intel Mac OS X 10_6_1; en-US) AppleWebKit/532.0 (KHTML, like Gecko) Chrome/4.0.207.0 Safari/532.0","615":"Mozilla/5.0 (Macintosh; U; Intel Mac OS X 10_5_8; en-US) AppleWebKit/532.0 (KHTML, like Gecko) Chrome/4.0.207.0 Safari/532.0","616":"Mozilla/5.0 (X11; U; Linux i686; en-US) AppleWebKit/532.0 (KHTML, like Gecko) Chrome/4.0.206.1 Safari/532.0","617":"Mozilla/5.0 (Windows; U; Windows NT 6.1; en-US) AppleWebKit/532.0 (KHTML, like Gecko) Chrome/4.0.206.1 Safari/532.0","618":"Mozilla/5.0 (Windows; U; Windows NT 6.0; en-US) AppleWebKit/532.0 (KHTML, like Gecko) Chrome/4.0.206.1 Safari/532.0","619":"Mozilla/5.0 (Windows; U; Windows NT 5.2; en-US) AppleWebKit/532.0 (KHTML, like Gecko) Chrome/4.0.206.1 Safari/532.0","620":"Mozilla/5.0 (Windows; U; Windows NT 5.1; en-US) AppleWebKit/532.0 (KHTML, like Gecko) Chrome/4.0.206.1 Safari/532.0","621":"Mozilla/5.0 (Macintosh; U; Intel Mac OS X 10_6_0; en-US) AppleWebKit/532.0 (KHTML, like Gecko) Chrome/4.0.206.1 Safari/532.0","622":"Mozilla/5.0 (X11; U; Linux x86_64; en-US) AppleWebKit/532.0 (KHTML, like Gecko) Chrome/4.0.206.0 Safari/532.0","623":"Mozilla/5.0 (X11; U; Linux i686; en-US) AppleWebKit/532.0 (KHTML, like Gecko) Chrome/4.0.206.0 Safari/532.0","624":"Mozilla/5.0 (Windows; U; Windows NT 6.1; en-US) AppleWebKit/532.0 (KHTML, like Gecko) Chrome/4.0.206.0 Safari/532.0","625":"Mozilla/5.0 (Windows; U; Windows NT 5.1; en-US) AppleWebKit/532.0 (KHTML, like Gecko) Chrome/4.0.206.0 Safari/532.0","626":"Mozilla/5.0 (X11; U; Linux i686; en-US) AppleWebKit/532.0 (KHTML, like Gecko) Chrome/4.0.205.0 Safari/532.0","627":"Mozilla/5.0 (X11; U; Linux x86_64; en-US) AppleWebKit/532.0 (KHTML, like Gecko) Chrome/4.0.204.0 Safari/532.0","628":"Mozilla/5.0 (X11; U; Linux i686; en-US) AppleWebKit/532.0 (KHTML, like Gecko) Chrome/4.0.204.0 Safari/532.0","629":"Mozilla/5.0 (Windows; U; Windows NT 6.1; en-US) AppleWebKit/532.0 (KHTML, like Gecko) Chrome/4.0.204.0 Safari/532.0","630":"Mozilla/5.0 (Windows; U; Windows NT 5.1; en-US) AppleWebKit/532.0 (KHTML, like Gecko) Chrome/4.0.204.0 Safari/532.0","631":"Mozilla/5.0 (Macintosh; U; Intel Mac OS X 10_6_0; en-US) AppleWebKit/532.0 (KHTML, like Gecko) Chrome/4.0.204.0 Safari/532.0","632":"Mozilla/5.0 (Macintosh; U; Intel Mac OS X 10_6_0; en-US) AppleWebKit/532.0 (KHTML, like Gecko) Chrome/4.0.203.4 Safari/532.0","633":"Mozilla/5.0 (X11; U; Linux x86_64; en-US) AppleWebKit/532.0 (KHTML, like Gecko) Chrome/4.0.203.2 Safari/532.0","634":"Mozilla/5.0 (X11; U; Linux i686; en-US) AppleWebKit/532.0 (KHTML, like Gecko) Chrome/4.0.203.2 Safari/532.0","635":"Mozilla/5.0 (Windows; U; Windows NT 6.1; en-US) AppleWebKit/532.0 (KHTML, like Gecko) Chrome/4.0.203.2 Safari/532.0","636":"Mozilla/5.0 (Windows; U; Windows NT 6.0; en-US) AppleWebKit/532.0 (KHTML, like Gecko) Chrome/4.0.203.2 Safari/532.0","637":"Mozilla/5.0 (Windows; U; Windows NT 5.2; en-US) AppleWebKit/532.0 (KHTML, like Gecko) Chrome/4.0.203.2 Safari/532.0","638":"Mozilla/5.0 (Windows; U; Windows NT 5.1; en-US) AppleWebKit/532.0 (KHTML, like Gecko) Chrome/4.0.203.2 Safari/532.0","639":"Mozilla/5.0 (X11; U; Linux x86_64; en-US) AppleWebKit/532.0 (KHTML, like Gecko) Chrome/4.0.203.0 Safari/532.0","640":"Mozilla/5.0 (X11; U; Linux i686; en-US) AppleWebKit/532.0 (KHTML, like Gecko) Chrome/4.0.203.0 Safari/532.0","641":"Mozilla/5.0 (Windows; U; Windows NT 6.1; en-US) AppleWebKit/532.0 (KHTML, like Gecko) Chrome/4.0.203.0 Safari/532.0","642":"Mozilla/5.0 (Windows; U; Windows NT 5.1; en-US) AppleWebKit/532.0 (KHTML, like Gecko) Chrome/4.0.203.0 Safari/532.0","643":"Mozilla/5.0 (Macintosh; U; Intel Mac OS X 10_6_0; en-US) AppleWebKit/532.0 (KHTML, like Gecko) Chrome/4.0.203.0 Safari/532.0","644":"Mozilla/5.0 (Macintosh; U; Intel Mac OS X 10_5_8; en-US) AppleWebKit/532.0 (KHTML, like Gecko) Chrome/4.0.203.0 Safari/532.0","645":"Mozilla/5.0 (X11; U; Linux i686; en-US) AppleWebKit/532.0 (KHTML, like Gecko) Chrome/4.0.202.2 Safari/532.0","646":"Mozilla/5.0 (X11; U; Linux i686 (x86_64); en-US) AppleWebKit/532.0 (KHTML, like Gecko) Chrome/4.0.202.2 Safari/532.0","647":"Mozilla/5.0 (Windows; U; Windows NT 6.0 (x86_64); de-DE) AppleWebKit/532.0 (KHTML, like Gecko) Chrome/4.0.202.2 Safari/532.0","648":"Mozilla/5.0 (Windows; U; Windows NT 5.2; de-DE) AppleWebKit/532.0 (KHTML, like Gecko) Chrome/4.0.202.2 Safari/532.0","649":"Mozilla/5.0 (X11; U; Linux i686; en-US) AppleWebKit/532.0 (KHTML, like Gecko) Chrome/4.0.202.0 Safari/532.0","650":"Mozilla/5.0 (Windows; U; Windows NT 6.1; en-US) AppleWebKit/532.0 (KHTML, like Gecko) Chrome/4.0.202.0 Safari/532.0","651":"Mozilla/5.0 (Windows; U; Windows NT 6.0; en-US) AppleWebKit/532.0 (KHTML, like Gecko) Chrome/4.0.202.0 Safari/532.0","652":"Mozilla/5.0 (Windows; U; Windows NT 5.2; en-US) AppleWebKit/532.0 (KHTML, like Gecko) Chrome/4.0.202.0 Safari/532.0","653":"Mozilla/5.0 (Windows; U; Windows NT 5.1; en-US) AppleWebKit/525.13 (KHTML, like Gecko) Chrome/4.0.202.0 Safari/525.13.","654":"Mozilla/5.0 (Macintosh; U; Intel Mac OS X 10_6_0; en-US) AppleWebKit/532.0 (KHTML, like Gecko) Chrome/4.0.202.0 Safari/532.0","655":"Mozilla/5.0 (Macintosh; U; Intel Mac OS X 10_5_8; en-US) AppleWebKit/532.0 (KHTML, like Gecko) Chrome/4.0.202.0 Safari/532.0","656":"Mozilla/5.0 (Macintosh; U; Intel Mac OS X 10_5_7; en-US) AppleWebKit/532.0 (KHTML, like Gecko) Chrome/4.0.202.0 Safari/532.0","657":"Mozilla/5.0 (Macintosh; U; Intel Mac OS X 10_5_6; en-US) AppleWebKit/532.0 (KHTML, like Gecko) Chrome/4.0.202.0 Safari/532.0","658":"Mozilla/5.0 (Windows; U; Windows NT 6.1; en-US) AppleWebKit/532.0 (KHTML, like Gecko) Chrome/4.0.201.1 Safari/532.0","659":"Mozilla/5.0 (Windows; U; Windows NT 6.0; en-US) AppleWebKit/532.0 (KHTML, like Gecko) Chrome/4.0.201.1 Safari/532.0","660":"Mozilla/5.0 (Windows; U; Windows NT 5.1; en-US) AppleWebKit/532.0 (KHTML, like Gecko) Chrome/4.0.201.1 Safari/532.0","661":"Mozilla/5.0 (Windows; U; Windows NT 5.1; en-US) AppleWebKit/532.0 (KHTML, like Gecko) Chrome/3.0.201.0 Safari/532.0","662":"Mozilla/5.0 (X11; U; Linux i686; en-US) AppleWebKit/532.0 (KHTML, like Gecko) Chrome/3.0.198.1 Safari/532.0","663":"Mozilla/5.0 (X11; U; Linux i686 (x86_64); en-US) AppleWebKit/532.0 (KHTML, like Gecko) Chrome/3.0.198.1 Safari/532.0","664":"Mozilla/5.0 (X11; U; Linux i686; en-US) AppleWebKit/532.0 (KHTML, like Gecko) Chrome/3.0.198.0 Safari/532.0","665":"Mozilla/5.0 (X11; U; Linux i686 (x86_64); en-US) AppleWebKit/532.0 (KHTML, like Gecko) Chrome/3.0.198.0 Safari/532.0","666":"Mozilla/5.0 (Windows; U; Windows NT 6.0; en-US) AppleWebKit/532.0 (KHTML, like Gecko) Chrome/3.0.198.0 Safari/532.0","667":"Mozilla/5.0 (Windows; U; Windows NT 5.1; en-US) AppleWebKit/532.0 (KHTML, like Gecko) Chrome/3.0.198.0 Safari/532.0","668":"Mozilla/5.0 (Windows; U; Windows NT 5.0; en-US) AppleWebKit/532.0 (KHTML, like Gecko) Chrome/3.0.198 Safari/532.0","669":"Mozilla/5.0 (Macintosh; U; Intel Mac OS X 10_5_8; en-US) AppleWebKit/532.0 (KHTML, like Gecko) Chrome/3.0.198 Safari/532.0","670":"Mozilla/5.0 (Macintosh; U; Intel Mac OS X 10_5_7; en-US) AppleWebKit/532.0 (KHTML, like Gecko) Chrome/3.0.198 Safari/532.0","671":"Mozilla/5.0 (X11; U; Linux i686; en-US) AppleWebKit/532.0 (KHTML, like Gecko) Chrome/3.0.197.11 Safari/532.0","672":"Mozilla/5.0 (Windows; U; Windows NT 6.1; en-US) AppleWebKit/532.0 (KHTML, like Gecko) Chrome/3.0.197.11 Safari/532.0","673":"Mozilla/5.0 (Windows; U; Windows NT 6.0; en-US) AppleWebKit/532.0 (KHTML, like Gecko) Chrome/3.0.197.11 Safari/532.0","674":"Mozilla/5.0 (Windows; U; Windows NT 5.1; en-US) AppleWebKit/532.0 (KHTML, like Gecko) Chrome/3.0.197.11 Safari/532.0","675":"Mozilla/5.0 (X11; U; Linux i686; en-US) AppleWebKit/532.0 (KHTML, like Gecko) Chrome/3.0.197.0 Safari/532.0","676":"Mozilla/5.0 (X11; U; Linux i686 (x86_64); en-US) AppleWebKit/532.0 (KHTML, like Gecko) Chrome/3.0.197.0 Safari/532.0","677":"Mozilla/5.0 (Windows; U; Windows NT 6.1; en-US) AppleWebKit/532.0 (KHTML, like Gecko) Chrome/3.0.197.0 Safari/532.0","678":"Mozilla/5.0 (Macintosh; U; Intel Mac OS X 10_5_8; en-US) AppleWebKit/532.0 (KHTML, like Gecko) Chrome/3.0.197 Safari/532.0","679":"Mozilla/5.0 (Windows; U; Windows NT 6.1; en-US) AppleWebKit/532.0 (KHTML, like Gecko) Chrome/3.0.196.2 Safari/532.0","680":"Mozilla/5.0 (Windows; U; Windows NT 6.0; en-US) AppleWebKit/532.0 (KHTML, like Gecko) Chrome/3.0.196.2 Safari/532.0","681":"Mozilla/5.0 (Windows; U; Windows NT 5.1; en-US) AppleWebKit/532.0 (KHTML, like Gecko) Chrome/3.0.196.2 Safari/532.0","682":"Mozilla/5.0 (X11; U; Linux i686; en-US) AppleWebKit/532.0 (KHTML, like Gecko) Chrome/3.0.196.0 Safari/532.0","683":"Mozilla/5.0 (X11; U; Linux i686 (x86_64); en-US) AppleWebKit/532.0 (KHTML, like Gecko) Chrome/3.0.196.0 Safari/532.0","684":"Mozilla/5.0 (Macintosh; U; Intel Mac OS X 10_5_7; en-US) AppleWebKit/532.0 (KHTML, like Gecko) Chrome/3.0.196 Safari/532.0","685":"Mozilla/5.0 (Windows; U; Windows NT 6.1; en-US) AppleWebKit/532.0 (KHTML, like Gecko) Chrome/3.0.195.6 Safari/532.0","686":"Mozilla/5.0 (Windows; U; Windows NT 6.0; en-US) AppleWebKit/532.0 (KHTML, like Gecko) Chrome/3.0.195.6 Safari/532.0","687":"Mozilla/5.0 (Windows; U; Windows NT 5.2; en-US) AppleWebKit/532.0 (KHTML, like Gecko) Chrome/3.0.195.6 Safari/532.0","688":"Mozilla/5.0 (Windows; U; Windows NT 5.1; en-US) AppleWebKit/532.0 (KHTML, like Gecko) Chrome/3.0.195.6 Safari/532.0","689":"Mozilla/5.0 (Windows; U; Windows NT 5.0; en-US) AppleWebKit/532.0 (KHTML, like Gecko) Chrome/3.0.195.6 Safari/532.0","690":"Mozilla/5.0 (Windows; U; Windows NT 6.1; en-US) AppleWebKit/532.0 (KHTML, like Gecko) Chrome/3.0.195.4 Safari/532.0","691":"Mozilla/5.0 (Windows; U; Windows NT 5.2; en-US) AppleWebKit/532.0 (KHTML, like Gecko) Chrome/3.0.195.33 Safari/532.0","692":"Mozilla/4.0 (Windows; U; Windows NT 5.0; en-US) AppleWebKit/532.0 (KHTML, like Gecko) Chrome/3.0.195.33 Safari/532.0","693":"Mozilla/5.0 (Windows; U; Windows NT 6.1; en-US) AppleWebKit/532.0 (KHTML, like Gecko) Chrome/3.0.195.3 Safari/532.0","694":"Mozilla/5.0 (Windows; U; Windows NT 6.0; en-US) AppleWebKit/532.0 (KHTML, like Gecko) Chrome/3.0.195.3 Safari/532.0","695":"Mozilla/6.0 (Windows; U; Windows NT 6.1; en-US) AppleWebKit/532.0 (KHTML, like Gecko) Chrome/3.0.195.27 Safari/532.0","696":"Mozilla/5.0 (Windows; U; Windows NT 6.1; en-US) AppleWebKit/532.0 (KHTML, like Gecko) Chrome/3.0.195.27 Safari/532.0","697":"Mozilla/5.0 (Windows; U; Windows NT 6.0; en-US) AppleWebKit/532.0 (KHTML, like Gecko) Chrome/3.0.195.27 Safari/532.0","698":"Mozilla/5.0 (Windows; U; Windows NT 5.2; en-US) AppleWebKit/532.0 (KHTML, like Gecko) Chrome/3.0.195.27 Safari/532.0","699":"Mozilla/5.0 (Windows; U; Windows NT 5.1; en-US) AppleWebKit/532.0 (KHTML,like Gecko) Chrome/3.0.195.27","700":"Mozilla/5.0 (Windows; U; Windows NT 5.1; en-US) AppleWebKit/532.0 (KHTML, like Gecko) Chrome/3.0.195.27 Safari/532.0","701":"Mozilla/5.0 (Windows; U; Windows NT 5.0; en-US) AppleWebKit/532.0 (KHTML, like Gecko) Chrome/3.0.195.27 Safari/532.0","702":"Mozilla/5.0 (X11; U; Linux x86_64; en-US) AppleWebKit/532.0 (KHTML, like Gecko) Chrome/3.0.195.24 Safari/532.0","703":"Mozilla/5.0 (Windows; U; Windows NT 5.1; en-US) AppleWebKit/532.0 (KHTML, like Gecko) Chrome/3.0.195.24 Safari/532.0","704":"Mozilla/5.0 (Windows; U; Windows NT 6.1; en-US) AppleWebKit/532.0 (KHTML, like Gecko) Chrome/3.0.195.21 Safari/532.0","705":"Mozilla/5.0 (Windows; U; Windows NT 6.0; en-US) AppleWebKit/532.0 (KHTML, like Gecko) Chrome/3.0.195.21 Safari/532.0","706":"Mozilla/5.0 (Windows; U; Windows NT 5.2; en-US) AppleWebKit/532.0 (KHTML, like Gecko) Chrome/3.0.195.21 Safari/532.0","707":"Mozilla/5.0 (Windows; U; Windows NT 5.1; en-US) AppleWebKit/532.0 (KHTML, like Gecko) Chrome/3.0.195.21 Safari/532.0","708":"Mozilla/5.0 (Windows; U; Windows NT 6.0; en-US) AppleWebKit/532.0 (KHTML, like Gecko) Chrome/3.0.195.20 Safari/532.0","709":"Mozilla/5.0 (Windows; U; Windows NT 5.1; en-US) AppleWebKit/532.0 (KHTML, like Gecko) Chrome/3.0.195.20 Safari/532.0","710":"Mozilla/5.0 (Windows; U; Windows NT 6.0; en-US) AppleWebKit/532.0 (KHTML, like Gecko) Chrome/3.0.195.17 Safari/532.0","711":"Mozilla/5.0 (Windows; U; Windows NT 5.1; en-US) AppleWebKit/532.0 (KHTML, like Gecko) Chrome/3.0.195.17 Safari/532.0","712":"Mozilla/5.0 (Windows; U; Windows NT 6.1; en-US) AppleWebKit/532.0 (KHTML, like Gecko) Chrome/3.0.195.10 Safari/532.0","713":"Mozilla/5.0 (Windows; U; Windows NT 6.0; en-US) AppleWebKit/532.0 (KHTML, like Gecko) Chrome/3.0.195.10 Safari/532.0","714":"Mozilla/5.0 (Windows; U; Windows NT 5.1; en-US) AppleWebKit/532.0 (KHTML, like Gecko) Chrome/3.0.195.10 Safari/532.0","715":"Mozilla/5.0 (X11; U; Linux i686; en-US) AppleWebKit/532.0 (KHTML, like Gecko) Chrome/3.0.195.1 Safari/532.0","716":"Mozilla/5.0 (Windows; U; Windows NT 6.1; en-US) AppleWebKit/532.0 (KHTML, like Gecko) Chrome/3.0.195.1 Safari/532.0","717":"Mozilla/5.0 (Windows; U; Windows NT 6.0; en-US) AppleWebKit/532.0 (KHTML, like Gecko) Chrome/3.0.195.1 Safari/532.0","718":"Mozilla/5.0 (Windows; U; Windows NT 5.1; en-US) AppleWebKit/532.0 (KHTML, like Gecko) Chrome/3.0.195.1 Safari/532.0","719":"Mozilla/5.0 (X11; U; Linux i686; en-US) AppleWebKit/531.4 (KHTML, like Gecko) Chrome/3.0.194.0 Safari/531.4","720":"Mozilla/5.0 (Windows; U; Windows NT 6.1; en-US) AppleWebKit/531.4 (KHTML, like Gecko) Chrome/3.0.194.0 Safari/531.4","721":"Mozilla/5.0 (Windows; U; Windows NT 6.1; en-US) AppleWebKit/531.3 (KHTML, like Gecko) Chrome/3.0.193.2 Safari/531.3","722":"Mozilla/5.0 (Windows; U; Windows NT 6.0; en-US) AppleWebKit/531.3 (KHTML, like Gecko) Chrome/3.0.193.2 Safari/531.3","723":"Mozilla/5.0 (Windows; U; Windows NT 5.2; en-US) AppleWebKit/531.3 (KHTML, like Gecko) Chrome/3.0.193.2 Safari/531.3","724":"Mozilla/5.0 (Windows; U; Windows NT 6.0; en-US) AppleWebKit/531.3 (KHTML, like Gecko) Chrome/3.0.193.0 Safari/531.3","725":"Mozilla/5.0 (Macintosh; U; Intel Mac OS X 10_5_7; en-US) AppleWebKit/531.3 (KHTML, like Gecko) Chrome/3.0.192 Safari/531.3","726":"Mozilla/5.0 (Windows; U; Windows NT 5.1; en-US) AppleWebKit/531.2 (KHTML, like Gecko) Chrome/3.0.191.3 Safari/531.2","727":"Mozilla/5.0 (Windows; U; Windows NT 6.1; en-US) AppleWebKit/531.0 (KHTML, like Gecko) Chrome/3.0.191.0 Safari/531.0","728":"Mozilla/5.0 (Windows; U; Windows NT 5.1; en-US) AppleWebKit/531.0 (KHTML, like Gecko) Chrome/3.0.191.0 Safari/531.0","729":"Mozilla/5.0 (Windows; U; Windows NT 6.1; en-US) AppleWebKit/531.0 (KHTML, like Gecko) Chrome/2.0.182.0 Safari/532.0","730":"Mozilla/5.0 (Windows; U; Windows NT 6.1; en-US) AppleWebKit/531.0 (KHTML, like Gecko) Chrome/2.0.182.0 Safari/531.0","731":"Mozilla/5.0 (Windows; U; Windows NT 6.1; en-US) AppleWebKit/530.0 (KHTML, like Gecko) Chrome/2.0.182.0 Safari/531.0","732":"Mozilla/5.0 (Windows; U; Windows NT 5.1; en-US) AppleWebKit/530.8 (KHTML, like Gecko) Chrome/2.0.178.0 Safari/530.8","733":"Mozilla/5.0 (Windows; U; Windows NT 5.1; en-US) AppleWebKit/530.8 (KHTML, like Gecko) Chrome/2.0.177.1 Safari/530.8","734":"Mozilla/5.0 (Windows; U; Windows NT 5.1; en-US) AppleWebKit/530.8 (KHTML, like Gecko) Chrome/2.0.177.0 Safari/530.8","735":"Mozilla/5.0 (Windows; U; Windows NT 5.1; en-US) AppleWebKit/530.7 (KHTML, like Gecko) Chrome/2.0.177.0 Safari/530.7","736":"Mozilla/5.0 (Windows; U; Windows NT 6.0; en-US) AppleWebKit/530.7 (KHTML, like Gecko) Chrome/2.0.176.0 Safari/530.7","737":"Mozilla/5.0 (Windows; U; Windows NT 5.1; en-US) AppleWebKit/530.7 (KHTML, like Gecko) Chrome/2.0.176.0 Safari/530.7","738":"Mozilla/5.0 (X11; U; Linux i686 (x86_64); en-US) AppleWebKit/530.7 (KHTML, like Gecko) Chrome/2.0.175.0 Safari/530.7","739":"Mozilla/5.0 (Windows; U; Windows NT 5.1; en-US) AppleWebKit/530.7 (KHTML, like Gecko) Chrome/2.0.175.0 Safari/530.7","740":"Mozilla/5.0 (Windows; U; Windows NT 5.1; en-US) AppleWebKit/530.6 (KHTML, like Gecko) Chrome/2.0.175.0 Safari/530.6","741":"Mozilla/5.0 (Windows; U; Windows NT 6.1; en-US) AppleWebKit/530.6 (KHTML, like Gecko) Chrome/2.0.174.0 Safari/530.6","742":"Mozilla/5.0 (Windows; U; Windows NT 6.0; en-US) AppleWebKit/530.6 (KHTML, like Gecko) Chrome/2.0.174.0 Safari/530.6","743":"Mozilla/5.0 (Windows; U; Windows NT 5.1; en-US) AppleWebKit/530.6 (KHTML, like Gecko) Chrome/2.0.174.0 Safari/530.6","744":"Mozilla/5.0 (Windows; U; Windows NT 5.1; en-US) AppleWebKit/530.5 (KHTML, like Gecko) Chrome/2.0.174.0 Safari/530.5","745":"Mozilla/5.0 (Macintosh; U; Intel Mac OS X 10_6_2; en-US) AppleWebKit/530.6 (KHTML, like Gecko) Chrome/2.0.174.0 Safari/530.6","746":"Mozilla/5.0 (Windows; U; Windows NT 6.0; en-US) AppleWebKit/530.5 (KHTML, like Gecko) Chrome/2.0.173.1 Safari/530.5","747":"Mozilla/5.0 (Windows; U; Windows NT 5.1; en-US) AppleWebKit/530.5 (KHTML, like Gecko) Chrome/2.0.173.1 Safari/530.5","748":"Mozilla/5.0 (Windows; U; Windows NT 5.1; en-US) AppleWebKit/530.5 (KHTML, like Gecko) Chrome/2.0.173.0 Safari/530.5","749":"Mozilla/5.0 (Windows; U; Windows NT 5.1; en-US) AppleWebKit/530.5 (KHTML, like Gecko) Chrome/2.0.172.8 Safari/530.5","750":"Mozilla/6.0 (Windows; U; Windows NT 6.0; en-US) Gecko/2009032609 Chrome/2.0.172.6 Safari/530.7","751":"Mozilla/6.0 (Windows; U; Windows NT 6.0; en-US) Gecko/2009032609 (KHTML, like Gecko) Chrome/2.0.172.6 Safari/530.7","752":"Mozilla/5.0 (Windows; U; Windows NT 6.0; en-US) AppleWebKit/530.5 (KHTML, like Gecko) Chrome/2.0.172.6 Safari/530.5","753":"Mozilla/5.0 (Windows; U; Windows NT 6.1; en-US) AppleWebKit/530.5 (KHTML, like Gecko) Chrome/2.0.172.43 Safari/530.5","754":"Mozilla/5.0 (Windows; U; Windows NT 6.0; en-US) AppleWebKit/530.5 (KHTML, like Gecko) Chrome/2.0.172.43 Safari/530.5","755":"Mozilla/5.0 (Windows; U; Windows NT 5.2; en-US) AppleWebKit/530.5 (KHTML, like Gecko) Chrome/2.0.172.43 Safari/530.5","756":"Mozilla/5.0 (Windows; U; Windows NT 5.1; en-US) AppleWebKit/530.5 (KHTML, like Gecko) Chrome/2.0.172.43 Safari/530.5","757":"Mozilla/5.0 (Windows; U; Windows NT 5.1; en-US) AppleWebKit/530.5 (KHTML, like Gecko) Chrome/2.0.172.42 Safari/530.5","758":"Mozilla/5.0 (Windows; U; Windows NT 6.0; en-US) AppleWebKit/530.5 (KHTML, like Gecko) Chrome/2.0.172.40 Safari/530.5","759":"Mozilla/5.0 (Windows; U; Windows NT 5.1; en-US) AppleWebKit/530.5 (KHTML, like Gecko) Chrome/2.0.172.40 Safari/530.5","760":"Mozilla/5.0 (Windows; U; Windows NT 6.0; en-US) AppleWebKit/530.5 (KHTML, like Gecko) Chrome/2.0.172.39 Safari/530.5","761":"Mozilla/5.0 (Windows; U; Windows NT 5.1; en-US) AppleWebKit/530.5 (KHTML, like Gecko) Chrome/2.0.172.39 Safari/530.5","762":"Mozilla/5.0 (Windows; U; Windows NT 6.0; en-US) AppleWebKit/530.5 (KHTML, like Gecko) Chrome/2.0.172.23 Safari/530.5","763":"Mozilla/5.0 (Windows; U; Windows NT 6.0; en-US) AppleWebKit/530.5 (KHTML, like Gecko) Chrome/2.0.172.2 Safari/530.5","764":"Mozilla/5.0 (Windows; U; Windows NT 5.1; en-US) AppleWebKit/530.5 (KHTML, like Gecko) Chrome/2.0.172.2 Safari/530.5","765":"Mozilla/5.0 (Windows; U; Windows NT 6.1; en-US) AppleWebKit/530.4 (KHTML, like Gecko) Chrome/2.0.172.0 Safari/530.4","766":"Mozilla/5.0 (Windows; U; Windows NT 5.2; eu) AppleWebKit/530.4 (KHTML, like Gecko) Chrome/2.0.172.0 Safari/530.4","767":"Mozilla/5.0 (Windows; U; Windows NT 5.2; en-US) AppleWebKit/530.4 (KHTML, like Gecko) Chrome/2.0.172.0 Safari/530.4","768":"Mozilla/5.0 (Windows; U; Windows NT 5.1; en-US) AppleWebKit/530.5 (KHTML, like Gecko) Chrome/2.0.172.0 Safari/530.5","769":"Mozilla/5.0 (Windows; U; Windows NT 6.0; en-US) AppleWebKit/530.4 (KHTML, like Gecko) Chrome/2.0.171.0 Safari/530.4","770":"Mozilla/5.0 (Windows; U; Windows NT 5.1; en-US) AppleWebKit/530.1 (KHTML, like Gecko) Chrome/2.0.170.0 Safari/530.1","771":"Mozilla/5.0 (Windows; U; Windows NT 5.1; en-US) AppleWebKit/530.1 (KHTML, like Gecko) Chrome/2.0.169.0 Safari/530.1","772":"Mozilla/5.0 (Windows; U; Windows NT 6.0; en-US) AppleWebKit/530.1 (KHTML, like Gecko) Chrome/2.0.168.0 Safari/530.1","773":"Mozilla/5.0 (Windows; U; Windows NT 6.0; en-US) AppleWebKit/530.1 (KHTML, like Gecko) Chrome/2.0.164.0 Safari/530.1","774":"Mozilla/5.0 (Windows; U; Windows NT 6.0; en-US) AppleWebKit/530.0 (KHTML, like Gecko) Chrome/2.0.162.0 Safari/530.0","775":"Mozilla/5.0 (Windows; U; Windows NT 6.0; en-US) AppleWebKit/530.0 (KHTML, like Gecko) Chrome/2.0.160.0 Safari/530.0","776":"Mozilla/5.0 (Windows; U; Windows NT 6.0; en-US) AppleWebKit/528.10 (KHTML, like Gecko) Chrome/2.0.157.2 Safari/528.10","777":"Mozilla/5.0 (Windows; U; Windows NT 5.1; en-US) AppleWebKit/528.10 (KHTML, like Gecko) Chrome/2.0.157.2 Safari/528.10","778":"Mozilla/5.0 (Macintosh; U; Intel Mac OS X 10_6_0; en-US) AppleWebKit/528.10 (KHTML, like Gecko) Chrome/2.0.157.2 Safari/528.10","779":"Mozilla/5.0 (Windows; U; Windows NT 6.0; en-US) AppleWebKit/528.11 (KHTML, like Gecko) Chrome/2.0.157.0 Safari/528.11","780":"Mozilla/5.0 (Windows; U; Windows NT 5.1; en-US) AppleWebKit/528.9 (KHTML, like Gecko) Chrome/2.0.157.0 Safari/528.9","781":"Mozilla/5.0 (Windows; U; Windows NT 5.1; en-US) AppleWebKit/528.11 (KHTML, like Gecko) Chrome/2.0.157.0 Safari/528.11","782":"Mozilla/5.0 (Windows; U; Windows NT 5.1; en-US) AppleWebKit/528.10 (KHTML, like Gecko) Chrome/2.0.157.0 Safari/528.10","783":"Mozilla/5.0 (Windows; U; Windows NT 6.1; en-US) AppleWebKit/528.8 (KHTML, like Gecko) Chrome/2.0.156.1 Safari/528.8","784":"Mozilla/5.0 (Windows; U; Windows NT 6.0; en-US) AppleWebKit/528.8 (KHTML, like Gecko) Chrome/2.0.156.1 Safari/528.8","785":"Mozilla/5.0 (Windows; U; Windows NT 5.1; en-US) AppleWebKit/528.8 (KHTML, like Gecko) Chrome/2.0.156.1 Safari/528.8","786":"Mozilla/5.0 (Windows; U; Windows NT 5.1; en-US) AppleWebKit/528.8 (KHTML, like Gecko) Chrome/2.0.156.0 Version/3.2.1 Safari/528.8","787":"Mozilla/5.0 (Windows; U; Windows NT 5.1; en-US) AppleWebKit/528.8 (KHTML, like Gecko) Chrome/2.0.156.0 Safari/528.8","788":"Mozilla/5.0 (Windows; U; Windows NT 6.1; en-US) AppleWebKit/528.8 (KHTML, like Gecko) Chrome/1.0.156.0 Safari/528.8","789":"Mozilla/5.0 (Windows; U; Windows NT 6.0; en-US) AppleWebKit/525.19 (KHTML, like Gecko) Chrome/1.0.154.59 Safari/525.19","790":"Mozilla/5.0 (Windows; U; Windows NT 5.2; en-US) AppleWebKit/525.19 (KHTML, like Gecko) Chrome/1.0.154.59 Safari/525.19","791":"Mozilla/4.0 (Windows; U; Windows NT 5.1; en-US) AppleWebKit/525.19 (KHTML, like Gecko) Chrome/1.0.154.59 Safari/525.19","792":"Mozilla/5.0 (Windows; U; Windows NT 5.1; en-US) AppleWebKit/525.19 (KHTML, like Gecko) Chrome/1.0.154.55 Safari/525.19","793":"Mozilla/5.0 (Windows; U; Windows NT 5.0; en-US) AppleWebKit/525.19 (KHTML, like Gecko) Chrome/1.0.154.55 Safari/525.19","794":"Mozilla/5.0 (Windows; U; Windows NT 6.1; en-US) AppleWebKit/525.19 (KHTML, like Gecko) Chrome/1.0.154.53 Safari/525.19","795":"Mozilla/5.0 (Windows; U; Windows NT 6.1; en-US) AppleWebKit/525.19 (KHTML, like Gecko) Chrome/1.0.154.53 Safari/525.19","796":"Mozilla/5.0 (Windows; U; Windows NT 6.0; en-US) AppleWebKit/525.19 (KHTML, like Gecko) Chrome/1.0.154.53 Safari/525.19","797":"Mozilla/5.0 (Windows; U; Windows NT 5.2; en-US) AppleWebKit/525.19 (KHTML, like Gecko) Chrome/1.0.154.53 Safari/525.19","798":"Mozilla/5.0 (Windows; U; Windows NT 5.1; en-US) AppleWebKit/525.19 (KHTML, like Gecko) Chrome/1.0.154.53 Safari/525.19","799":"Mozilla/5.0 (Windows; U; Windows NT 6.0; en-US) AppleWebKit/525.19 (KHTML, like Gecko) Chrome/1.0.154.50 Safari/525.19","800":"Mozilla/5.0 (Windows; U; Windows NT 5.1; en-US) AppleWebKit/525.19 (KHTML, like Gecko) Chrome/1.0.154.50 Safari/525.19","801":"Mozilla/5.0 (Windows; U; Windows NT 5.1; en-US) AppleWebKit/525.19 (KHTML, like Gecko) Chrome/1.0.154.48 Safari/525.19","802":"Mozilla/5.0 (Windows; U; Windows NT 6.0; en-US) AppleWebKit/525.19 (KHTML, like Gecko) Chrome/1.0.154.46 Safari/525.19","803":"Mozilla/5.0 (Windows; U; Windows NT 6.1; en-US) AppleWebKit/525.19 (KHTML, like Gecko) Chrome/1.0.154.43 Safari/525.19","804":"Mozilla/5.0 (Windows; U; Windows NT 6.0; en-US) AppleWebKit/525.19 (KHTML, like Gecko) Chrome/1.0.154.43 Safari/525.19","805":"Mozilla/5.0 (Windows; U; Windows NT 5.2; en-US) AppleWebKit/525.19 (KHTML, like Gecko) Chrome/1.0.154.43 Safari/525.19","806":"Mozilla/5.0 (Windows; U; Windows NT 5.1; en-US) AppleWebKit/525.19 (KHTML, like Gecko) Chrome/1.0.154.43 Safari/525.19","807":"Mozilla/5.0 (Windows; U; Windows NT 6.0; en-US) AppleWebKit/525.19 (KHTML, like Gecko) Chrome/1.0.154.42 Safari/525.19","808":"Mozilla/5.0 (Windows; U; Windows NT 5.1; en-US) AppleWebKit/525.19 (KHTML, like Gecko) Chrome/1.0.154.39 Safari/525.19","809":"Mozilla/5.0 (Windows; U; Windows NT 6.0; en-US) AppleWebKit/525.19 (KHTML, like Gecko) Chrome/0.4.154.31 Safari/525.19","810":"Mozilla/5.0 (Windows; U; Windows NT 5.1; en-US) AppleWebKit/525.19 (KHTML, like Gecko) Chrome/0.4.154.18 Safari/525.19","811":"Mozilla/5.0 (Windows; U; Windows NT 5.1; en-US) AppleWebKit/528.4 (KHTML, like Gecko) Chrome/0.3.155.0 Safari/528.4","812":"Mozilla/5.0 (Windows; U; Windows NT 5.1; en-US) AppleWebKit/525.19 (KHTML, like Gecko) Chrome/0.3.155.0 Safari/525.19","813":"Mozilla/5.0 (Windows; U; Windows NT 6.1; en-US) AppleWebKit/525.19 (KHTML, like Gecko) Chrome/0.3.154.9 Safari/525.19","814":"Mozilla/5.0 (Windows; U; Windows NT 5.2; en-US) AppleWebKit/525.19 (KHTML, like Gecko) Chrome/0.3.154.6 Safari/525.19","815":"Mozilla/5.0 (Windows; U; Windows NT 5.1; en-US) AppleWebKit/525.19 (KHTML, like Gecko) Chrome/0.2.153.1 Safari/525.19","816":"Mozilla/5.0 (Windows; U; Windows NT 6.0; en-US) AppleWebKit/525.19 (KHTML, like Gecko) Chrome/0.2.153.0 Safari/525.19","817":"Mozilla/5.0 (Windows; U; Windows NT 5.1; en-US) AppleWebKit/525.19 (KHTML, like Gecko) Chrome/0.2.153.0 Safari/525.19","818":"Mozilla/5.0 (Windows; U; Windows NT 6.0; en-US) AppleWebKit/525.19 (KHTML, like Gecko) Chrome/0.2.152.0 Safari/525.19","819":"Mozilla/5.0 (Windows; U; Windows NT 5.1; en-US) AppleWebKit/525.19 (KHTML, like Gecko) Chrome/0.2.152.0 Safari/525.19","820":"Mozilla/5.0 (Windows; U; Windows NT 6.0; en-US) AppleWebKit/525.19 (KHTML, like Gecko) Chrome/0.2.151.0 Safari/525.19","821":"Mozilla/5.0 (Windows; U; Windows NT 5.2; en-US) AppleWebKit/525.19 (KHTML, like Gecko) Chrome/0.2.151.0 Safari/525.19","822":"Mozilla/5.0 (Windows; U; Windows NT 5.1; en-US) AppleWebKit/525.19 (KHTML, like Gecko) Chrome/0.2.151.0 Safari/525.19","823":"Mozilla/5.0 (Windows; U; Windows NT 6.0; en-US) AppleWebKit/525.13 (KHTML, like Gecko) Chrome/0.2.149.6 Safari/525.13","824":"Mozilla/5.0 (Windows; U; Windows NT 5.2; en-US) AppleWebKit/525.13 (KHTML, like Gecko) Chrome/0.2.149.6 Safari/525.13","825":"Mozilla/5.0 (Windows; U; Windows NT 6.0; en-US) AppleWebKit/525.13 (KHTML, like Gecko) Chrome/0.2.149.30 Safari/525.13","826":"Mozilla/5.0 (Windows; U; Windows NT 5.2; en-US) AppleWebKit/525.13 (KHTML, like Gecko) Chrome/0.2.149.30 Safari/525.13","827":"Mozilla/5.0 (Windows; U; Windows NT 6.0; en-US) AppleWebKit/525.13 (KHTML, like Gecko) Chrome/0.2.149.29 Safari/525.13","828":"Mozilla/5.0 (Windows; U; Windows NT 5.2; en-US) AppleWebKit/525.13 (KHTML, like Gecko) Chrome/0.2.149.29 Safari/525.13","829":"Mozilla/5.0 (Windows; U; Windows NT 5.1; en-US) AppleWebKit/525.13 (KHTML, like Gecko) Chrome/0.2.149.29 Safari/525.13","830":"Mozilla/5.0 (Windows; U; Windows NT 6.0; en-US) AppleWebKit/525.13 (KHTML, like Gecko) Chrome/0.2.149.27 Safari/525.13","831":"Mozilla/5.0 (Windows; U; Windows NT 6.0; de) AppleWebKit/525.13 (KHTML, like Gecko) Chrome/0.2.149.27 Safari/525.13","832":"Mozilla/5.0 (Windows; U; Windows NT 5.2; en-US) AppleWebKit/525.13 (KHTML, like Gecko) Chrome/0.2.149.27 Safari/525.13","833":"Mozilla/5.0 (Windows; U; Windows NT 5.1; en-US) AppleWebKit/525.13(KHTML, like Gecko) Chrome/0.2.149.27 Safari/525.13","834":"Mozilla/5.0 (Windows; U; Windows NT 5.1; en-US) AppleWebKit/525.13 (KHTML, like Gecko) Chrome/0.2.149.27 Safari/525.13","835":"Mozilla/5.0 (Windows; U; Windows NT 5.0; en-US) AppleWebKit/525.13 (KHTML, like Gecko) Chrome/0.2.149.27 Safari/525.13","836":"Mozilla/5.0 (Linux; U; en-US) AppleWebKit/525.13 (KHTML, like Gecko) Chrome/0.2.149.27 Safari/525.13","837":"Mozilla/5.0 (Macintosh; U; Mac OS X 10_6_1; en-US) AppleWebKit/530.5 (KHTML, like Gecko) Chrome/ Safari/530.5","838":"Mozilla/5.0 (Macintosh; U; Mac OS X 10_5_7; en-US) AppleWebKit/530.5 (KHTML, like Gecko) Chrome/ Safari/530.5","839":"Mozilla/5.0 (Macintosh; U; Intel Mac OS X 10_5_6; en-US) AppleWebKit/530.9 (KHTML, like Gecko) Chrome/ Safari/530.9","840":"Mozilla/5.0 (Macintosh; U; Intel Mac OS X 10_5_6; en-US) AppleWebKit/530.6 (KHTML, like Gecko) Chrome/ Safari/530.6","841":"Mozilla/5.0 (Macintosh; U; Intel Mac OS X 10_5_6; en-US) AppleWebKit/530.5 (KHTML, like Gecko) Chrome/ Safari/530.5"}';
  var strUserAgen = '{ "0":"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36", "1":"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36", "2":"Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36", "3":"Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:124.0) Gecko/20100101 Firefox/124.0", "4":"Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:124.0) Gecko/20100101 Firefox/124.0", "5":"Mozilla/5.0 (X11; Linux x86_64; rv:124.0) Gecko/20100101 Firefox/124.0", "6":"Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15", "7":"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36 Edg/142.0.2420.81", "8":"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36 OPR/109.0.0.0", "9":"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36 Vivaldi/6.7.3329.41", "10":"Mozilla/5.0 (Windows NT 10.0; WOW64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36", "11":"Mozilla/5.0 (X11; CrOS x86_64 16765.100.0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36", "12":"Mozilla/5.0 (Windows NT 6.3; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36", "13":"Mozilla/5.0 (Macintosh; Intel Mac OS X 13_5) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Safari/605.1.15", "14":"Mozilla/5.0 (Windows NT 10.0; Win64; x64; Trident/7.0; rv:11.0) like Gecko", "15":"Mozilla/5.0 (Windows NT 10.0; WOW64; rv:123.0) Gecko/20100101 Firefox/123.0", "16":"Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:123.0) Gecko/20100101 Firefox/123.0", "17":"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36 Edg/141.0.2277.81", "18":"Mozilla/5.0 (Macintosh; Intel Mac OS X 14_4_1) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15", "19":"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36", "20":"Mozilla/5.0 (Windows NT 6.1; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36", "21":"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_14_6) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36", "22":"Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36", "23":"Mozilla/5.0 (Windows NT 10.0; rv:122.0) Gecko/20100101 Firefox/122.0", "24":"Mozilla/5.0 (Macintosh; Intel Mac OS X 10.13; rv:124.0) Gecko/20100101 Firefox/124.0", "25":"Mozilla/5.0 (X11; Linux i686; rv:124.0) Gecko/20100101 Firefox/124.0", "26":"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Safari/605.1.15", "27":"Mozilla/5.0 (Windows NT 6.1; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36 Edg/140.0.2277.81", "28":"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Safari/537.36 OPR/108.0.0.0", "29":"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36 Vivaldi/6.6.3271.61", "30":"Mozilla/5.0 (Windows NT 10.0; WOW64; Trident/7.0; rv:11.0) like Gecko", "31":"Mozilla/5.0 (X11; Fedora; Linux x86_64; rv:124.0) Gecko/20100101 Firefox/124.0", "32":"Mozilla/5.0 (Windows NT 10.0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36", "33":"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_12_6) AppleWebKit/603.3.8 (KHTML, like Gecko) Version/10.1.2 Safari/603.3.8", "34":"Mozilla/5.0 (Windows NT 6.1) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36", "35":"Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15", "36":"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36 Edg/139.0.2172.81", "37":"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/15.6 Safari/605.1.15", "38":"Mozilla/5.0 (Windows NT 10.0; rv:121.0) Gecko/20100101 Firefox/121.0", "39":"Mozilla/5.0 (X11; Linux x86_64; rv:122.0) Gecko/20100101 Firefox/122.0", "40":"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Safari/537.36", "41":"Mozilla/5.0 (Windows NT 6.3; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36", "42":"Mozilla/5.0 (Macintosh; Intel Mac OS X 13_0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36", "43":"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36 OPR/109.0.0.0", "44":"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36 Edg/142.0.2420.70", "45":"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15", "46":"Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:123.0) Gecko/20100101 Firefox/123.0", "47":"Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:124.0) Gecko/20100101 Firefox/124.0", "48":"Mozilla/5.0 (Windows NT 6.3) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36", "49":"Mozilla/5.0 (Macintosh; Intel Mac OS X 14_4_1) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4.1 Safari/605.1.15" }';
  window.bindings = JSON.parse(strUserAgen);
  // window.bindings =JSON.parse(strUserAgen_old);
  window.idx_agen = 0;
  window.bindings_old = JSON.parse(strUserAgen_old);
  window.bindings_fb = JSON.parse(strFB_Agen);
  window.idx_fb_agen = 0;
  // Component để render setting panel với CsmDynamicGrid
  window.renderSettingPanel = function () {
    console.log('renderSettingPanel called');
    const React = window.React;
    if (!React) {
      console.error('window.React not available');
      return null;
    }

    const { Card, Input, Select, Button, Space, Tabs, ConfigProvider, antdLocale, antdThemeConfig } = window.antd || {};
    if (!Card || !Input || !Select || !Button || !Space) {
      console.error('Ant Design components not available');
      return null;
    }

    console.log('Creating React elements...');

    // Tab 1: Settings
    const settingsTab = React.createElement('div', { style: { display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'flex-end' } },
      React.createElement('div', { style: { display: 'flex', flexDirection: 'column', width: 200 } },
        React.createElement('label', null, 'IP thật'),
        React.createElement('span', { id: 'ipReal', style: { fontWeight: 600 } })
      ),
      React.createElement('div', { style: { display: 'flex', flexDirection: 'column', width: 200 } },
        React.createElement('label', null, 'IP'),
        React.createElement('span', { id: 'ipNew', style: { fontWeight: 600 } })
      ),
      React.createElement('div', { style: { display: 'flex', flexDirection: 'column', width: 200 } },
        React.createElement('label', null, 'DNS'),
        React.createElement(Input, { id: 'dns', defaultValue: '192.168.1.1' })
      ),
      React.createElement('div', { style: { display: 'flex', flexDirection: 'column', width: 240 } },
        React.createElement('label', null, 'Api TMProxy'),
        React.createElement(Input, { id: 'api_token', defaultValue: '8df49f0cab1d81de70ac19d8b158681e' })
      ),
      React.createElement('div', { style: { display: 'flex', flexDirection: 'column', width: 160 } },
        React.createElement('label', null, 'Khu vực TMProxy'),
        React.createElement(Input, { id: 'location', type: 'number', defaultValue: 1, min: 1, max: 63 })
      ),
      React.createElement('div', { style: { display: 'flex', flexDirection: 'column', width: 240 } },
        React.createElement('label', null, 'Api wwproxy'),
        React.createElement(Input, { id: 'api_token_wwproxy', defaultValue: 'UK-cc7e5c6e-d63d-491a-8f37-0a725f1d5314' })
      ),
      React.createElement('div', { style: { display: 'flex', flexDirection: 'column', width: 160 } },
        React.createElement('label', null, 'Khu vực wwproxy'),
        React.createElement(Input, { id: 'location_wwproxy', type: 'number', defaultValue: 50, min: 1, max: 63 })
      ),
      React.createElement('div', { style: { display: 'flex', flexDirection: 'column', width: 160 } },
        React.createElement('label', null, 'Số từ khóa / lần'),
        React.createElement(Input, { id: 'maxTab', type: 'number', defaultValue: 10, min: 5, max: 50 })
      ),
      React.createElement('div', { style: { display: 'flex', flexDirection: 'column', width: 160 } },
        React.createElement('label', null, 'Phút ở lại trang'),
        React.createElement(Select, {
          id: 'sophut_lamtuoi',
          defaultValue: '5',
          onChange: (val) => { window.sophut_lamtuoi_value = val; },
          style: { width: '100%' },
          options: Array.from({ length: 15 }, (_, i) => ({ value: String(i + 1), label: String(i + 1) }))
        })
      )
    );

    // Tab 1 content: Settings + Run buttons
    const settingsContent = React.createElement('div', null,
      settingsTab,
      React.createElement(Space, { style: { marginTop: 12 }, wrap: true },
        React.createElement(Button, { id: 'btnStart', type: 'primary', onClick: () => runApp?.() }, 'Chạy chương trình'),
        React.createElement(Button, { id: 'btnStop', danger: true, onClick: () => stopApp?.(true), style: { display: 'none' } }, 'Tạm dừng'),
        React.createElement('span', { id: 'trang_thai', style: { fontWeight: 600, color: '#1677ff' } })
      )
    );

    // Tab 2 content: CsmDynamicGrid (sẽ render sau)
    const gridContent = React.createElement('div', { id: 'keyword-grid-container', style: { minHeight: 400 } });

    // Render with Tabs
    const content = React.createElement(Card, {
      title: 'Quản lý SEO Automation',
      style: { margin: 8 }
    },
      React.createElement(Tabs, {
        defaultActiveKey: '2',
        items: [
          {
            key: '1',
            label: 'Thiết lập',
            children: settingsContent
          },
          {
            key: '2',
            label: 'Quản lý từ khóa',
            children: gridContent
          }
        ]
      })
    );

    if (ConfigProvider) {
      return React.createElement(ConfigProvider, { locale: antdLocale, theme: antdThemeConfig }, content);
    }

    return content;
  };

  // Render React components - delay để ensure window.ReactDOM đã được expose
  setTimeout(function () {
    console.log('=== Starting render ===');
    console.log('window.React:', !!window.React);
    console.log('window.ReactDOM:', !!window.ReactDOM);
    console.log('window.antd:', !!window.antd);
    console.log('window.renderSettingPanel:', !!window.renderSettingPanel);

    try {
      const container = document.querySelector('#context-auto');
      console.log('Container found:', !!container);

      if (!container) {
        console.error('❌ Container #context-auto not found');
        return;
      }

      if (!window.ReactDOM || !window.React) {
        console.error('❌ window.ReactDOM hoặc window.React chưa được expose');
        return;
      }

      if (!window.renderSettingPanel) {
        console.error('❌ window.renderSettingPanel not defined');
        return;
      }

      console.log('Creating root...');
      const root = window.ReactDOM.createRoot(container);

      console.log('Creating component...');
      const component = window.renderSettingPanel();

      if (!component) {
        console.error('❌ renderSettingPanel returned null/undefined');
        return;
      }

      console.log('Rendering component...');
      root.render(component);
      console.log('✅ renderSettingPanel đã render thành công');

      // Render CsmDynamicGrid vào tab 2
      setTimeout(function () {
        const gridContainer = document.getElementById('keyword-grid-container');
        if (gridContainer) {
          console.log('Rendering CsmDynamicGrid...');
          const gridRoot = window.ReactDOM.createRoot(gridContainer);
          gridRoot.render(
            window.React.createElement(
              window.I18nextProvider,
              { i18n: window.i18n },
              window.renderKeywordGrid()
            )
          );
          console.log('✅ CsmDynamicGrid đã render thành công');
        }
      }, 5000);
    } catch (err) {
      console.error('❌ Lỗi khi render:', err);
      console.error('Stack:', err.stack);
    }
  }, 500);

  setTimeout(function () {
    try {
      checkIP(function (ip) {
        if (document.querySelectorAll('#context-auto .ant-tabs-tab')[0]) {
          document.querySelectorAll('#context-auto .ant-tabs-tab')[0].click();
          setTimeout(function () {
            const ipRealEl = document.querySelector('#ipReal');
            if (ipRealEl) ipRealEl.textContent = ip || 'Không xác định';
            if (!ip) console.error('Không lấy được IP thật!');
          }, 500);
        }
      });
    } catch (err) {
      console.error('Lỗi khi check IP:', err);
    }
  }, 500);
  window.openTab = [];
  // console.log(seft.Uinfos);
  window.dataUserOption = [];

  // Khởi tạo dataUserOption: Fetch từ database trước, fallback về memory/localStorage
  console.log("[INIT] Đang khởi tạo dataUserOption...");
  if (window.csmUserData && typeof window.csmUserData.fetchFromDatabase === 'function') {
    // Fetch từ database
    window.csmUserData.fetchFromDatabase(function(success, data, error) {
      if (success && Array.isArray(data) && data.length > 0) {
        window.dataUserOption = data;
        console.log("[INIT] Đã fetch từ database thành công, số lượng:", window.dataUserOption.length);
        
        // Render grid nếu hàm có sẵn
        if (typeof window.renderKeywordGrid === 'function') {
          window.renderKeywordGrid();
        }
      } else {
        // Fallback về memory hoặc localStorage
        console.log("[INIT] Không fetch được từ database, fallback về memory/localStorage");
        if (window.csmUserData && typeof window.csmUserData.get === 'function') {
          try {
            let raw = window.csmUserData.get();
            console.log("[INIT] csmUserData.get() trả về:", raw);
            if (Array.isArray(raw) && raw.length > 0) {
              window.dataUserOption = raw;
              console.log("[INIT] csmUserData.get() trả về array, số lượng:", window.dataUserOption.length);
            } else {
              // Thử localStorage
              try {
                const stored = localStorage.getItem('user_address');
                if (stored) {
                  const arr = JSON.parse(stored);
                  if (Array.isArray(arr) && arr.length > 0) {
                    window.dataUserOption = arr;
                    console.log("[INIT] Lấy từ localStorage thành công, số lượng:", window.dataUserOption.length);
                  }
                }
              } catch (e) {
                console.warn("[INIT] Không lấy được từ localStorage");
              }
            }
          } catch (err) {
            if (!(err instanceof SyntaxError)) {
              console.error("[INIT] Lỗi khi lấy user_address từ csmUserData:", err);
            }
            window.dataUserOption = [];
          }
        }
      }
      console.log("[INIT] Khởi tạo hoàn tất. dataUserOption.length =", window.dataUserOption.length);
    });
  } else {
    // Không có hàm fetchFromDatabase, fallback cũ
    console.log("[INIT] Không có fetchFromDatabase, dùng phương thức cũ");
    if (window.csmUserData && typeof window.csmUserData.get === 'function') {
      try {
        let raw = window.csmUserData.get();
        console.log("[INIT] csmUserData.get() trả về:", raw);
        if (Array.isArray(raw) && raw.length > 0) {
          window.dataUserOption = raw;
          console.log("[INIT] csmUserData.get() trả về array, số lượng:", window.dataUserOption.length);
        }
      } catch (err) {
        console.error("[INIT] Lỗi:", err);
      }
    }
    console.log("[INIT] Khởi tạo hoàn tất. dataUserOption.length =", window.dataUserOption.length);
  }
  window.cCheckIP = 0;
  window.oldIP = '';
  window.guid = function () {
    var time_id = dateFormat(new Date(), "yymmddhhMMss");
    function s4() {
      return Math.floor((1 + Math.random()) * 0x10000)
        .toString(16)
        .substring(1);
    }
    return 'google' + time_id + s4() + s4() + s4();
  }
  window.reopen = function (msg) {
    var tabid = msg.tabid, tu_khoa = msg.tu_khoa, link_check = msg.link_check, time_o_lai_trang = msg.time_o_lai_trang, isRunAds = msg.isRunAds;
    var content = strGoogleAds + "google_click('" + tu_khoa.toLowerCase() + "','" + link_check.toLowerCase() + "'," + time_o_lai_trang + "," + isRunAds + "); \n";
    fnCreateTab(tabid, "https://www.google.com/", content, true, (Number(time_o_lai_trang)||1)*60000+30000);
  }
  window.isRunning = false;
  window.stopApp = function (cleanupTabs = true) {
    console.log('[stopApp] ⏸️ Dừng app...');
    
    isRunning = false;
    
    // 1. Stop interval tạo tab mới
    if (window.tmRun) {
      clearInterval(window.tmRun);
      window.tmRun = null;
      console.log('[stopApp] ✅ Stopped creating new tabs');
    }
    
    // Dừng health monitor
    window.stopWebviewHealthMonitor();
    console.log('[stopApp] 🏥 Đã dừng webview health monitor');
    
    // 2. Lưu lại trạng thái UnifiedLinkManager và TabManager
    const stats = window.UnifiedLinkManager.getStats();
    const tabStats = window.TabManager.getStats();
    console.log(`[stopApp] 📊 Tiến độ: ${stats.processed}/${stats.total} (${stats.progress}%)`);
    console.log(`[stopApp] 📊 Còn lại: ${stats.pending} links chưa xử lý`);
    console.log(`[stopApp] 📊 Tabs: ${tabStats.active}/${tabStats.max} đang chạy`);
    
    // 3. TẮT PROXY NGAY LẬP TỨC (trước khi đóng tabs)
    console.log('[stopApp] 🔌 Tắt proxy...');
    if (window.__isProxyActive) {
      proxy_deactivate().then(() => {
        console.log('[stopApp] ✅ Proxy đã tắt');
        window.__isProxyActive = false;
        window.__proxyUsername = '';
        window.__proxyPassword = '';
      }).catch(err => {
        console.error('[stopApp] ❌ Lỗi tắt proxy:', err);
      });
    } else {
      console.log('[stopApp] ℹ️ Proxy đã tắt sẵn');
    }
    
    // 4. Đóng tất cả tabs và cleanup
    if (cleanupTabs && tabStats.active > 0) {
      console.log('[stopApp] 🗑️ Đóng tất cả tabs và cleanup...');
      closeAllTabsAndCleanup('Stop app');
    } else if (cleanupTabs) {
      console.log('[stopApp] ℹ️ Không có tabs để đóng');
    }
    
    // 5. Update UI
    try {
      document.getElementById("btnStop").style.display = 'none';
      document.getElementById("btnStart").style.display = 'block';
    } catch (e) {
      console.warn('[stopApp] ⚠️ Error updating UI:', e.message);
    }
    
    console.log('[stopApp] ✅ Đã dừng app' + (cleanupTabs ? ' và cleanup tabs' : ' (giữ tabs đang chạy)'));
  }
  window.open_links = [];
  window.__lastResetIPTime = 0;
  
  window.runApp = function () {
    open_links = [];
    isRunning = true;
    currentIndex = 0; // Reset currentIndex khi khởi động
    
    // Bắt đầu health monitoring cho webviews
    window.startWebviewHealthMonitor();
    console.log('🏥 Đã bật webview health monitor');
    
    // Reset và load dữ liệu vào UnifiedLinkManager
    const currentData = window.getDataUserOption();
    console.log('[runApp] 🚀 Khởi tạo UnifiedLinkManager với', currentData.length, 'links');
    window.UnifiedLinkManager.reset();
    
    if (currentData.length > 0) {
      window.UnifiedLinkManager.addFromDataUser(currentData);
    }
    
    // Hiển thị stats
    const stats = window.UnifiedLinkManager.getStats();
    const tabStats = window.TabManager.getStats();
    const sophutLamtuoi = getStayMinutes();
    console.log(`[runApp] 🚀 Bắt đầu chạy. Queue: ${stats.total} links, Chờ xử lý: ${stats.pending}`);
    console.log(`[runApp] 🚀 Giới hạn: Tối đa ${tabStats.max} tabs cùng lúc`);
    console.log(`[runApp] ⏰ Thời gian mỗi tab: ${sophutLamtuoi} phút`);
    console.log(`[runApp] 🔄 Proxy sẽ xoay vòng sau mỗi 3 "trang" (3 x ${tabStats.max} tabs)`);
    
    document.getElementById("btnStart").style.display = 'none';
    document.getElementById("btnStop").style.display = 'block';
    
    // QUAN TRỌNG: KHÔNG mở tabs ngay, phải lấy proxy trước
    console.log('[runApp] ⏳ Kiểm tra trạng thái proxy...');
    if (!window.__isProxyActive) {
      console.log('[runApp] ⚠️ Proxy chưa active. Gọi fnResetIP để lấy proxy trước...');
      // Gọi fnResetIP để lấy proxy, sau khi proxy active sẽ tự động mở tabs
      setTimeout(fnResetIP, 2000);
    } else {
      console.log('[runApp] ✅ Proxy đã active, bắt đầu xử lý song song...');
      // Chỉ chạy khi proxy đã sẵn sàng
      if (stats.pending > 0) {
        setTimeout(() => {
          runParallelProcessing();
        }, 1000);
      }
    }
    
    window.tmRun = setInterval(function () {
      if (!navigator.onLine)
        return;
        
      // QUAN TRỌNG: Kiểm tra xem có cần đổi proxy theo sophut_lamtuoi không
      if (window.shouldChangeProxyNow()) {
        const sophutLamtuoi = getStayMinutes();
        const elapsed = Math.ceil((Date.now() - window.__batchStartTime) / 60000);
        const activeTabs = document.querySelectorAll('[id^="U_"]').length;

        if (activeTabs > 0) {
          console.log(`⏰ [tmRun] Đã đến thời điểm đổi proxy (${elapsed}/${sophutLamtuoi} phút). Đóng tất cả tabs và đổi proxy mới...`);
          
          // Đóng tất cả tabs bằng helper function
          closeAllTabsAndCleanup(`Đổi proxy sau ${elapsed} phút`);
          
          // Trigger đổi proxy (fnResetIP sẽ được gọi khi không còn tab)
          window.__batchStartTime = 0; // Reset để fnResetIP biết cần lấy proxy mới
          return;
        }

        // Không có tab nào đang chạy -> đổi proxy ngay
        console.log(`⏰ [tmRun] Đã đến thời điểm đổi proxy (${elapsed}/${sophutLamtuoi} phút) nhưng không có tab. Gọi fnResetIP...`);
        window.__batchStartTime = 0;

        // Tránh spam fnResetIP
        const now = Date.now();
        if (!window.__lastResetIPTime || (now - window.__lastResetIPTime > 5000)) {
          fnResetIP(true);
          window.__lastResetIPTime = now;
        }
        return;
      }
      
      document.querySelectorAll('[onclick^="fnRemove"]').forEach(function (el) {
        if (el.parentNode) {
          var tab_id = el.parentNode.getAttribute("id");
          if (!document.querySelector('#U_' + tab_id))
            if (el.parentNode.parentNode)
              if (el.parentNode.parentNode.parentNode)
                el.parentNode.parentNode.parentNode.remove();
        }
      });
      
      // Chỉ gọi fnResetIP mỗi 5 giây, tránh spam
      const now = Date.now();
      if (document.querySelectorAll('[id^="U_"]').length === 0) {
        if (now - window.__lastResetIPTime > 5000) {
          const queueStats = window.LinkQueueManager.getStats();
          // Nếu còn link chờ xử lý HOẶC proxy chưa active, gọi fnResetIP
          if ((queueStats.pending > 0 || queueStats.total > 0) && isRunning) {
            if (!window.__isProxyActive) {
              console.log(`⚠️ [tmRun] Proxy chưa active. Gọi fnResetIP để lấy proxy...`);
            } else {
              console.log(`🔄 [tmRun] Không còn tabs. Còn ${queueStats.pending} links chờ. Gọi fnResetIP...`);
            }
            fnResetIP();
            window.__lastResetIPTime = now;
          }
        }
      }
      else if (document.querySelector('#U_reset3G')) {
        cCheckIP++;
        if (cCheckIP > 8) {
          cCheckIP = 0;
          fnRemoveTab("reset3G");
        }
      }
    }, getStayMinutes() * 1000);
    return false;
  }
  function loadAntdAssets() {
    // Ant Design already loaded by AutoSetup.tsx, no need to load again
    if (window.__antd_loaded) return;
    window.__antd_loaded = true;
  }

  // Hàm render lưới động CsmDynamicGrid
  window.renderKeywordGrid = function () {
    const { CsmDynamicGrid } = window.antd;
    const React = window.React;
    const { getTableData, updateTableData, andWhere } = window.csmApi;
    const { encrypt, decrypt } = window.csmCrypto;

    // Cấu hình m_configs cho lưới từ khóa
    const m_configs = {
      id: 'keyword_grid',
      label: 'Quản lý từ khóa SEO',
      table_name: '', // Không sử dụng backend, chỉ dùng local storage
      table_pagesize: 10,
      type_form: 1, // Dạng bảng
      row_type_edit: 1, // Chỉnh sửa inline
      g_readonly: false,
      struct: {
        fieldsPK: ['id']
      },
      table: [
        {
          f_name: 'id',
          f_header: 'ID',
          f_show: 0,
          f_pkid: 1,
          f_types: 'ro'
        },
        {
          f_name: 'tu_khoa',
          f_header: 'Từ khóa',
          f_show: 1,
          f_stt: 1,
          f_types: 'ed',
          f_width: 200,
          f_search: 1
        },
        {
          f_name: 'domain_or_link',
          f_header: 'Tên miền / Link',
          f_show: 1,
          f_stt: 2,
          f_types: 'ed',
          f_width: 260
        },
        {
          f_name: 'gtop',
          f_header: 'Vị trí',
          f_show: 1,
          f_stt: 3,
          f_types: 'ed',
          f_width: 120
        },
        {
          f_name: 'kieu_chay',
          f_header: 'Kiểu click',
          f_show: 1,
          f_stt: 4,
          f_types: 'cbo',
          f_width: 160,
          f_cbo_query: JSON.stringify({
            options: [
              { ma: 0, ten: 'Chạy tất cả' },
              { ma: 1, ten: 'Chỉ chạy link quảng cáo' },
              { ma: 2, ten: 'Chạy tự nhiên' }
            ]
          })
        }
      ],
      trigger: {
        // Trigger load_db: Tải dữ liệu từ csmUserData (window.csmCurrentUser.user_address)
        load_db: encrypt(`
          console.log('[load_db] START - Loading data from window.csmUserData');
          // Ưu tiên lấy từ window.csmUserData.get() - đây là source of truth
          if (window.csmUserData && typeof window.csmUserData.get === 'function') {
            try {
              const raw = window.csmUserData.get();
              let data = Array.isArray(raw) ? raw : (typeof raw === 'string' ? JSON.parse(raw) : []);
              window.dataUserOption = data;
              console.log('[load_db] ✅ Loaded from csmUserData, count:', data.length);
              return data;
            } catch (e) {
              console.error('[load_db] ⚠️ Error loading from csmUserData:', e);
              window.dataUserOption = [];
              return [];
            }
          }
          // Fallback: localStorage (chỉ dùng khi csmUserData không có)
          const stored = localStorage.getItem('user_address');
          if (stored) {
            try {
              const data = JSON.parse(stored);
              if (Array.isArray(data)) {
                window.dataUserOption = data;
                console.log('[load_db] Loaded from localStorage, count:', data.length);
                return data;
              }
            } catch (e) {
              console.error('[load_db] Error parsing localStorage:', e);
            }
          }
          window.dataUserOption = [];
          console.log('[load_db] No data found, returning empty array');
          return [];
        `),

        // Trigger beforeImport: Chuẩn hóa dữ liệu Excel/CSV trước khi nạp
        beforeImport: encrypt(`
          console.log('[beforeImport] START - Normalizing import data, received:', items.length, 'rows');
          if (!Array.isArray(items)) {
            console.error('[beforeImport] ERROR: items is not an array!');
            return [];
          }
          
          if (items.length === 0) {
            console.warn('[beforeImport] WARNING: Empty import data');
            return [];
          }

          // Header key order từ file Excel
          const headerKeys = items[0] ? Object.keys(items[0]) : [];
          console.log('[beforeImport] headerKeys detected:', headerKeys);

          // Kiểm tra xem file có cột ID không
          const hasIdColumn = headerKeys.some((k) => {
            const key = (k || '').toString().toLowerCase().trim();
            return key === 'id' || key.includes('kw_id') || key.includes('keyword_id');
          });

          const pickByPosition = (row, idx) => {
            const key = headerKeys[idx];
            return key && row[key] != null ? String(row[key]).trim() : '';
          };

          // Xác định vị trí cột dựa trên nanh ID
          const posTuKhoa = hasIdColumn ? 1 : 0;
          const posDomain = hasIdColumn ? 2 : 1;
          const posGtop = hasIdColumn ? 3 : 2;
          const posKieuChay = hasIdColumn ? 4 : 3;

          const mapKieuChay = (val) => {
            const raw = (val ?? '').toString().toLowerCase().trim();
            if (raw === '1' || raw.includes('qc') || raw.includes('ads') || raw.includes('quang')) return 1;
            if (raw === '2' || raw.includes('tu nhien') || raw.includes('tự') || raw.includes('organic')) return 2;
            return 0; // mặc định
          };

          const normalized = items
            .map((item, idx) => {
              // Priority: tên cột -> fallback vị trí cột
              const tu_khoa = (
                item.tu_khoa || item['từ khóa'] || item['Từ khóa'] || 
                item.keyword || item['Keyword'] || pickByPosition(item, posTuKhoa)
              );
              const domain_or_link = (
                item.domain_or_link || item.domain || item.link || item.url ||
                item['tên miền'] || item['Tên miền'] || item['domain hoặc link'] ||
                pickByPosition(item, posDomain)
              );
              const gtop = (
                item.gtop || item['vị trí'] || item['Vị trí'] || 
                item.position || item.rank || pickByPosition(item, posGtop)
              );
              const kieu_chay = mapKieuChay(
                item.kieu_chay || item['kiểu chạy'] || item['type'] || pickByPosition(item, posKieuChay)
              );

              // Bỏ dòng nếu cả keyword và domain đều rỗng
              if (!tu_khoa && !domain_or_link) {
                console.log('[beforeImport] Skipping row', idx, '- both keyword and domain are empty');
                return null;
              }

              return {
                id: item.id || ('kw_' + Date.now() + '_' + idx + '_' + Math.random().toString(36).slice(2, 8)),
                tu_khoa: tu_khoa || '',
                domain_or_link: domain_or_link || '',
                gtop: gtop || '',
                kieu_chay
              };
            })
            .filter(Boolean);

          console.log('[beforeImport] ✅ Normalized:', normalized.length, 'rows from', items.length);
          console.log('[beforeImport] RETURNING:', normalized.length, 'rows');
          return normalized;
        `),

        // Trigger afterImport: Sync dữ liệu sau import vào window.dataUserOption
        afterImport: encrypt(`(function() {
console.log('[afterImport] START - Syncing', Array.isArray(items) ? items.length : 0, 'rows');
console.log('[afterImport] items:', items);
if (!Array.isArray(items)) {
  console.error('[afterImport] ERROR: items is not an array!', items);
  console.log('[afterImport] items type:', typeof items, 'value:', items);
  return;
}
window.dataUserOption = items;
console.log('[afterImport] ✅ Updated window.dataUserOption, count:', items.length);
if (window.csmUserData && typeof window.csmUserData.set === 'function') {
  console.log('[afterImport] Calling csmUserData.set()...');
  window.csmUserData.set(items, function(success, error) {
    if (success) {
      console.log('[afterImport] ✅ Saved to csmUserData, count:', items.length);
      if (window.thongbao) {
        window.thongbao('Import thành công ' + items.length + ' dòng dữ liệu');
      } else {
        console.log('[afterImport] ℹ️ Message: Import thành công ' + items.length + ' dòng');
      }
    } else {
      console.error('[afterImport] ❌ csmUserData.set failed:', error);
      if (window.canhbao) {
        window.canhbao('Lưu user_address thất bại: ' + (error || 'Unknown error'));
      }
    }
  });
} else {
  console.warn('[afterImport] ⚠️ csmUserData not available, using localStorage only');
}
try {
  localStorage.setItem('user_address', JSON.stringify(items));
  console.log('[afterImport] ✅ Saved to localStorage, count:', items.length);
} catch (err) {
  console.error('[afterImport] ❌ localStorage error:', err);
}
})();`),

        // Trigger afterAdd: Sync sau khi thêm dòng mới
        afterAdd: encrypt(`(function() {
console.log('[afterAdd] START - Added new row, syncing', items.length, 'total rows');
console.log('[afterAdd] items:', items);
if (!Array.isArray(items)) {
  console.error('[afterAdd] ERROR: items is not an array!');
  return;
}
window.dataUserOption = items;
console.log('[afterAdd] ✅ Updated window.dataUserOption');
if (window.csmUserData && typeof window.csmUserData.set === 'function') {
  console.log('[afterAdd] Calling csmUserData.set()...');
  window.csmUserData.set(items, function(success, error) {
    if (success) {
      console.log('[afterAdd] ✅ Saved to csmUserData');
    } else {
      console.error('[afterAdd] ❌ csmUserData.set failed:', error);
    }
  });
}
try {
  localStorage.setItem('user_address', JSON.stringify(items));
  console.log('[afterAdd] ✅ Saved to localStorage');
} catch (err) {
  console.error('[afterAdd] localStorage error:', err);
}
})();`),

        // Trigger afterEdit: Sync sau khi chỉnh sửa dòng
        afterEdit: encrypt(`(function() {
console.log('[afterEdit] START - Updated row, syncing', items.length, 'total rows');
console.log('[afterEdit] items:', items);
if (!Array.isArray(items)) {
  console.error('[afterEdit] ERROR: items is not an array!');
  return;
}
window.dataUserOption = items;
console.log('[afterEdit] ✅ Updated window.dataUserOption');
if (window.csmUserData && typeof window.csmUserData.set === 'function') {
  console.log('[afterEdit] Calling csmUserData.set()...');
  window.csmUserData.set(items, function(success, error) {
    if (success) {
      console.log('[afterEdit] ✅ Saved to csmUserData');
    } else {
      console.error('[afterEdit] ❌ csmUserData.set failed:', error);
    }
  });
}
try {
  localStorage.setItem('user_address', JSON.stringify(items));
  console.log('[afterEdit] ✅ Saved to localStorage');
} catch (err) {
  console.error('[afterEdit] localStorage error:', err);
}
})();`),

        // Trigger afterDelete: Sync sau khi xóa dòng
        afterDelete: encrypt(`(function() {
console.log('[afterDelete] ✅ Deleted row, syncing', items.length, 'total rows');
if (!Array.isArray(items)) {
  console.error('[afterDelete] ERROR: items is not an array!');
  return;
}
window.dataUserOption = items;
if (window.csmUserData && typeof window.csmUserData.set === 'function') {
  window.csmUserData.set(items);
}
try {
  localStorage.setItem('user_address', JSON.stringify(items));
} catch (err) {
  console.error('[afterDelete] localStorage error:', err);
}
})();`)
      }
    };

    // Chuẩn bị database object theo format CsmDynamicGrid cần
    // CsmDynamicGrid cần {tableName: {rows: [...]}} - nhưng vì table_name="", nên sẽ dùng load_db trigger
    const latestData = window.getDataUserOption();
    console.log('[renderKeywordGrid] Creating database object with latestData length:', latestData.length);
    console.log('[renderKeywordGrid] m_configs.trigger keys:', Object.keys(m_configs.trigger || {}));
    console.log('[renderKeywordGrid] m_configs.trigger.afterImport typeof:', typeof m_configs.trigger?.afterImport);
    console.log('[renderKeywordGrid] m_configs.trigger.afterImport first 100 chars:', String(m_configs.trigger?.afterImport || '').substring(0, 100));
    const database = {
      '': { rows: latestData }  // Khóa rỗng vì table_name=""
    };
    console.log('[renderKeywordGrid] database object:', database);

    return React.createElement(CsmDynamicGrid, {
      m_configs: m_configs,
      database: database,
      appId: seft.app_id,
      permissions: -1, // Full permissions
      decrypt: decrypt,
      enableSearch: true,
      onDataChange: () => {
        // Dữ liệu đã được sync qua trigger, không cần làm gì thêm
        console.log('[onDataChange] Grid data changed, triggers đã xử lý sync');
      }
    });
  };

  // Expose seft globally for trigger access
  window.seft = seft;
}

// Đảm bảo các dependency đã được expose lên window
window.React = window.React || (typeof React !== 'undefined' ? React : undefined);
window.ReactDOM = window.ReactDOM || (typeof ReactDOM !== 'undefined' ? ReactDOM : undefined);
window.CsmDynamicGrid = window.CsmDynamicGrid || (typeof CsmDynamicGrid !== 'undefined' ? CsmDynamicGrid : undefined);

// Khởi động lắng nghe container
setupWhenContainerReady();