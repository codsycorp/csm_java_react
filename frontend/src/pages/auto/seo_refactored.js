/**
 * ===== COMPREHENSIVE SEO AUTOMATION SYSTEM =====
 * Hệ thống tự động hóa SEO đầy đủ
 * 
 * Các module chính:
 * 1. BililiteRange - Quản lý input/textarea text selection
 * 2. GA4 Event Tracking - Theo dõi hành vi người dùng
 * 3. Proxy Management - Quản lý proxy trên Windows/macOS
 * 4. Tab/Webview Management - Quản lý các tab trình duyệt
 * 5. Google Search Automation - Tự động hóa tìm kiếm Google
 * 6. User Behavior Simulation - Mô phỏng hành vi người dùng thực
 */

// ============================================
// MODULE 1: BILILITE RANGE - TEXT EDITING
// ============================================
window.fnBililiteRange = function() {
  let bililiteRange;
  (function() {
    const datakey = Symbol();
    
    bililiteRange = function(el) {
      let ret;
      if (el.setSelectionRange) {
        try {
          el.selectionStart = el.selectionStart;
          ret = new InputRange();
        } catch(e) {
          ret = new NothingRange();
        }
      } else {
        ret = new W3CRange();
      }
      ret._el = el;
      ret._doc = el.ownerDocument;
      ret._win = ret._doc.defaultView;
      ret._bounds = [0, ret.length];
      
      if (!(el[datakey])) {
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
      data.oldText = range.all();
      data.liveRanges = new Set();
      range.listen('input', evt => {
        const newText = range.all();
        if (!evt.bililiteRange) {
          evt.bililiteRange = diff(data.oldText, newText);
          if (evt.bililiteRange.unchanged) {
            evt.bililiteRange.start = range.clone().bounds('selection')[1] - (evt.data || '').length;
          }
        }
        data.oldText = newText;

        data.liveRanges.forEach(rng => {
          const start = evt.bililiteRange.start;
          const oldend = start + evt.bililiteRange.oldText.length;
          const newend = start + evt.bililiteRange.newText.length;
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
      let i;
      for (i = 0; i < newlen && i < oldlen; ++i) {
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
    }
    bililiteRange.diff = diff;

    function correctNewlines(element, range, data) {
      range.listen('paste', evt => {
        if (evt.defaultPrevented) return;
        range.clone().bounds('selection').
          text(evt.clipboardData.getData("text/plain").replace(/\r/g, ''), {inputType: 'insertFromPaste'}).
          bounds('endbounds').
          select().
          scrollIntoView();
        evt.preventDefault();
      });
      range.listen('keydown', function(evt) {
        if (evt.ctrlKey || evt.altKey || evt.shiftKey || evt.metaKey) return;
        if (evt.defaultPrevented) return;
        if (evt.key == 'Enter') {
          range.clone().bounds('selection').
            text('\n', {inputType: 'insertLineBreak'}).
            bounds('endbounds').
            select().
            scrollIntoView();
          evt.preventDefault();
        }
      });
    }

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

    // Base Range Class
    function Range() {}
    Range.prototype = {
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
      all: function(text) {
        if (arguments.length) {
          return this.bounds('all').text(text, {inputType: 'insertReplacementText'});
        } else {
          return this._el[this._textProp];
        }
      },
      bounds: function(s) {
        if (typeof s === 'number') {
          this._bounds = [s, s];
        } else if (bililiteRange.bounds[s]) {
          this.bounds(bililiteRange.bounds[s].apply(this, arguments));
        } else if (s && s.bounds) {
          this._bounds = s.bounds();
        } else if (s) {
          this._bounds = s;
        } else {
          var b = [
            Math.max(0, Math.min(this.length, this._bounds[0])),
            Math.max(0, Math.min(this.length, this._bounds[1]))
          ];
          b[1] = Math.max(b[0], b[1]);
          return b;
        }
        return this;
      },
      clone: function() {
        return bililiteRange(this._el).bounds(this.bounds());
      },
      get data() {
        return this._el[datakey];
      },
      dispatch: function(opts = {}) {
        var event = new Event(opts.type, opts);
        event.view = this._win;
        for (let prop in opts) try {
          event[prop] = opts[prop]
        } catch(e) {}
        this._el.dispatchEvent(event);
        return this;
      },
      get document() {
        return this._doc;
      },
      dontlisten: function(type, func = console.log, target) {
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
      listen: function(type, func = console.log, target) {
        target ??= this._el;
        target.addEventListener(type, func);
        return this;
      },
      scrollIntoView() {
        var top = this.top();
        if (this._el.scrollTop > top || this._el.scrollTop + this._el.clientHeight < top) {
          this._el.scrollTop = top;
        }
        return this;
      },
      select: function() {
        var b = this.data.selection = this.bounds();
        if (this._el === this._doc.activeElement) {
          this._nativeSelect(this._nativeRange(b));
        }
        this.dispatch({type: 'select', bubbles: true});
        return this;
      },
      selection: function(text) {
        if (arguments.length) {
          return this.bounds('selection').text(text).bounds('endbounds').select();
        } else {
          return this.bounds('selection').text();
        }
      },
      sendkeys: function(text) {
        this.data.sendkeysOriginalText = this.text();
        this.data.sendkeysBounds = undefined;
        function simplechar(rng, c) {
          if (/^{[^}]*}$/.test(c)) c = c.slice(1, -1);
          rng.text(c).bounds('endbounds');
        }
        text.replace(/{[^}]*}|[^{]+|{/g, part => (bililiteRange.sendkeys[part] || simplechar)(this, part, simplechar));
        this.bounds(this.data.sendkeysBounds);
        this.dispatch({type: 'sendkeys', detail: text});
        return this;
      },
      text: function(text, {inputType = 'insertText'} = {}) {
        if (text !== undefined) {
          let eventparams = [this.text(), text, this[0], inputType];
          this.dispatch(inputEventInit('beforeinput', ...eventparams));
          this._nativeSetText(text, this._nativeRange(this.bounds()));
          this[1] = this[0] + text.length;
          this.dispatch(inputEventInit('input', ...eventparams));
          return this;
        } else {
          return this._nativeGetText(this._nativeRange(this.bounds()));
        }
      },
      top: function() {
        return this._nativeTop(this._nativeRange(this.bounds()));
      },
      get window() {
        return this._win;
      },
      wrap: function(n) {
        this._nativeWrap(n, this._nativeRange(this.bounds()));
        return this;
      },
    };

    bililiteRange.prototype = Range.prototype;
    bililiteRange.extend = function(fns) {
      Object.assign(bililiteRange.prototype, fns);
    };

    bililiteRange.override = (name, fn) => {
      const oldfn = bililiteRange.prototype[name];
      bililiteRange.prototype[name] = function() {
        const oldsuper = this.super;
        this.super = oldfn;
        const ret = fn.apply(this, arguments);
        this.super = oldsuper;
        return ret;
      };
    }

    bililiteRange.bounds = {
      all: function() {
        return [0, this.length]
      },
      start: function() {
        return 0
      },
      end: function() {
        return this.length
      },
      selection: function() {
        if (this._el === this._doc.activeElement) {
          this.bounds('all');
          return this._nativeSelection();
        } else {
          return this.data.selection;
        }
      },
      startbounds: function() {
        return this[0]
      },
      endbounds: function() {
        return this[1]
      },
      union: function(name, ...rest) {
        const b = this.clone().bounds(...rest);
        return [Math.min(this[0], b[0]), Math.max(this[1], b[1])];
      },
      intersection: function(name, ...rest) {
        const b = this.clone().bounds(...rest);
        return [Math.max(this[0], b[0]), Math.min(this[1], b[1])];
      }
    };

    bililiteRange.sendkeys = {
      '{tab}': function(rng, c, simplechar) {
        simplechar(rng, '\t');
      },
      '{newline}': function(rng) {
        rng.text('\n', {inputType: 'insertLineBreak'}).bounds('endbounds');
      },
      '{backspace}': function(rng) {
        var b = rng.bounds();
        if (b[0] == b[1]) rng.bounds([b[0] - 1, b[0]]);
        rng.text('', {inputType: 'deleteContentBackward'});
      },
      '{del}': function(rng) {
        var b = rng.bounds();
        if (b[0] == b[1]) rng.bounds([b[0], b[0] + 1]);
        rng.text('', {inputType: 'deleteContentForward'}).bounds('endbounds');
      },
      '{rightarrow}': function(rng) {
        var b = rng.bounds();
        if (b[0] == b[1]) ++b[1];
        rng.bounds([b[1], b[1]]);
      },
      '{leftarrow}': function(rng) {
        var b = rng.bounds();
        if (b[0] == b[1]) --b[0];
        rng.bounds([b[0], b[0]]);
      },
      '{selectall}': function(rng) {
        rng.bounds('all');
      },
      '{selection}': function(rng) {
        rng.text(rng.data.sendkeysOriginalText).bounds('endbounds');
      },
      '{mark}': function(rng) {
        rng.data.sendkeysBounds = rng.bounds();
      },
      '{ctrl-Home}': (rng, c, simplechar) => rng.bounds('start'),
      '{ctrl-End}': (rng, c, simplechar) => rng.bounds('end')
    };
    
    bililiteRange.sendkeys['{Enter}'] = bililiteRange.sendkeys['{enter}'] = bililiteRange.sendkeys['{newline}'];
    bililiteRange.sendkeys['{Backspace}'] = bililiteRange.sendkeys['{backspace}'];
    bililiteRange.sendkeys['{Delete}'] = bililiteRange.sendkeys['{del}'];
    bililiteRange.sendkeys['{ArrowRight}'] = bililiteRange.sendkeys['{rightarrow}'];
    bililiteRange.sendkeys['{ArrowLeft}'] = bililiteRange.sendkeys['{leftarrow}'];

    // Input Range Implementation
    function InputRange() {}
    InputRange.prototype = new Range();
    InputRange.prototype._textProp = 'value';
    InputRange.prototype._nativeRange = function(bounds) {
      return bounds || [0, this.length];
    };
    InputRange.prototype._nativeSelect = function(rng) {
      this._el.setSelectionRange(rng[0], rng[1]);
    };
    InputRange.prototype._nativeSelection = function() {
      return [this._el.selectionStart, this._el.selectionEnd];
    };
    InputRange.prototype._nativeGetText = function(rng) {
      return this._el.value.substring(rng[0], rng[1]);
    };
    InputRange.prototype._nativeSetText = function(text, rng) {
      var val = this._el.value;
      this._el.value = val.substring(0, rng[0]) + text + val.substring(rng[1]);
    };
    InputRange.prototype._nativeEOL = function() {
      this.text('\n');
    };
    InputRange.prototype._nativeTop = function(rng) {
      if (rng[0] == 0) return 0;
      const el = this._el;
      if (el.nodeName == 'INPUT') return 0;
      const text = el.value;
      const selection = [el.selectionStart, el.selectionEnd];
      el.value = text.slice(0, rng[0]);
      el.scrollTop = Number.MAX_SAFE_INTEGER;
      el.value = text;
      el.setSelectionRange(...selection);
      return el.scrollTop;
    }
    InputRange.prototype._nativeWrap = function() {
      throw new Error("Cannot wrap in a text element")
    };

    // W3C Range Implementation (for contentEditable)
    function W3CRange() {}
    W3CRange.prototype = new Range();
    W3CRange.prototype._textProp = 'textContent';
    W3CRange.prototype._nativeRange = function(bounds) {
      var rng = this._doc.createRange();
      rng.selectNodeContents(this._el);
      if (bounds) {
        w3cmoveBoundary(rng, bounds[0], true, this._el);
        rng.collapse(true);
        w3cmoveBoundary(rng, bounds[1] - bounds[0], false, this._el);
      }
      return rng;
    };
    W3CRange.prototype._nativeSelect = function(rng) {
      this._win.getSelection().removeAllRanges();
      this._win.getSelection().addRange(rng);
    };
    W3CRange.prototype._nativeSelection = function() {
      var rng = this._nativeRange();
      if (this._win.getSelection().rangeCount == 0) return [this.length, this.length];
      var sel = this._win.getSelection().getRangeAt(0);
      return [
        w3cstart(sel, rng),
        w3cend(sel, rng)
      ];
    };
    W3CRange.prototype._nativeGetText = function(rng) {
      return rng.toString();
    };
    W3CRange.prototype._nativeSetText = function(text, rng) {
      rng.deleteContents();
      rng.insertNode(this._doc.createTextNode(text));
      if (text == '\n' && this[1] + 1 == this._el.textContent.length) {
        this._el.innerHTML = this._el.innerHTML + '\n';
      }
      this._el.normalize();
    };
    W3CRange.prototype._nativeEOL = function() {
      var rng = this._nativeRange(this.bounds());
      rng.deleteContents();
      var br = this._doc.createElement('br');
      br.setAttribute('_moz_dirty', '');
      rng.insertNode(br);
      rng.insertNode(this._doc.createTextNode('\n'));
      rng.collapse(false);
    };
    W3CRange.prototype._nativeTop = function(rng) {
      if (this.length == 0) return 0;
      if (rng.toString() == '') {
        var textnode = this._doc.createTextNode('X');
        rng.insertNode(textnode);
      }
      var startrng = this._nativeRange([0, 1]);
      var top = rng.getBoundingClientRect().top - startrng.getBoundingClientRect().top;
      if (textnode) textnode.parentNode.removeChild(textnode);
      return top;
    }
    W3CRange.prototype._nativeWrap = function(n, rng) {
      rng.surroundContents(n);
    };

    // W3C Helper Functions
    function nextnode(node, root) {
      if (node.firstChild) return node.firstChild;
      if (node.nextSibling) return node.nextSibling;
      if (node === root) return null;
      while (node.parentNode) {
        node = node.parentNode;
        if (node == root) return null;
        if (node.nextSibling) return node.nextSibling;
      }
      return null;
    }
    
    function w3cmoveBoundary(rng, n, bStart, el) {
      if (n <= 0) return;
      var node = rng[bStart ? 'startContainer' : 'endContainer'];
      if (node.nodeType == 3) {
        n += rng[bStart ? 'startOffset' : 'endOffset'];
      }
      while (node) {
        if (node.nodeType == 3) {
          var length = node.nodeValue.length;
          if (n <= length) {
            rng[bStart ? 'setStart' : 'setEnd'](node, n);
            if (n == length) {
              for (var next = nextnode(node, el); next && next.nodeType == 3 && next.nodeValue.length == 0; next = nextnode(next, el)) {
                rng[bStart ? 'setStartAfter' : 'setEndAfter'](next);
              }
              if (next && next.nodeType == 1 && next.nodeName == "BR") rng[bStart ? 'setStartAfter' : 'setEndAfter'](next);
            }
            return;
          } else {
            rng[bStart ? 'setStartAfter' : 'setEndAfter'](node);
            n -= length;
          }
        }
        node = nextnode(node, el);
      }
    }
    
    var START_TO_START = 0;
    var START_TO_END = 1;
    var END_TO_END = 2;
    var END_TO_START = 3;
    
    function w3cstart(rng, constraint) {
      if (rng.compareBoundaryPoints(START_TO_START, constraint) <= 0) return 0;
      if (rng.compareBoundaryPoints(END_TO_START, constraint) >= 0) return constraint.toString().length;
      rng = rng.cloneRange();
      rng.setEnd(constraint.endContainer, constraint.endOffset);
      return constraint.toString().length - rng.toString().length;
    }
    
    function w3cend(rng, constraint) {
      if (rng.compareBoundaryPoints(END_TO_END, constraint) >= 0) return constraint.toString().length;
      if (rng.compareBoundaryPoints(START_TO_END, constraint) <= 0) return 0;
      rng = rng.cloneRange();
      rng.setStart(constraint.startContainer, constraint.startOffset);
      return rng.toString().length;
    }

    // Nothing Range (for unsupported elements)
    function NothingRange() {}
    NothingRange.prototype = new Range();
    NothingRange.prototype._textProp = 'value';
    NothingRange.prototype._nativeRange = function(bounds) {
      return bounds || [0, this.length];
    };
    NothingRange.prototype._nativeSelect = function(rng) {
      // do nothing
    };
    NothingRange.prototype._nativeSelection = function() {
      return [0, 0];
    };
    NothingRange.prototype._nativeGetText = function(rng) {
      return this._el[this._textProp].substring(rng[0], rng[1]);
    };
    NothingRange.prototype._nativeSetText = function(text, rng) {
      var val = this._el[this._textProp];
      this._el[this._textProp] = val.substring(0, rng[0]) + text + val.substring(rng[1]);
    };
    NothingRange.prototype._nativeEOL = function() {
      this.text('\n');
    };
    NothingRange.prototype._nativeTop = function() {
      return 0;
    };
    NothingRange.prototype._nativeWrap = function() {
      throw new Error("Wrapping not implemented")
    };

    // Data Object Management
    const monitored = new Set();

    function signalMonitor(prop, value, element) {
      const attr = `data-${prop}`;
      element.dispatchEvent(new CustomEvent(attr, {bubbles: true, detail: value}));
      try {
        element.setAttribute(attr, value);
      } finally {}
    }

    function createDataObject(el) {
      return el[datakey] = new Proxy(new Data(el), {
        set(obj, prop, value) {
          obj[prop] = value;
          if (monitored.has(prop)) signalMonitor(prop, value, obj.sourceElement);
          return true;
        }
      });
    }

    var Data = function(el) {
      Object.defineProperty(this, 'sourceElement', {
        value: el
      });
    }

    Data.prototype = {};
    Object.defineProperty(Data.prototype, 'toJSON', {
      value: function() {
        let ret = {};
        for (let key in Data.prototype) if (this.hasOwnProperty(key)) ret[key] = this[key];
        return ret;
      }
    });
    Object.defineProperty(Data.prototype, 'all', {
      get: function() {
        let ret = {};
        for (let key in Data.prototype) ret[key] = this[key];
        return ret;
      }
    });
    Object.defineProperty(Data.prototype, 'trigger', {
      value: function() {
        monitored.forEach(prop => signalMonitor(prop, this[prop], this.sourceElement));
      }
    });

    bililiteRange.createOption = function(name, desc = {}) {
      desc = Object.assign({
        enumerable: true,
        writable: true,
        configurable: true
      }, Object.getOwnPropertyDescriptor(Data.prototype, name), desc);
      if ('monitored' in desc) monitored[desc.monitored ? 'add' : 'delete'](name);
      Object.defineProperty(Data.prototype, name, desc);
      return Data.prototype[name];
    }
  })();
  return bililiteRange;
}

// ============================================
// MODULE 2: GA4 EVENT TRACKING
// ============================================
window.strEvent = `
  /**
   * Gửi sự kiện tùy chỉnh tới GA4
   * @param {string} eventName - Tên sự kiện
   * @param {object} eventParams - Các tham số tùy chỉnh
   * @param {string} sessionId - ID phiên
   * @param {number} engagementTime - Thời gian tương tác (ms)
   */
  function sendGA4Event(eventName, eventParams = {}, sessionId, engagementTime) {
    const safeEngagementTime = Math.max(0, engagementTime);
    
    if (typeof gtag === 'function') {
      gtag('event', eventName, {
        ...eventParams,
        'session_id': sessionId,
        'engagement_time_msec': safeEngagementTime
      });
      console.log('GA4 Event: ' + eventName + ' - session: ' + sessionId);
    } else {
      console.warn('GA4: gtag not found');
    }
  }

  /**
   * Lấy Client ID từ cookie _ga
   */
  function getClientIdFromGaCookie() {
    const gaCookie = document.cookie.split('; ').find(row => row.startsWith('_ga='));
    if (gaCookie) {
      const cookieValue = gaCookie.split('.').slice(2).join('.');
      if (cookieValue && cookieValue.length > 0) {
        return cookieValue;
      }
    }
    return null;
  }

  /**
   * Gửi sự kiện tổng kết khi người dùng rời trang
   */
  function sendFinalEngagementEvent(sessionId, startTime) {
    if (!sessionId || !startTime) return;
    
    const finalEngagementTime = Date.now() - startTime;
    const safeFinalEngagementTime = Math.max(0, finalEngagementTime);
    sendGA4Event('user_engagement', { engaged_session_event: true }, sessionId, safeFinalEngagementTime);
    
    localStorage.removeItem('simulation_sessionId');
    localStorage.removeItem('simulation_startTime');
  }

  window.addEventListener('beforeunload', () => {
    const sessionId = localStorage.getItem('simulation_sessionId');
    const startTime = localStorage.getItem('simulation_startTime');
    if (sessionId && startTime) {
      sendFinalEngagementEvent(sessionId, startTime);
    }
  });

  /**
   * Mô phỏng hành vi người dùng thực tế
   * @param {number} sessionDurationMinutes - Thời lượng phiên (phút)
   */
  async function simulateRealisticUserBehavior(sessionDurationMinutes = 5) {
    const startTime = Date.now();
    console.log('Start simulating user behavior...');

    const ga_clientId = getClientIdFromGaCookie();
    if (!ga_clientId) {
      console.error('Cannot get GA Client ID. Abort simulation.');
      return;
    }

    const sessionDuration = sessionDurationMinutes * 60000;
    const endTime = startTime + sessionDuration;
    const sessionId = Math.floor(Date.now() / 1000);

    localStorage.setItem('simulation_sessionId', sessionId);
    localStorage.setItem('simulation_startTime', startTime);

    // 80-90% thời gian ở trang đầu tiên
    const stayOnPageRatio = Math.random() * 0.1 + 0.8;
    const navigationThreshold = sessionDuration * stayOnPageRatio;
    let lastEngagementTime = startTime;

    while (Date.now() < endTime) {
      const elapsedTime = Date.now() - startTime;

      // Kiểm tra có chuyển trang không
      if (elapsedTime >= navigationThreshold) {
        const internalLinks = Array.from(document.querySelectorAll('a[href^="/"], a[href^="' + window.location.origin + '"]'));
        
        if (internalLinks.length > 0) {
          const randomIndex = Math.floor(Math.random() * internalLinks.length);
          const targetUrl = internalLinks[randomIndex].href;

          const currentEngagementTime = Date.now() - lastEngagementTime;
          sendGA4Event('internal_link_click', {
            'link_url': targetUrl,
            'link_text': internalLinks[randomIndex].innerText || 'N/A'
          }, sessionId, currentEngagementTime);

          window.location.href = targetUrl;
          break;
        }
      }

      // Mô phỏng cuộn trang
      const scrollDuration = Math.random() * 4000 + 2000;
      const readingTime = Math.random() * 20000 + 10000;

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
      sendGA4Event('scrolled', { 
        scroll_depth: Math.min(100, Math.round((window.scrollY + window.innerHeight) / document.body.scrollHeight * 100)) + "%" 
      }, sessionId, scrollEnd - scrollStart);
      lastEngagementTime = scrollEnd;

      // Dừng để đọc nội dung
      await new Promise(resolve => setTimeout(resolve, readingTime));
      const readingEnd = Date.now();
      sendGA4Event('content_reading', { 
        read_duration_seconds: Math.round((readingEnd - readingStart) / 1000) 
      }, sessionId, readingEnd - readingStart);
      lastEngagementTime = readingEnd;
    }

    sendFinalEngagementEvent(sessionId, startTime);
  }
`;

// ============================================
// MODULE 3: GOOGLE SEARCH AUTOMATION
// ============================================
window.strGoogleAds = window.strEvent + `
  const STORAGE_KEY = 'google_auto_pagination_count';
  const MAX_PAGES = 20;

  function getCurrentClickCount() {
    const count = localStorage.getItem(STORAGE_KEY);
    return parseInt(count, 10) || 0;
  }

  function resetPagingAndClose() {
    localStorage.removeItem(STORAGE_KEY);
    console.log('[RESET] Pagination counter reset');
  }

  function simulateHumanBehavior() {
    const currentCount = getCurrentClickCount();

    if (currentCount >= MAX_PAGES) {
      resetPagingAndClose();
      return;
    }

    const nextPage = document.querySelector('a#pnnext, a[aria-label*="Next page"], a[aria-label*="Trang tiếp theo"]');

    if (nextPage) {
      const minDelaySeconds = 5;
      const maxDelaySeconds = 10;
      const randomDelay = (Math.random() * (maxDelaySeconds - minDelaySeconds) + minDelaySeconds) * 1000;
      const nextCount = currentCount + 1;

      setTimeout(function() {
        localStorage.setItem(STORAGE_KEY, nextCount.toString());
        CallMouseEvent(nextPage);
      }, randomDelay);
    } else {
      resetPagingAndClose();
    }
  }

  window.google_click = function(tu_khoa, link_check, time_o_lai_trang, isRunAds) {
    setTimeout(function(){
      console.log(JSON.stringify({type:"close", tabid:tabid}))
    }, (time_o_lai_trang + 1) * 60000);

    if(location.href.indexOf("chrome-error") !== -1) {
      console.log(JSON.stringify({type:"close", tabid:tabid}));
    } 
    else if(location.href.indexOf("google.com/sorry/index") !== -1 || (location.href.indexOf("google.com") === -1 && location.href !== link_check)) {
      simulateRealisticUserBehavior(time_o_lai_trang);
      setTimeout(function() {
        console.log(JSON.stringify({type:"close", tabid:tabid}));
      }, 60000);
    } 
    else if(location.href.indexOf("google.com") !== -1) {
      var el = document.querySelector('form [name="q"]');
      if(el) {
        if(el.value === "") {
          try {
            if(!tu_khoa) {
              return setTimeout(function() {location.href = link_check;}, 5000);
            } else {
              bililiteRange(el).sendkeys(tu_khoa + '{enter}');
              setTimeout(function() {
                if(document.querySelector('[type="submit"]'))
                  CallMouseEvent(document.querySelector('[type="submit"]'));
              }, 1000);
            }
          } catch(e) {}
        } else {
          var filterSTR = '';
          if(1 * isRunAds === 1)
            filterSTR = '*="/aclk?"';
          
          var caclinks = document.querySelectorAll('a[data-ved][href' + filterSTR + ']');
          if(document.querySelector("#search"))
            caclinks = document.querySelectorAll('#search a[data-ved][href' + filterSTR + ']');
          else if(document.querySelector("#main"))
            caclinks = document.querySelectorAll('#main a[data-ved][href' + filterSTR + ']');
          
          caclinks = Array.from(caclinks).filter(el => el.querySelector('h3'));
          var timPT = caclinks.filter(el => el.href.toLowerCase().includes(link_check));
          
          if(timPT.length > 0) {
            var idxPage = Array.from(caclinks).findIndex(el => el.href.toLowerCase().includes(link_check));
            console.log(JSON.stringify({type:"save", gTop:"Vị trí " + (idxPage + 1), tu_khoa:tu_khoa, link_check:link_check, isRunAds:isRunAds}));
            setTimeout(function() {CallMouseEvent(timPT[0]);}, 5000);
          } 
          else if(1 * isRunAds !== 1) {
            simulateHumanBehavior();
          }
        }
      }
    } else {
      simulateRealisticUserBehavior(time_o_lai_trang);
      setTimeout(function(){
        const allLinks = Array.from(document.querySelectorAll("a")).filter(link => 
          link.href.indexOf(location.hostname) !== -1 && 
          link.href.indexOf("?hl=") === -1 && 
          link.href.trim() !== location.href.trim()
        );
        if (allLinks.length > 0) {
          const lastElement = allLinks[allLinks.length - 1];
          CallMouseEvent(lastElement);
        }
      }, time_o_lai_trang * 60000);
    }
  }
`;

// ============================================
// MODULE 4: HELPER FUNCTIONS
// ============================================
window.delay = function(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function setNativeValue(element, value) {
  let lastValue = element.value;
  element.value = value;
  let event = new Event("input", { target: element, bubbles: true });
  event.simulated = true;
  let tracker = element._valueTracker;
  if (tracker) {
    tracker.setValue(lastValue);
  }
  element.dispatchEvent(event);
}

function CallMouseEvent(targetNode) {
  if (targetNode) {
    triggerMouseEvent(targetNode, "mouseover");
    triggerMouseEvent(targetNode, "mousedown");
    triggerMouseEvent(targetNode, "mouseup");
    triggerMouseEvent(targetNode, "click");
    try {
      bililiteRange(targetNode).sendkeys('{rightarrow}{enter}');
    } catch(e) {}
  } else {
    console.log("*** Target node not found!");
  }
}

function triggerMouseEvent(node, eventType) {
  var clickEvent = document.createEvent("MouseEvents");
  clickEvent.initEvent(eventType, true, true);
  node.dispatchEvent(clickEvent);
}

// ============================================
// MODULE 5: PROXY MANAGEMENT (Windows/macOS)
// ============================================
if(window.hasOwnProperty("process")) {
  window.opsys = process.platform;
}

window.proxy_activate = async function(address) {
  if (window.opsys === 'darwin') {
    // macOS proxy activation
    return await activateMacProxy(address);
  } else if (window.opsys === 'win32') {
    // Windows proxy activation
    return await activateWindowsProxy(address);
  }
  return false;
};

window.proxy_deactivate = async function() {
  if (window.opsys === 'darwin') {
    return await deactivateMacProxy();
  } else if (window.opsys === 'win32') {
    return await deactivateWindowsProxy();
  }
  return false;
};

window.proxy_status_check = async function() {
  if (window.opsys === 'darwin') {
    return await checkMacProxyStatus();
  } else if (window.opsys === 'win32') {
    return await checkWindowsProxyStatus();
  }
  return false;
};

// ============================================
// MODULE 6: MODAL/WEBVIEW MANAGEMENT
// ============================================
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

// ============================================
// MODULE 7: MAIN WEBVIEW CREATION FUNCTION
// ============================================
window.fnCreateTab = function(id_tab, url_open, script_code, multi_tab_name, auto_close) {
  if (!window.isRunning) return;
  
  try {
    if (multi_tab_name) {
      id_tab = id_tab + (document.querySelectorAll('[id^="U_' + id_tab + '"]').length + 1);
    } else if (document.querySelectorAll('[id^="U_' + id_tab + '"]').length > 0) {
      return;
    }

    const modalId = id_tab;
    const modal = document.createElement("div");
    modal.className = "modalA";
    modal.id = modalId;
    modal.innerHTML = `
      <div class="toolbar">
        <span class="title"></span>
        <div>
          <button class="fullscreen-btn">Full</button>
          <button class="close-btn">&times;</button>
        </div>
      </div>
      <div class="modal-content"></div>
      <div class="resize-handle"></div>
    `;

    let initialTop = (document.querySelectorAll('[id^="U_"]').length - 1) * 510;
    let initialLeft = 0;
    modal.style.top = initialTop + "px";
    modal.style.left = initialLeft + "px";

    dragElement(modal);
    resizeElement(modal);

    modal.querySelector(".close-btn").addEventListener("click", () => {
      window.fnRemoveTab(id_tab);
    });

    modal.querySelector(".fullscreen-btn").addEventListener("click", () => {
      modal.classList.toggle("fullscreen");
    });

    // Create webview
    var webview = document.createElement('webview');
    webview.setAttribute('id', 'U_' + id_tab);
    webview.setAttribute('style', 'border: 0; width: 100%; height: inherit; height: 400px;');
    var rand = Math.floor(Math.random() * 1000000) + Math.floor(Math.random() * 9) + (new Date).getTime();
    webview.setAttribute('partition', 'persist:' + rand);

    // Set user agent if available
    if (window.bindings && window.bindings[rand % Object.keys(window.bindings).length]) {
      var curentUserAgent = window.bindings[rand % Object.keys(window.bindings).length];
      webview.setUserAgentOverride(curentUserAgent);
    }

    setTimeout(() => {
      webview.setAttribute('src', url_open);
    }, 2000);

    // Event handlers
    webview.addEventListener("did-fail-load", (event) => {
      if (event.errorCode === -3) {
        console.log("Reloading page...");
        setTimeout(() => {
          webview.src = url_open;
        }, 3000);
      }
    });

    webview.addEventListener("dom-ready", function() {
      webview.executeScript(`
        document.dispatchEvent(new MouseEvent('mousemove', { clientX: 100, clientY: 200 }));
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'A' }));
        window.scrollBy(0, 100);
      `);
    });

    webview.addEventListener('exit', function(e) {
      if (e.reason === 'crash') {
        setTimeout(function() {
          try {
            if (document.querySelector('#U_' + id_tab))
              document.querySelector('#U_' + id_tab).reload();
          } catch(e) {}
        }, 15000);
      }
    });

    webview.addEventListener('consolemessage', (event) => {
      if (event.message.includes("ERR_BLOCKED_BY_CLIENT") || event.message.includes("ERR_ABORTED")) {
        console.log('Load blocked or aborted. Reloading...');
        setTimeout(function() {
          try {
            if (document.querySelector('#U_' + id_tab))
              document.querySelector('#U_' + id_tab).reload();
          } catch(e) {}
        }, 5000);
      }

      try {
        var message = JSON.parse(event.message);
        if(message.hasOwnProperty("type")) {
          if(message.type === "close") {
            window.fnRemoveTab(message.tabid);
          } else if(message.type === "title") {
            var titleEl = document.querySelector('#' + message.tabid + ' span>span') || document.querySelector('#' + message.tabid + ' span');
            if(titleEl) titleEl.textContent = message.title;
          }
        }
      } catch(e) {}
    });

    webview.addEventListener('loadstop', function(e) {
      if (webview.src.includes("google.com/sorry/index")) {
        console.log(`[loadstop] Detected captcha, closing tab ${id_tab}`);
        if (typeof window.fnRemoveTab === 'function') window.fnRemoveTab(id_tab);
      }
      
      if (auto_close) {
        setTimeout(function(){
          console.log(`[loadstop] Auto-closing tab ${id_tab} after ${auto_close/60000} minutes`);
          if (typeof window.fnRemoveTab === 'function') window.fnRemoveTab(id_tab);
        }, auto_close);
      }
    });

    // Add script to webview if provided
    if(script_code) {
      var strScript = 'window.tabid="' + id_tab + '";\\n window.fnBililiteRange=' + window.fnBililiteRange.toString() + ';\\n window.bililiteRange=fnBililiteRange();\\n try{\\n console.log(JSON.stringify({type:"title",tabid:tabid,title:document.title||location.href})); \\n ' + script_code + '\\n}catch(exT){console.log(JSON.stringify({type:"error",tabid:tabid,msg:exT.message}));}\\n ';
      
      var strCode = 'var scriptAu=document.createElement("script");\\n';
      strCode += '  scriptAu.src="data:text/javascript;base64,' + (window.seft && window.seft.Base64 ? window.seft.Base64.encode(strScript) : btoa(strScript)) + '";\\n';
      strCode += '  scriptAu.type="text/javascript";\\n';
      strCode += '  document.head.appendChild(scriptAu);\\n';
      
      webview.addContentScripts([{
        js: {code: strCode},
        name: 'params',
        matches: ['<all_urls>'],
        all_frames: true,
        run_at: 'document_end',
      }]);
    }

    document.querySelector('#context-auto .card-body')?.appendChild(modal);
    modal.querySelector('.modal-content').appendChild(webview);

    setTimeout(function() {
      if (document.querySelector('#U_' + id_tab))
        document.querySelector('#U_' + id_tab).scrollIntoView();
    }, 5000);

    if (auto_close) {
      setTimeout(function() {
        try {
          if (document.querySelector('#U_' + id_tab))
            document.querySelector('#U_' + id_tab).reload();
        } catch(e) {}
      }, auto_close + 2000);
    }
  } catch(exT) {
    console.log("Error creating tab:", exT.message, id_tab);
    window.fnRemoveTab(id_tab);
  }
}

// ============================================
// MODULE 8: TAB REMOVAL FUNCTION
// ============================================
window.fnRemoveTab = function(id_tab) {
  try {
    if (!id_tab) return false;
    
    if (document.querySelector('#U_' + id_tab)) {
      document.querySelector('#U_' + id_tab).clearData({
        since: 0
      }, {
        appcache: true,
        cache: true,
        cookies: true,
        fileSystems: true,
        indexedDB: true,
        localStorage: true,
        webSQL: true
      }, () => {});
      document.querySelector('#U_' + id_tab).remove();
    }
    
    if (document.querySelector('#context-auto .card-body #' + id_tab))
      document.querySelector('#context-auto .card-body #' + id_tab).remove();
  } catch(e) {
    window.fnRemoveTab(id_tab);
  }
}

console.log('SEO Automation System initialized successfully');
