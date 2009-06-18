/******************************************************************************
 * All source and examples in this project are subject to the
 * following copyright, unless specifically stated otherwise
 * in the file itself:
 *
 * Copyright (c) 2007, Metaweb Technologies, Inc.
 * All rights reserved.
 * 
 * Redistribution and use in source and binary forms, with or without
 * modification, are permitted provided that the following conditions
 * are met:
 *     * Redistributions of source code must retain the above copyright
 *       notice, this list of conditions and the following disclaimer.
 *     * Redistributions in binary form must reproduce the above
 *       copyright notice, this list of conditions and the following
 *       disclaimer in the documentation and/or other materials provided
 *       with the distribution.
 * 
 * THIS SOFTWARE IS PROVIDED BY METAWEB TECHNOLOGIES ``AS IS'' AND ANY
 * EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE
 * IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR
 * PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL METAWEB TECHNOLOGIES BE
 * LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR
 * CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF
 * SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR PROFITS; OR
 * BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY,
 * WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING NEGLIGENCE
 * OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS SOFTWARE, EVEN
 * IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
 *****************************************************************************/
 
  
// Use existing freebase namespace
// if it exists
if (!window.freebase)
    window.freebase = {};

if (!window.freebase.controls)
    window.freebase.controls = {};

(function($, fb) {

/**
 * !!! NOTICE: This requires jQuery rev 3578 or higher !!!
 * 
 * Version 0.4
 */


/**
 * Apply the specified input control behavior to an input with the specified options
 * 
 * @param control:InputControl - @see InputControl 
 * @param options:Object - dictionary of options that overwrite control.default_options
 */
$.fn._freebaseInput = function(control, options) {
    if (!options) options = {};
    return this
        .attr("autocomplete", "off")
        .each(function() {
            control.release(this);
            var owner = this;
            $.each(["focus", "click"], function(i,n) {
               $(owner).unbind(n, control.delegate(n)).bind(n, control.delegate(n));
            });
            
            // we might be just resetting the options
            if (typeof this['fb_id'] == 'undefined')
                this.fb_id = control.counter++;
            // flush cache
            control.cache[this.fb_id] = null;
            // store options in hash
            var o = {};
            $.extend(o, control.default_options, options);
            control.option_hash[this.fb_id] = o;
            
            // If initialize option is true then start off control as managed.
            if (options.initialize) {
                control.manage(this);
            }
        });
};

/**
 * use firebug's console if it exists
 */
fb.log = fb.error = fb.debug = function() {};
if (typeof console != "undefined" && console.log && console.error) {
    fb.log = console.log;
    fb.error = console.error;
    fb.debug = console.debug;
};


/**
 * a function wrapper to be invoked within a context object (thisArg) with
 * additional parameters (argArray).
 * 
 * @param fn:Function - Function to run.
 * @param thisArg:Object - Context in which to run the function (thisArg)
 * @param argArray:Array - extra arguments to be appended to func's own arguments.
 *          So if a callback invokes func with an eventObject, func will be called
 *          with: func(arg1, arg2,..., argN, eventObject)
 */
fb.delegate = function(fn, thisArg, argArray)  {
    if (typeof argArray == "undefined") 
        argArray = [];
    var dg = function(){
        // 'arguments' isn't technically an array, so we can't just use concat
        var f_args = [];
        for(var i=0, len=arguments.length; i<len; i++)
            f_args.push(arguments[i]);
        if (arguments.callee && arguments.callee.fn)
          return (arguments.callee.fn.apply(arguments.callee.thisArg, arguments.callee.argArray.concat(f_args)));
        return undefined;
    };

    dg.thisArg = thisArg;
    dg.fn = fn;
    dg.argArray = argArray;

    return (dg);
};

fb.quote_id = function(id) {
    if (id.charAt(0) == '/')
        return id;
    else
        return ('/' + encodeURIComponent(id));
};


/**
 * simple state object
 */
fb.state = function() {};
fb.state.prototype = {
    enter: function(data) {},
    exit: function(data) {},
    handle: function(data) {}
};

/**
 * simple state machine
 */
fb.state_machine = function(states) {
    // states: [["STATE_NAME_1", state_1],...,["STATE_NAME_n", state_n]]
    this.current_state = null;
    this.states = {};
    var owner = this;
    $.each(states, function(i,n) {
        n[1].sm = owner;
        owner.states[n[0]] = n[1];
        if (i==0) 
            owner.current_state = n[0];
    });
    if (!this.current_state)
        throw "StateMachine must be initialized with at least one state";
    this.states[this.current_state].enter();
};
fb.state_machine.prototype = {    
    transition: function(to_state, exit_data, enter_data, data) { //fb.log("state_machine.transition current_state: ", this.current_state, "to_state: ", to_state);
        // to_state: the target destination state
        // exit_data: the exit data for current state
        // enter_data: the enter data for to_state
        // data: the data for to_state.handle
        var target = this.states[to_state];
        if (!target) 
            throw("Unrecongized state:" + to_state);
        
        var source = this.states[this.current_state];
        
        // exit current state
        source.exit(exit_data);
        
        // enter target state
        target.enter(enter_data);
        
        this.current_state = to_state;
        
        // handle data
        this.handle(data);
    },
    handle: function(data) {
        if (data) 
            this.states[this.current_state].handle(data);
    }
};


/**
 * InputControl class
 */
fb.InputControl = function() {
    this.default_options = {};
    this.counter = 0;
    this.cache = {};
    this.option_hash = {};
    this.sm = null;
    this.delegates = {};
    this.dropdown_delay = 30;
    this.manage_delay = 20;
    this.release_delay = 10;
};

fb.InputControl.prototype = {
    /**
     * facility to reuse delegate functions with different arguments
     */
    delegate: function(fname, argArray) {
        if (!this.delegates[fname])
            this.delegates[fname] = fb.delegate(this[fname], this);
        this.delegates[fname].argArray = argArray ? argArray : [];
        return this.delegates[fname];
    },
    
    options: function(input) {//fb.log("this.options", input);
        var o = this.option_hash[input.fb_id];
        if (!o) 
            throw "Unknown input";
        return o;
    },
    
    transition: function(state) {
        if (this.sm)
            this.sm.transition(state);
    },
    
    handle: function(data) {
        if (this.sm)
            this.sm.handle(data);  
    },
    
    /**
     * get input value, if null, return empty string ("")
     */
    val: function(input) {
        var v = $(input).val();
        if (v == null) 
            return "";
        return $.trim(v);
    },
    
    /**
     * get "name" or "text" field of an object. if none return "unknown"
     */
    name: function(obj) {
        // backwards compatibility with data.text and data.name
        if (obj.text != null)
            return obj.text;
        if (obj.name != null)
            return obj.name;
        return "unknown";
    },
    
    /**
     * text change delay variable to length of string
     */
    delay: function(l) {
        var t = .3;
        if (l > 0)
            t = 1/(6 * (l-0.7)) + .3;
        return t * 1000;
    },   
    
    manage: function(input) {
        this.release(input);
        var owner = this;
        $.each(["blur", "keydown", "keypress", "keyup", "input", "paste"], function(i,n) {
           $(input).bind(n, owner.delegate(n));
        });
        this.transition("start");
        //this.handle({id:"TEXTCHANGE", input:input});
        this.manage_hook(input);
    },
    
    // over-ride to handle manage
    manage_hook: function(input) {},
    
    release: function(input) {//fb.log("release", input);
        var owner = this;
        $.each(["blur", "keydown", "keypress", "keyup", "input", "paste"], function(i,n) {
           $(input).unbind(n, owner.delegate(n)); 
        });
        
        this.transition("start");
        this.release_hook(input);
    },
    
    // over-ride to handle release
    release_hook: function(input) {},
    
    destroy: function(input) {
        //Clear all timeouts
        window.clearTimeout(this.manage_timeout);
        window.clearTimeout(this.release_timeout);
        window.clearTimeout(this.textchange_timeout);
        window.clearTimeout(this.loadmsg_timeout);
        
        //Clear all event binding
        var owner = this;
        $.each(["focus", "click"], function(i,n) {
           $(input).unbind(n, owner.delegate(n)); 
        });
        this.release(input);
    },
    
    focus: function(e) {//fb.log("on_focus", e);
        window.clearTimeout(this.manage_timeout);
        var input = e.target;
        try {
            this.options(input);
        }
        catch(e) {
            return;
        }
        this.manage_timeout = window.setTimeout(this.delegate("manage", [input]), this.manage_delay);     
    },

    blur: function(e) {//fb.log("on_blur", e.target, this, this.dont_release, this._input); 
        window.clearTimeout(this.release_timeout);
        var input = $(e.target)[0];
        if (this.dont_release) {
            // the current input we are losing focus on
            // because we've clicked on the list/listitem
            this._input = input;
            return;
        }
        this.release_timeout = window.setTimeout(this.delegate("release", [input]), this.release_delay);
    },

    keydown: function(e) {//fb.log("on_keydown", e.keyCode);
        switch(e.keyCode) {      
          case  9: // tab       
             this.tab(e);
             break;                
          case 38: // up
          case 40: // down
             // prevents cursor/caret from moving (in Safari)
             e.preventDefault();
             break;    
          default:
             break;
        }
    },

    keypress: function(e) {//fb.log("on_keypress", e.keyCode);
        switch(e.keyCode) {         
          case 38: // up
          case 40: // down
             // prevents cursor/caret from moving
             if (!e.shiftKey)
                 e.preventDefault();
             break;
          case 13: // return
                this.enterkey(e);
            break ;
            case 27: // escape
                this.escapekey(e);
                break;
          default:
             break;
        } 
    },

    keyup: function(e) {//fb.log("on_keyup", e.keyCode);
        switch(e.keyCode) {
            case 38: // up
                e.preventDefault();
                this.uparrow(e);
                break;
            case 40: // down
                e.preventDefault();
                this.downarrow(e);
                break;
            case  9: // tab       
            case 13: // enter
            case 16: // ctrl
            case 17: // shift
            case 18: // option/alt
            case 27: // escape
            case 37: // left
            case 39: // right
            case 224:// apple/command
                break;
            default:
                this.textchange(e);
                break;
        } 
    },
    
    click: function(e) {
        //Override this to handle mouseclicks
    },
    
    // Mozilla only, to detech paste
    input: function(e) {//fb.log("on_input", e);
        this.textchange(e);
    },
    
    // IE only, to detect paste
    paste: function(e) {//fb.log("on_paste", e);
        this.textchange(e);
    },
    
    uparrow: function(e) {
        this.handle({id:"UPARROW", input:e.target});    
    },
    
    downarrow: function(e) {
        this.handle({id:"DOWNARROW", input:e.target});
    },
    
    tab: function(e) {
        this.handle({id:"TAB", input:e.target, domEvent:e});
    },
    
    enterkey: function(e) {
        if(e.shiftKey) {
            this.handle({id:"ENTERKEY-SHIFT", input:e.target, domEvent:e});
        } else {
            this.handle({id:"ENTERKEY", input:e.target, domEvent:e});
        }
    },
    
    escapekey: function(e) {
        this.handle({id:"ESCAPEKEY", input:e.target});
    },
    
    textchange: function(e) {//fb.log("on_textchange", e.target);
        window.clearTimeout(this.textchange_timeout);
        // Save inputted text
        this.input_text = this.val(e.target);
        var delay = this.delay(this.input_text.length);
        this.textchange_timeout = window.setTimeout(this.delegate("textchange_delay", [e.target]), delay);
    },
    
    textchange_delay: function(input){//fb.log("on_textchange_delay", input);
        this.handle({id:"TEXTCHANGE", input:input});
    }
};

/**
 * InputSelectControl class
 * superClass: InputControl
 */
fb.InputSelectControl = function() {
    fb.InputControl.call(this);
    this.min_len = 1;
    this.should_filter = true;
    this.fudge = 8;
    this.loadmsg_delay = 50;
    
    /**
     * initialize the select state machine
     * 
     * states:
     *      start: 
     *      getting:
     *      selecting:
     */
    this.sm = new fb.state_machine([
        ["start", new state_start(this)],
        ["getting", new state_getting(this)],
        ["selecting", new state_selecting(this)]
    ]);
};
// inheritance: prototype/constructor chaining
fb.InputSelectControl.prototype = new fb.InputControl();
fb.InputSelectControl.prototype.constructor = fb.InputSelectControl;

// shorthand for fb.InputSelectControl.prototype
var p = fb.InputSelectControl.prototype;

p.get_list = function(){
    return $("#fbs_list > .fbs-bottomshadow > .fbs-ul")[0];
};

p.get_list_items = function(){
    return $(this.get_list()).children("li");
};

p.release_hook = function(input) {
    this.list_hide();
};

p.click_listitem = function(li) {//fb.log("click_listitem", li, this._input);
    this.handle({id:"LISTITEM_CLICK", item:li, input:this._input});
};

p.mousedown_list = function(e) {//fb.log("mousedown_list", e, this);
    // hack in IE/safari to keep suggestion list from disappearing when click/scrolling
    this.dont_release = true;    
};

p.mouseup_list = function(e) {//fb.log("mouseup_list", e, this, this._input);
    // hack in IE/safari to keep suggestion list from disappearing when click/scrolling
    if (this._input) {
        $(this._input).unbind("focus", this.delegate("focus")); 
        $(this._input).focus();
        window.setTimeout(this.delegate("reset_focus", [this._input]), 0);
        //$(this._input).focus(this.delegate("focus"));
    }
    this.dont_release = false;
};

p.reset_focus = function(input) {
    $(input).focus(this.delegate("focus"));
};

p.list_load = function(input) {//fb.log("list_load", input);
    throw "You must override InputSelectControl.prototype.list_load";
};

p.list_receive = function(input, txt, o) {//fb.log("list_receive", input, query, o);
    // handle errors
    if (o.status !== '200 OK') {
        fb.error("list_receive", o.code, o.messages, o);
        return;
    }
    
    // currently, list_receive recognizes results of the forms:
    // 1. { list: { listItems: [...] } }
    // 2. { results: [...] }
    // 3. { result: [...] }
    // 4. { query: { result: [...] } }
    var result = [];
    if ("list" in o && "listItems" in o.list)
        result = o.list.listItems;
    else if ("result" in o)
        result = o.result;
    else if ("results" in o)
        result = o.results;
    else if ("query" in o && "result" in o.query) 
        result = o.query.result;
    else {
        fb.error("list_receive", o.code, "Unrecognized list result", o);
        return;
    }
    
    // hook to update cache
    this.list_receive_hook(input, txt, result);
    
    // handle result    
    this.handle({id:"LIST_RESULT", input:input, result:result});
};

p.list_receive_hook = function(input, txt, result) { 
    // overwrite to process search result
    // like updating the cache
};

p.position = function(element, input) {
    var options = this.options(input);
    var pos = $(input).offset({border: true, padding: true});
    var left = pos.left;
    var top = pos.top + input.clientHeight + this.fudge;
    
    var right = pos.left + options.width;
    var window_right = $(window).width() + document.body.scrollLeft;
    
    // If the right edge of the dropdown extends beyond the right
    //   of the screen then right-justify the dropdown to the input.
    if (right > window_right && options.width > $(input).outerWidth()) {
        left = left - (options.width - $(input).outerWidth()) + 4;
    }
    $(element)
        .css({top:top, left:left, width:options.width})
        .show();
}

p.list_show = function(input, result) {//fb.log("list_show", input, result);
    if (!input) 
        return;
    if (!result) 
        result = [];
    var options = this.options(input);  
    var txt = this.val(input);
    var list = null;
    if (!$("#fbs_list").length) {
        $(document.body)
            .append(
                '<div style="display:none;position:absolute" id="fbs_list" class="fbs-topshadow">' +
                    '<div class="fbs-bottomshadow">'+
                        '<ul class="fbs-ul"></ul>' +
                    '</div>' +
                '</div>');
        
        list = $("> .fbs-ul")[0];
    }
    if (!list) 
        list = this.get_list();    
    
    $("#fbs_list > .fbs-bottomshadow")
        .unbind()
        .mousedown(this.delegate("mousedown_list"))
        .mouseup(this.delegate("mouseup_list"))
        .scroll(this.delegate("mousedown_list"));
    
    
    // unbind all li events and empty list
    $("li", list)
        .each(function() {
            $(this).unbind();
            this.fb_data = null; // clean up expando variable "fb_data"
        });
    $(list).empty();
    
    var filter = this.filter;
    if (typeof options.filter == "function")
        filter = options.filter;
    
    if (!result.length)
        $(list).append(this.create_list_item({id:"NO_MATCHES", text:"no matches"}, null, options).addClass("fbs-li-nomatch"));
    
    var filtered = [];
    if(this.should_filter) {
        $.each(result, function(i, n) {
            if (filter.apply(null, [n, txt]))
                filtered.push(n);
        });
        filtered = this.filter_hook(filtered, result);
    } else {
        filtered = result;
    }
    var owner = this;    
    $.each(filtered, function(i, n) {
        $(list).append(owner.create_list_item(n, txt, options, i));
    });
    
    // hook to add additional html elemments and handlers
    // like "Create New" item under the list
    this.list_show_hook(list, input, options);
    
    this.position($("#fbs_list"), input);
};

p.list_show_hook = function(list, input, options) { };

p.filter_hook = function(filtered, result) {
    return filtered;
};

p.list_hide = function() {//fb.log("list_hide");
    $("#fbs_list").hide();
    this.list_hide_hook();
};

p.list_hide_hook = function() {};

p.create_list_item = function(data, txt, options, index) {
    var li = $("<li class='fbs-li'></li>")[0];
    
    var trans = this.transform;
    if (typeof options.transform == "function")
        trans = options.transform;
    
    var html = trans.apply(this, [data, txt]);
   
    $(li).append(html);
    
    data.index = index;
    
    // sometimes data contains text and/or name
    if ("text" in data)
        data.name = data.text;
    
    li.fb_data = data;
    
    var owner = this;
    return $(li)
        .mouseover(function(e) { 
            owner.list_select(null, this, options); 
        })
        .click(function(e) { 
            owner.click_listitem(this);
        });
};

/**
 * The default filter
 * 
 * @param data - The individual item from the ac_path service.
 * @return TRUE to include in list or FALSE to exclude from list.
 */
p.filter = function(data, txt) {
    return true;
};

/**
 * The default transform
 * 
 * @param data - The individual item from the ac_path service
 * @param txt - The input string
 * @param options - Options used for the input
 * @return a DOM element or html that will be appended to an <li/>
 */
p.transform = function(data, txt) {
    return data;
};

/**
 * show loading message
 */
p.loading_show = function(input) {
    this.list_hide();
    if (!$("#fbs_loading").length) {
        $(document.body)
            .append(
                '<div style="display:none;position:absolute" id="fbs_loading" class="fbs-topshadow">' +
                    '<div class="fbs-bottomshadow">'+
                        '<ul class="fbs-ul">' +
                            '<li class="fbs-li">'+ 
                                '<div class="fbs-li-name">loading...</div>' +
                            '</li>' +
                        '</ul>' +
                    '</div>' +
                '</div>');        
    }
    this.position($("#fbs_loading"), input);
};

/**
 * hide loading message
 */
p.loading_hide = function() {
    $("#fbs_loading").hide();
};

p.list_select = function(index, li, options) {
    var sli = null;
    this.get_list_items().each(function(i,n) {
        if (i == index || li == n) {
            $(n).addClass("fbs-li-selected");
            sli = n;
        }
        else 
            $(n).removeClass("fbs-li-selected");
    });
    this.list_select_hook(sli, options);
    return sli;
};

/**
 * list select hook
 * @param sli - list item (li) html element
 */
p.list_select_hook = function(sli, options) { };

p.list_length = function() {
    return this.get_list_items().length;
};

p.list_selection = function(returnObj) {
    if (!returnObj) 
        returnObj = {};
    returnObj.index = -1;
    returnObj.item = null;
    this.get_list_items().each(function(i,n){
        if (n.className.indexOf("fbs-li-selected") != -1) {
            returnObj.index = i;
            returnObj.item = n;
            return false;
        }
    });
    return returnObj;
}

p.list_select_next = function(options, data) {
    var len = this.list_length();
    var obj = this.list_selection();
    var index = obj.index+1;
    if (index >=0 && index < len){
        var sel = this.list_select(index, null, options);
        // Change input value to reflect selected item
        var txt = $(".fbs-li-name", sel).text();
        $(data.input).val(txt);
        return sel
    } else if (options.soft) {
        // Since no item is currently selected,
        //   change input value to reflect previously inputted text
        $(data.input).val(this.input_text);
        return this.list_select(null, null, options);
    } else if (len > 0) {
        return this.list_select(0, null, options);
    }
    return null;
};

p.list_select_prev = function(options, data) {
    var len = this.list_length();
    var obj = this.list_selection();
    var index = obj.index-1;
    if (index >=0 && index < len) {
        var sel = this.list_select(index, null, options);
        // Change input value to reflect selected item
        var txt = $(".fbs-li-name", sel).text();
        $(data.input).val(txt);
        return sel
    } else if (options.soft) {
        if (index < -1 && len > 0) {
            return this.list_select(len - 1, null, options);
        } else {
            // Since no item is currently selected,
            //   change input value to reflect previously inputted text
            $(data.input).val(this.input_text);
            return this.list_select(null, null, options);
        }
    } else if (len > 0)
        return this.list_select(len - 1, null, options);
    return null;
};

p.scroll_into_view = function(elt, p) {
    if (!elt)
        return;
    if (!p)
        p = elt.parentNode;
    if (!p) {
        elt.scrollIntoView(false);
        return;
    }

    if (elt.offsetTop < p.scrollTop) {
        p.scrollTop = elt.offsetTop;
        return;
    }
    
    var elt_h = $(elt).height();
    var p_h = $(p).height();
    if ((elt.offsetTop + elt_h) > (p.scrollTop + p_h)) {
        p.scrollTop = elt.offsetTop + elt_h - p_h;
    }
};

/**
 * emphasize part of the html text with <em/>
 */
p.em_text = function(text, em_str) {
    var em = text;
    var index = text.toLowerCase().indexOf(em_str.toLowerCase());
    if (index >= 0) {    
        em = text.substring(0, index) + 
        '<em class="fbs-em">' +
        text.substring(index, index+em_str.length) +
        '</em>' +
        text.substring(index + em_str.length);
    }
    return em;
};

p.caret_last = function(input) {
    var l = this.val(input).length;
    if (input.createTextRange) {
        // IE
        var range = input.createTextRange();;
        range.collapse(true);
        range.moveEnd("character", l);
        range.moveStart("character", l);
        range.select();
    }
    else if (input.setSelectionRange) {
        // mozilla
        input.setSelectionRange(l, l);
    }
};

/**
 * base class for all select states
 * @param c:InputSelectControl
 */
function select_state(c) {
    fb.state.call(this);
    this.c = c;
};
// inheritance: prototype/constructor chaining
select_state.prototype = new fb.state();
select_state.prototype.constructor = select_state;

/**
 * state: start
 */
function state_start(c) {
    select_state.call(this, c);
};
// inheritance: prototype/constructor chaining
state_start.prototype = new select_state();
state_start.prototype.constructor = state_start;

state_start.prototype.handle = function(data) {//fb.log("state_start.handle", data);
    if (!data || !data.input) 
        return;
    var options = this.c.options(data.input);
    switch (data.id) {
        case "TEXTCHANGE":
        case "DOWNARROW":
            var txt = this.c.val(data.input);
            if (txt.length >= this.c.min_len)
                this.sm.transition("getting", null, data);
            else 
                this.c.list_hide();
            break;
        case "DROPDOWN":
            this.sm.transition("getting", null, data);
            break;
        case "ENTERKEY":
            $(data.input).trigger("fb-noselect", [data]);
            this.sm.transition("start");
            window.clearTimeout(this.c.textchange_timeout);
            break;
        case "ENTERKEY-SHIFT":
            data.domEvent.preventDefault();
            break;
        default:
            break;
    };
};

/**
 * state: getting
 */
function state_getting(c) {
    select_state.call(this, c);
};
// inheritance: prototype/constructor chaining
state_getting.prototype = new select_state();
state_getting.prototype.constructor = state_getting;

state_getting.prototype.enter = function(data) {//fb.log("state_getting.enter", data);
    window.clearTimeout(this.c.loadmsg_timeout);
    if (!data || !data.input) 
        return;
    // show loading msg
    this.c.loadmsg_timeout = window.setTimeout(this.c.delegate("loading_show", [data.input]), this.c.loadmsg_delay);
    // request autocomplete url
    this.c.list_load(data.input);
};
state_getting.prototype.exit = function(data) {//fb.log("state_getting.exit", data); 
    // hide loading msg
    window.clearTimeout(this.c.loadmsg_timeout);
    this.c.loading_hide();
};
state_getting.prototype.handle = function(data) {//fb.log("state_getting.handle", data);
    if (!data || !data.input) 
        return;
    var options = this.c.options(data.input);    
    switch (data.id) {
        case "TEXTCHANGE":
            this.sm.transition("start", null, null, data);
            break;
        case "LIST_RESULT":
            this.sm.transition("selecting", null, data);
            break;
        case "ENTERKEY":
            $(data.input).trigger("fb-noselect", [data]);
            this.c.list_hide();
            this.sm.transition("start");
            window.clearTimeout(this.c.textchange_timeout);
            break;
        case "ENTERKEY-SHIFT":
            data.domEvent.preventDefault();       
            break;
        case "ESCAPEKEY":
            this.c.list_hide();
            this.sm.transition("start");
            break;            
        default:
            break;
    };
};

/**
 * state: selecting
 */
function state_selecting(c) {
    select_state.call(this, c);
};
// inheritance: prototype/constructor chaining
state_selecting.prototype = new select_state();
state_selecting.prototype.constructor = state_selecting;

state_selecting.prototype.enter = function(data) {//fb.log("state_selecting.enter", data);    
    if (!data || !data.input || !data.result) 
        return;
    this.c.list_show(data.input, data.result);
    var options = this.c.options(data.input);
    if (!options.soft)
        this.c.list_select(0, null, options);
};
state_selecting.prototype.exit = function(data) {//fb.log("state_selecting.exit", data);    
    this.c.list_select(null);
};
state_selecting.prototype.handle = function(data) {//fb.log("state_selecting.handle", data);
    if (!data || !data.input) 
        return;    
    var options = this.c.options(data.input);
    switch (data.id) {
        case "TEXTCHANGE":
            this.c.should_filter = true;
            this.sm.transition("start", null, null, data);
            break;
        case "DOWNARROW":
            $("#fbs_list").show();
            var li = this.c.list_select_next(options, data);
            this.c.scroll_into_view(li);
            break;
        case "UPARROW":
            $("#fbs_list").show();
            var li = this.c.list_select_prev(options, data);
            this.c.scroll_into_view(li);
            break;
        case "DROPDOWN":
            if(this.c.val(data.input) == "") {
                this.sm.transition("start");
                this.c.list_hide();
            } else {
                this.sm.transition("getting", null, data);
                this.c.should_filter = !this.c.should_filter;
            }
            break;
        case "TAB":
            var s = this.c.list_selection();
            if (s.index == -1 || !s.item) {
                $(data.input).trigger("fb-noselect", [data]);
                return;
            }               
            this.listitem_select(data.input, s.item);
            break;
        case "ENTERKEY-SHIFT":
            // Create new topic if user is holding shift while hitting enter
            this.c.create_new(data.input);
            data.domEvent.preventDefault();
            break;
        case "ENTERKEY":
            var s = this.c.list_selection();
            if (s.index == -1 || !s.item) {
                $(data.input).trigger("fb-noselect", [data]);
                return;
            }
            if ($("#fbs_list").css("display") != "none"){
                data.domEvent.preventDefault();
            } else {
                $(data.input).trigger("fb-submit", [s.item.fb_data]);
                return;   
            }          
            this.listitem_select(data.input, s.item);            
            break;
        case "LISTITEM_CLICK":
            this.listitem_select(data.input, data.item);
            break;
        case "ESCAPEKEY":
            this.c.list_hide();
            this.sm.transition("start");
            break;
        default:
            break;
    };
};

state_selecting.prototype.listitem_select = function(input, item) {
    if (!item) 
        return;
    switch(item.fb_data.id) {
        case "NO_MATCHES":
            break;
        default:
            var txt = $(".fbs-li-name", item).text();
            $(input).val(txt);
            this.c.caret_last(input);
            $(input).trigger("fb-select", [item.fb_data])
                .trigger("suggest", [item.fb_data]); // legacy - for compatibility
            this.c.list_hide();
            break;
    }
};


function use_jsonp(options) {
    // if we're on the same host, then we don't need to use jsonp. This
    // greatly increases our cachability
    if (!options.service_url)
        return false;             // no host == same host == no jsonp
    var pathname_len = window.location.pathname.length;
    var hostname = window.location.href;
    var hostname = hostname.substr(0, hostname.length - pathname_len);
    //console.log("Hostname = ", hostname);
    if (hostname == options.service_url)
        return false;
    
    return true;
}
/**
 * freebaseSuggest() provides a way to attach Freebase suggestion behavior to a
 * text input using the Freebase.com autocomplete service.
 * 
 * freebaseSuggest accepts a single argument which is an options Object with
 * the following attributes:
 *
 * width:       This is the width of the suggestion list and the flyout in
 *              pixels. Default is 275.
 * 
 * soft:        Soft suggestion. If true, DO NOT auto-select first item
 *              in the suggestion list. Otherwise, select first item. 
 *              Default is false.
 * 
 * suggest_new:  To enable a suggest new option, set text to a non-null string.
 *              This is the string displayed for the suggest new option
 *              (eg, "Create new topic"). Default is null.
 * 
 * flyout:      To enable flyout to show additional information for the 
 *              currently highlighted item including a thumbnail and blurb.
 *              Default is true.
 * 
 * service_url: This the base url to all the api services like autocomplete,
 *              blurbs and thumbnails. Default is "http://www.freebase.com".
 * 
 * ac_path:     The path to the autcomplete service. Default is "/api/service/search".
 * 
 * ac_param:    A dicionary of query parameters to the autocomplete service. 
 *              Currently, the supported parameters are 
 *              query (required) - the string to do an auto-complete on. See ac_qstr
 *              type  (optional) - type of items to match for (ie, "/film/film")
 *              limit (optional) - the maximum number of results to return, default is 20
 *              start (optional) - offset from which to start returning results, default is 0
 * 
 * ac_qstr:     This is the parameter name to be passed to the autocomplete
 *              service for the string to autocomplete on. The value will
 *              be what the user typed in the input. Default is "prefix".
 * 
 * blurb_path:  The path to the blurb service for the description to be shown
 *              in the flyout. Default is "/api/trans/blurb".
 * 
 * blurb_param: The query parameters to the blurb service.
 *              Default is { maxlength: 300 }.
 * 
 * thumbnail_path:  The path to the thumbnail service to be shown in the flyout. 
 *                  Default is "/api/trans/image_thumb".
 * 
 * thumbnail_param: The query paramters to the thumbnail service.
 *                  Default is {maxwidth:70, maxheight: 70}.
 * 
 * filter:      Specify a filter function if you want to filter any of the items
 *              returned by ac_path service. The function is called with one
 *              arugment representing an item from the ac_path result. The function
 *              should return TRUE to include the item or FALSE to exclude. 
 *              Default is a function that returns TRUE.
 * 
 * transform:   Specify a transform function if you want to transform the default
 *              display of the suggest list item.
 * 
 * initialize:  Set to true for control to be managed from the start. Use when you know
 *              that the control started with the focus. (Default: false)
 * 
 * In addition, freebaseSuggest will trigger the following events on behalf of
 * the input it's attached to. They include:
 * 
 * fb-select:       Triggered when something is selected from the suggestion
 *                  list. The data object will contain id and name fields:
 *                  { id: aString, name: aString }.
 * 
 * fb-select-new:   Triggered when the suggest_new option is selected. 
 *                  The data object will only contain a name field: { name: aString }.
 *
 * fb-noselect:   Triggered when the user performs a select action without highlighting an entry.
 * 
 *
 * @example
 * $('#myInput')
 *      .freebaseSuggest()
 *      .bind('fb-select', function(e, data) { console.log('suggest: ', data.id); })
 * 
 * @desc Attach Freebase suggestion behavior to #myInput with default options and on
 *          'suggest', output the selected id the console.
 *
 *
 * @example
 * var options = {
 *      soft: true,
 *      suggest_new: 'Create new Film',
 *      ac_param: {
 *          type: '/film/film',
 *          category: 'instance',
 *          disamb: '1', 
 *          limit: '10'
 *      }
 * };
 * $('#myInput')
 *      .freebaseSuggest(options)
 *      .bind('fb-select', function(e, data) { console.log('suggest: ', data.id); })
 *      .bind('fb-select-new', function(e, data) { console.log('suggest new: ', data.name); });
 * 
 * @desc Soft suggestion on instances of '/film/film' with a suggest new option and
 *          output the various events to the console.
 *
 * @name   freebaseSuggest
 * @param  options  object literal containing options which control the suggestion behavior
 * @return jQuery
 * @cat    Plugins/Freebase
 * @type   jQuery
 */
$.fn.freebaseSuggest = function(action, options) {
    if ((typeof action == "undefined" || typeof action == 'object') && options == null) {
        // Only passed options so assume activation
        options = action;
        action = "activate";
    }
    
    if (action == 'activate') {
        $(this)._freebaseInput(fb.suggest.getInstance(), options);
    } else if (action == 'destroy') {
        fb.suggest.getInstance().destroy(this);
    }
    
    return $(this);
};

/**
 * SuggestControl class
 * superClass: InputSelectControl
 */
function SuggestControl() { 
    fb.InputSelectControl.call(this);
    this.default_options = {
        width: 275,   // width of list and flyout
        soft: true,  // if true, DO NOT auto-select first item, otherwise select first item by default
        suggest_new: null, // to show suggest new option, set text to something (eg, "Create new topic")
        flyout: true,  // show flyout on the side of highlighted item
        service_url: "http://www.freebase.com",
        ac_path: "/api/service/search",
        ac_param: {
            type: "/common/topic",
            start: 0,
            limit: 20
        },
        ac_qstr: "prefix",  // this will be added to the ac_param ...&prefix=str
        blurb_path: "/api/trans/blurb",
        blurb_param: {
            maxlength: 300
        },
        thumbnail_path: "/api/trans/image_thumb",
        thumbnail_param: {maxwidth: 70, maxheight: 70},
        filter: null,
        transform: null,
        initialize: false
    }; 
};
// inheritance: prototype/constructor chaining
SuggestControl.prototype = new fb.InputSelectControl();
SuggestControl.prototype.constructor = SuggestControl;

SuggestControl.instance = null;
SuggestControl.getInstance = function() {
    if (!SuggestControl.instance)
        SuggestControl.instance = new SuggestControl();
    return SuggestControl.instance;
};

// shorthand for SuggestControl.prototype
var p = SuggestControl.prototype;

p.list_load = function(input) {//fb.log("list_load", input);
    if (!input) 
        return;
    if (!"fb_id" in input) 
        return;
    var txt = this.val(input);
    if (!txt.length) 
        return;  
    if (!this.cache[input.fb_id]) 
        this.cache[input.fb_id] = {};
    if (txt in this.cache[input.fb_id]) {
        //fb.log("load from cache: ", txt);
        window.clearTimeout(this.handle_timeout);
        this.handle_timeout = window.setTimeout(this.delegate("handle", [{id:"LIST_RESULT", input:input, result:this.cache[input.fb_id][txt]}]), 0);
        return;
    }
    var options = this.options(input);
    var txt = this.val(input);
    var param = options.ac_param;
    //TODO: remove star and change ac_qstr when search gets the same params as autocomplete
    param[options.ac_qstr] = txt; // + '*'; // the search api needs a '*' to perform auto-complete rather than search.
                                  // dae: no longer needed if you use the "prefix" parameter
    $.ajax({
        type: "GET",
    url: options.service_url + options.ac_path,
    data: param,
    success: this.delegate("list_receive", [input, txt]),
    dataType: use_jsonp(options) ? "jsonp": "json",
    cache: true
  });
};

p.list_receive_hook = function(input, txt, result) {
    // update cache
    if (!this.cache[input.fb_id])
        this.cache[input.fb_id] = {};
    this.cache[input.fb_id][txt] = result;
};

/**
 * add select new option below the select list
 * and attach mouseover, mouseout, and click handlers
 */
p.list_show_hook = function(list, input, options) {    
    if (!$(list).next(".fbs-selectnew").length)
        $(list).after('<div style="display: none;" class="fbs-selectnew"></div>');
    var suggest_new = $(list).next(".fbs-selectnew");
    if (options.suggest_new) {
        var owner = this;
        // Create description, button and shortcut text
        $(suggest_new)
            .unbind()
            .empty()
            .append('<div class="fbs-selectnew-description">Your item not in the list?</div><button type="submit" class="fbs-selectnew-button"></button><span class="fbs-selectnew-shortcut">(Shift+Enter)</span>')
            .mouseover(function(e) {
                owner.list_select(null);
                owner.flyout_hide();   
            });
        
        // Create and title create new button
        var suggest_new_button = suggest_new.find(".fbs-selectnew-button").eq(0);
        $(suggest_new_button)
            .unbind()
            .empty()
            .append(options.suggest_new)
            .click(function(e) {
                owner.create_new(input);
            });
        
        // Display create new box
        suggest_new.show();
    }
    else
        $(suggest_new).unbind().hide();
};

p.list_hide_hook = function() {
    this.flyout_hide();
};

p.list_select_hook = function(sli, options) {
    this.flyout_hide();
    if (sli && options && options.flyout && sli.fb_data && sli.fb_data.id != "NO_MATCHES")
        this.flyout(sli, options);  
};

p.create_new = function(input){
    $(input).trigger("fb-select-new", [{name:this.val(input)}])
        .trigger("suggest-new", [{name:this.val(input)}]); // legacy - for compatibility
    this.list_hide();
    this.transition("start");
}

p.transform = function(data, txt) {
    var owner = this;
    var types = [];
    if (data.type)
        $.each(data.type, function(i,n){
            if (n.id != '/common/topic')
                types.push(owner.name(n));
        });
    types = types.join(", ");
    
    var domains = [];
    if (data.domain)
        $.each(data.domain, function(i,n){
            domains.push(owner.name(n));
        });
    domains = domains.join(", ");
    
    var aliases = [];
    if (data.alias)
        $.each(data.alias, function(i,n){
            aliases.push(n);
        });
    aliases = aliases.join(", ");
    
    var props = [];
    if (data.properties)
        $.each(data.properties, function(i,n){
            props.push(n);
        });
    props = props.join(", ");
    
    var div = document.createElement("div");
    $(div).append(
            '<div class="fbs-li-aliases"></div>' +
            '<div class="fbs-li-name"></div>' +
            '<div class="fbs-li-types"></div>' +
            '<div class="fbs-li-domains"></div>' +
            '<div class="fbs-li-props"></div>');
    if (aliases.length) {
        var text = $(".fbs-li-aliases", div).append(document.createTextNode("("+aliases+")")).text();
        if (txt) 
            $(".fbs-li-aliases", div).empty().append(this.em_text(text, txt));
    }
    else
        $(".fbs-li-aliases", div).remove();
     
    var text = $(".fbs-li-name", div).append(document.createTextNode(this.name(data))).text();
    if (txt) 
        $(".fbs-li-name", div).empty().append(this.em_text(text, txt));
    
    if (types.length)
        $(".fbs-li-types", div).append(document.createTextNode(types));
    else
        $(".fbs-li-types", div).remove();
    
    if (domains.length)
        $(".fbs-li-domains", div).append(document.createTextNode(domains));
    else
        $(".fbs-li-domains", div).remove();        
          
    if (props.length)
        $(".fbs-li-props", div).append(document.createTextNode(props));
    else
        $(".fbs-li-props", div).remove();
    
    return div.innerHTML;    
};

p.flyout = function(li, options) { //fb.log("flyout", li);
    this.flyout_callback = this.flyout_resources(li, options);     
};

/**
 * load flyout resources (thumbnail, blurb), don't show until
 * both thumbnail and blurb have been loaded.
 */
p.flyout_resources = function(li, options) {//fb.log("flyout_resources", li);    
    window.clearTimeout(this.flyout_resources_timeout);
    //this.handle_timeout = window.setTimeout(this.delegate("handle", [{id:"LIST_RESULT", input:input, result:this.cache[input.fb_id][txt]}]), 0);    
    this.flyout_resources_timeout = window.setTimeout(this.delegate("flyout_resources_delay", [li, options]), 100);
}

p.flyout_resources_delay = function(li, options) {
    var data = li.fb_data;
    var data_types = ["article", "image"];
    var cb = new FlyoutResourcesHandler(this, li, options);
    return cb;
};

p.flyout_hide = function() {//fb.log("flyout_hide");
    if (this.flyout_callback)
        this.flyout_callback.destroy();
    $("#fbs_flyout").hide();
};

p.flyout_show = function(li, options, img_src, blurb) {//fb.log("flyout_show", li, img_src, blurb);
    if ("none" == $("#fbs_list").css("display")) 
        return;
    var s = this.list_selection().item;
    if (!(li == s && li.fb_data.id == s.fb_data.id))
        return;
    
    if (!$("#fbs_flyout").length) {
        $(document.body)
            .append(
                '<div style="display:none;position:absolute" id="fbs_flyout" class="fbs-topshadow">' +
                    '<div class="fbs-bottomshadow">'+
                        '<div class="fbs-flyout-container">' +
                            // label
                            '<div class="fbs-flyout-name"></div>' +
                            // image
                            '<div class="fbs-flyout-image"></div>' +
                            // types
                            '<div class="fbs-flyout-types"></div>' +
                            // domains
                            '<div class="fbs-flyout-domains"></div>' +
                            // blurb
                            '<div class="fbs-flyout-blurb"></div>' +
                        '</div>' +                                              
                    '</div>' +
                '</div>');   
    }
    
    $("#fbs_flyout .fbs-flyout-name").empty().append('<a href="' + this.freebase_url(li.fb_data.id, options) + '">' + $(".fbs-li-name", li).text() + '</a>');
    $("#fbs_flyout .fbs-flyout-image").empty();
    if (img_src != "#")
        $("#fbs_flyout .fbs-flyout-image").append('<img src="' + img_src + '"/>');
    $("#fbs_flyout .fbs-flyout-types").empty().append($(".fbs-li-types", li).text());
    $("#fbs_flyout .fbs-flyout-domains").empty().append($(".fbs-li-domains", li).text());
    $("#fbs_flyout .fbs-flyout-blurb").empty().append(blurb);
    
    var pos = $(this.get_list()).offset();
    var left = pos.left + options.width;
    var sl = document.body.scrollLeft;
    var ww = $(window).width();
    if ((left+options.width) > (sl+ww))
        left = pos.left - options.width;
    //var pos = $(li).offset();
    $("#fbs_flyout")
        .css({top:pos.top, left:left, width:options.width})
        .show();
};

p.freebase_url = function(id, options) {
    var url = options.service_url + "/view" + fb.quote_id(id);
    return url;
};

p.release_hook = function(input){
    $(this.get_list()).next(".fbs-selectnew").remove();
    fb.InputSelectControl.prototype.release_hook.call(this, input);
};

/**
 * We don't want to show the flyout until both the article (blurb)
 * and the image have been loaded. This object is an attempt to
 * encapsulate the loading of these two flyout resources, waits for both
 * resources to load and then finally calls SuggestControl.flyout_show.
 * 
 * @param owner - SuggestControl
 * @param li - the selected list item that we are showing the flyout for
 * @param options - SuggestControl settings
 */
function FlyoutResourcesHandler(owner, li, options) {
    this.owner = owner;  
    this.li = li;
    this.options = options;
    var me = this;
    $.each(["article", "image"], function(i,n) {
        var id = li.fb_data[n];
        if (id && typeof id == 'object')
            id = id.id;
        me["load_" + n](id);
    });
    
};
FlyoutResourcesHandler.prototype = {
    load_article: function(id) {
        if (id) {
            $.ajax({
                type: "GET",
                url: this.blurb_url(id),
                data: this.options.blurb_param,
                success: fb.delegate(this.receive_article, this),
                error: fb.delegate(this.receive_article_error, this),                
                dataType: use_jsonp(this.options) ? "jsonp" : null,
                cache: true
            });
        }
        else {
            this.receive("article", "&nbsp;");
        }
    },
    receive_article: function(o) {
        if (typeof o == "object") {
            // handle errors
            if (o.status !== '200 OK') {
                fb.error("SuggestControl.blurb_receive", o.code, o.messages, o);
                return;
            }
            
            // now get the string value
            o = o.result.body;
        }
        this.receive("article", o);
    },
    receive_article_error: function() {
        this.receive("article", "Description could not be displayed");
    },    
    load_image: function(id) {
        if (id) {
            var i = new Image();
            var src = this.thumbnail_url(id);
            i.onload = fb.delegate(this.receive_image, this, [src, i]);
            i.onerror = fb.delegate(this.receive_image, this, ["#", i]);
            i.src = src;
        }
        else {
            this.receive("image", "#");   
        }
    },
    receive_image: function(src, i) {
        this.receive("image", src);
        // clean up Image.onload and onerror handlers
        i.onload = i.onerror = null;
    },
    blurb_url: function(id) {
        return this.options.service_url + this.options.blurb_path + fb.quote_id(id);
    },
    thumbnail_url: function(id) {
        var url = this.options.service_url + this.options.thumbnail_path +
            fb.quote_id(id);
        var qs = $.param(this.options.thumbnail_param);
        if (qs)
             url += "?" + qs;
        return url;
    },
    receive: function(data_type, data) {    
        if (!this.owner) return;
        this[data_type] = {data: data};
        if (this.image && this.article)
            this.owner.flyout_show(this.li, this.options, this.image.data, this.article.data);
    },
    destroy: function() {
        this.owner = this.li = this.options = this.image = this.article = null;
    }
};

fb.suggest = SuggestControl;

})(jQuery, window.freebase.controls);
