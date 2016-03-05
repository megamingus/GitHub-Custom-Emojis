// ==UserScript==
// @name         GitHub Custom Emojis
// @version      0.1.0
// @description  Add custom emojis from json source
// @namespace    https://github.com/StylishThemes
// @include      /https?://((gist)\.)?github\.com/
// @grant        GM_addStyle
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_xmlhttpRequest
// @grant        GM_info
// @run-at       document-end
// @require      https://ajax.googleapis.com/ajax/libs/jquery/2.2.0/jquery.min.js
// @require      https://greasyfork.org/scripts/16936-ichord-caret-js/code/ichord-Caretjs.js?version=106431
// @require      https://greasyfork.org/scripts/16996-ichord-at-js-mod/code/ichord-Atjs-mod.js?version=109194
// @require      https://cdnjs.cloudflare.com/ajax/libs/ion-rangeslider/2.1.2/js/ion.rangeSlider.min.js
// @updateURL    https://raw.githubusercontent.com/StylishThemes/GitHub-Custom-Emojis/master/github-custom-emojis.user.js
// @downloadURL  https://raw.githubusercontent.com/StylishThemes/GitHub-Custom-Emojis/master/github-custom-emojis.user.js
// ==/UserScript==
/* global jQuery, GM_addStyle, GM_getValue, GM_setValue, GM_xmlhttpRequest, GM_info */
/* eslint-disable indent, quotes */
(function($) {
  'use strict';

  var ghe = {

    version : GM_info.script.version,

    vars : {
      // delay until package.json allowed to load
      delay : 8.64e7, // 24 hours in milliseconds

      // base url to fetch package.json
      root : 'https://raw.githubusercontent.com/StylishThemes/GitHub-Custom-Emojis/master/',
      emojiClass : 'ghe-custom-emoji',
      emojiTemplate : ':_${name}:',
      maxEmojiZoom : 3,
      maxEmojiHeight : 150,

      // Keyboard shortcut to open panel
      keyboardOpen : 'g+=',
      keyboardDelay : 1000
    },

    regex : {
      // nodes to skip while traversing the dom
      skipElm    : /^(script|style|svg|iframe|br|meta|link|textarea|input|code|pre)$/i,
      // emoji template
      template   : /\$\{name\}/,
      // character to escape in regex
      charsToEsc : /[-\/\\^$*+?.()|[\]{}]/g
    },

    defaults : {
      activeZoom    : 1.8,
      caseSensitive : false,
      rangeHeight   : '20;40', // min;max as set by ion.rangeSlider
      insertAsImage : false,
      // emoji json sources
      sources : [
        'https://raw.githubusercontent.com/StylishThemes/GitHub-Custom-Emojis/master/collections/emoji-custom.json',
        'https://raw.githubusercontent.com/StylishThemes/GitHub-Custom-Emojis/master/collections/emoji-crazy-rabbit.json',
        'https://raw.githubusercontent.com/StylishThemes/GitHub-Custom-Emojis/master/collections/emoji-onion-head.json'
      ]
    },

    // emoji json stored here
    collections : {},

    // GitHub ajax containers
    containers : [
      '#js-pjax-container',
      '#js-repo-pjax-container',
      '.js-contribution-activity',
      '.more-repos'
    ],

    // mutant observers to disconnect after ajax load
    previewObserver : [],

    getStoredValues : function() {
      var defaults = this.defaults;
      this.settings = {
        rangeHeight   : GM_getValue('rangeHeight',   defaults.rangeHeight),
        activeZoom    : GM_getValue('activeZoom',    defaults.activeZoom),
        caseSensitive : GM_getValue('caseSensitive', defaults.caseSensitive),
        insertAsImage : GM_getValue('insertAsImage', defaults.insertAsImage),
        sources       : GM_getValue('sources',       defaults.sources),

        date          : GM_getValue('date', 0)
      };
      debug('Retrieved stored values', this.settings);
    },

    storeVal : function(key, set, $el) {
      var tmp,
        val = set[key];
      GM_setValue(key, val);
      if (typeof val === 'boolean') {
        $el.prop('checked', val);
      } else {
        $el.val(val);
      }
      // update sliders
      if ($el.hasClass('ghe-height')) {
        tmp = val.split(';');
        $el.data('ionRangeSlider').update({
          from: tmp[0],
          to: tmp[1]
        });
      } else if ($el.hasClass('ghe-zoom')) {
        $el.data('ionRangeSlider').update({
          from: val
        });
      }
    },

    setStoredValues : function(reset) {
      var $el, tmp, len, indx,
        s = ghe.settings,
        d = ghe.defaults,
        $panel = $('#ghe-settings-inner');

      ghe.busy = true;
      ghe.storeVal('caseSensitive', reset ? d : s, $panel.find('.ghe-case'));
      ghe.storeVal('insertAsImage', reset ? d : s, $panel.find('.ghe-image'));
      ghe.storeVal('activeZoom',    reset ? d : s, $panel.find('.ghe-zoom'));
      ghe.storeVal('rangeHeight',   reset ? d : s, $panel.find('.ghe-height'));

      if (reset) {
        // add defaults back into source list; but don't remove any new stuff
        len = d.sources.length;
        for (indx = 0; indx < len; indx++) {
          if (s.sources.indexOf(d.sources[indx]) < 0) {
            s.sources[s.sources.length] = d.sources[indx];
          }
        }
      }
      tmp = s.sources;
      len = tmp.length;
      GM_setValue('sources', tmp);
      for (indx = 0; indx < len; indx++) {
        if ($panel.find('.ghe-source').eq(indx).length) {
          $el = $panel
            .find('.ghe-source-input')
            .eq(indx)
            .attr('data-url', tmp[indx]);
        } else {
          $el = $(ghe.sourceHTML)
            .appendTo($panel.find('.ghe-sources'))
            .find('.ghe-source-input')
            .attr('data-url', tmp[indx]);
        }
        // only show file name when not focused
        ghe.showFileName($el);
      }
      // remove extras
      $panel.find('.ghe-source').filter(':gt(' + len + ')').remove();
      if (reset) {
        this.updateSettings();
      }

      debug((reset ? 'Resetting' : 'Saving') + ' current values & updating panel', s);
      ghe.busy = false;
    },

    updateSettings : function() {
      this.isUpdating = true;
      var settings = this.settings,
        $panel = $('#ghe-settings-inner');
      settings.rangeHeight   = $panel.find('.ghe-height').val();
      settings.activeZoom    = $panel.find('.ghe-zoom').val();
      settings.insertAsImage = $panel.find('.ghe-image').is(':checked');
      settings.caseSensitive = $panel.find('.ghe-case').is(':checked');
      settings.sources = $panel.find('.ghe-source-input').map(function(){
        return $(this).attr('data-url');
      }).get();

      debug('Updating user settings', settings);
      this.updateStyleSheet();
      this.isUpdating = false;
    },

    loadEmojiJson : function(update) {
      // only load emoji.json once a day, or after a forced update
      if (update || (new Date().getTime() > this.settings.date + this.vars.delay)) {
        var indx,
          sources = this.settings.sources,
          len = sources.length;
        for (indx = 0; indx < len; indx++) {
          this.fetchCustomEmojis(sources[indx]);
        }
        this.settings.date = new Date().getTime();
      }
    },

    fetchCustomEmojis : function(url) {
      debug('Fetching custom emoji list', url);
      GM_xmlhttpRequest({
        method : 'GET',
        url : url,
        onload : function(response) {
          var json = false;
          try {
            json = JSON.parse(response.responseText);
          } catch (err) {
            debug('Invalid JSON', url);
          }
          if (json && json[0].name) {
            // save url to make removing the entry easier
            json[0].url = url;
            ghe.collections[json[0].name] = json;
            debug('Adding "' + json[0].name + '" Emoji Collection');
          }
        }
      });
    },

    // Using: document.evaluate('//*[text()="tuzki"]', document.body, null,
    //   XPathResult.ORDERED_NODE_SNAPSHOT_TYPE, null).snapshotItem(0);
    // to find matching content as it is much faster than scanning each node
    // sometimes it misses things...
    checkPage : function(node) {
      this.isUpdating = true;
      // not sure why but document evaluate doesn't work on wiki page
      // preview tab, so we need to search the entire document
      if ($('#wiki-wrapper').length) {
        node = null;
      }
      var indx = 0,
        parts = this.vars.emojiTemplate.split('${name}'), // parts = [':_', ':']
        // adding "//" starts from document, so if node is defined, don't
        // include it so the search starts from the node
        path = (node ? '' : '//') + '*[contains(text(),"' + parts[0] + '")]',
        nodes = document.evaluate(path, node || document, null, XPathResult.ORDERED_NODE_SNAPSHOT_TYPE, null),
        len = nodes.snapshotLength;
      try {
        node = nodes.snapshotItem(indx);
        while (node && indx++ < len) {
          if (!ghe.regex.skipElm.test(node.nodeName)) {
            ghe.findEmoji(node);
          }
          node = nodes.snapshotItem(indx);
        }
      } catch (e) {
        debug('Nothing to replace!', e);
      }
      this.isUpdating = false;
    },

    findEmoji : function(node) {
      var indx, len, group, match, matchesLen,
        regex = ghe.regex.nameRegex,
        matches = [],
        emojis = this.collections,
        str = node.textContent;
      while ((match = regex.exec(str)) !== null) {
        matches[matches.length] = match[1];
      }
      if (matches && matches[0]) {
        matchesLen = matches.length;
        for (group in emojis) {
          if (emojis.hasOwnProperty(group)) {
            len = emojis[group].length;
            for (indx = 0; indx < len; indx++) {
              for (match = 0; match < matchesLen; match++) {
                if (matches[match] === emojis[group][indx].name) {
                  debug('found "' + matches[match] + '" in "' + node.textContent + '"');
                  ghe.replaceText(node, emojis[group][indx]);
                }
              }
            }
          }
        }
      }
    },

    replaceText : function(node, emoji) {
      var data, pos, imgnode, middlebit, endbit,
        isCased = this.settings.caseSensitive,
        name = this.vars.emojiTemplate.replace(ghe.regex.template, emoji.name),
        skip = 0;
      name = isCased ? name : name.toUpperCase();
      // Code modified from highlight-5 (MIT license)
      // http://johannburkard.de/blog/programming/javascript/highlight-javascript-text-higlighting-jquery-plugin.html
      if (node.nodeType === 3) {
        data = isCased ? node.data : node.data.toUpperCase();
        pos = data.indexOf(name);
        pos -= (data.substr(0, pos).length - node.data.substr(0, pos).length);
        if (pos >= 0) {
          imgnode = ghe.createEmoji(emoji);
          middlebit = node.splitText(pos);
          endbit = middlebit.splitText(name.length);
          middlebit.parentNode.replaceChild(imgnode, middlebit);
          skip = 1;
        }
      } else if (node.nodeType === 1 && node.childNodes) {
        for (var i = 0; i < node.childNodes.length; ++i) {
          i += ghe.replaceText(node.childNodes[i], emoji);
        }
      }
      return skip;
    },

    // This function does the surrounding for every matched piece of text
    // and can be customized  to do what you like
    // <img class="emoji" title=":smile:" alt=":smile:" src="x.png" height="20" width="20" align="absmiddle">
    createEmoji : function(emoji) {
      var el = document.createElement('img');
      el.src = emoji.url;
      el.className = ghe.vars.emojiClass + ' emoji';
      el.title = el.alt = ghe.vars.emojiTemplate.replace(ghe.regex.template, emoji.name);
      // el.align = 'absmiddle'; // deprecated attribute
      return el;
    },

    // used by autocomplete (atwho) filter function
    matches : function(query, labels) {
      if (query === '') {
        return 1;
      }
      var i, partial,
        count = 0,
        arry = (labels || '').split(/[\s,_]+/),
        parts = query.split(/[,_]/),
        len = parts.length;
      for (i = 0; i < len; i++) {
        // full match or partial
        partial = arry.join('_').indexOf(parts.join('_'));
        if (arry.indexOf(parts[i]) > -1 || partial > -1) {
          count++;
        }
        // give more weight to results with indexOf closer to zero
        if (partial > -1 && partial < len / 2) {
          count++;
        }
      }
      // return fraction of query matches
      return count / len;
    },

    // init when comment textarea is focused
    initAutocomplete : function($el) {
      if (!$el.data('atwho')) {
        var indx, len, name, group,
          data = [];
        // combine data
        for (name in ghe.collections) {
          if (ghe.collections.hasOwnProperty(name)) {
            group = ghe.collections[name].slice(1);
            data = data.concat(group);
          }
        }
        len = data.length;
        // alphabetic sort
        data = data.sort(function(a, b) {
          return a.name > b.name ? 1 : a.name < b.name ? -1 : 0;
        });
        // add prepend name to labels
        for (indx = 0; indx < len; indx++) {
          data[indx].labels = data[indx].name.replace(/_/g, ' ') + ' ' + data[indx].labels;
        }
        // add emoji autocomplete to comment textareas
        $el.atwho({
          at : ':_', // first two characters from emojiTemplate
          data : data,
          searchKey: 'labels',
          displayTpl : '<li><span><img src="${url}" height="30" /></span>${name}</li>',
          insertTpl : ghe.vars.emojiTemplate,
          delay : 400,
          callbacks : {
            matcher: function(flag, subtext) {
              var regexp = ghe.regex.emojiFilter,
                match = regexp.exec(subtext);
              // this next line does some magic...
              // for some reason, without it, moving the caret from "p" to "r" in
              // ":_people,fear," opens & closes the popup with each letter typed
              subtext.match(regexp);
              if (match) {
                return match[2] || match[1];
              } else {
                return null;
              }
            },
            filter: function(query, data, searchKey) {
              var i, item,
                len = data.length,
                _results = [];
              for (i = 0; i < len; i++) {
                item = data[i];
                item.atwho_order = ghe.matches(query, item[searchKey]);
                if (item.atwho_order > 0.9) {
                  _results[_results.length] = item;
                }
              }
              return query === '' ? _results : _results.sort(function(a, b) {
                // descending sort
                return b.atwho_order - a.atwho_order;
              });
            },
            sorter: function(query, items) {
              // sorted by filter
              return items;
            },
            // event parameter adding in atwho.js mod
            beforeInsert: function(value, $li, event) {
              if (event.shiftKey || ghe.settings.insertAsImage) {
                // add image tag directly if shift is held
                return '<img title="' +
                  ghe.vars.emojiTemplate.replace(ghe.regex.template, $li.text()) +
                  '" src="' + $li.find('img').attr('src') + '">';
              }
              return value;
            }
          }
        });
        // use classes from GitHub-Dark to make theme match GitHub-Dark
        $('.atwho-view').addClass('popover suggester');
      }
    },

    setupPreviews : function() {
      // Add mutant observer to previews
      var previews = document.querySelectorAll('.preview-content .comment-body');
      if (ghe.previewObserver.length) {
        // disconnect previous observers
        $.each(ghe.previewObserver, function() {
          this.disconnect();
        });
        ghe.previewObserver = [];
      }
      Array.prototype.forEach.call(previews, function(target) {
        var obs = new MutationObserver(function(mutations) {
          mutations.forEach(function(mutation) {
            // preform checks before adding code wrap to minimize function calls
            if (mutation.target === target && !ghe.isUpdating) {
              ghe.checkPage(target);
            }
          });
        });
        obs.observe(target, {
          childList : true,
          subtree : false
        });
        ghe.previewObserver[ghe.previewObserver.length] = obs;
      });
    },

    addToolbarIcon : function() {
      // add Emoji setting icons
      var indx, $el,
        $toolbars = $('.toolbar-commenting'),
        len = $toolbars.length;
      for (indx = 0; indx < len; indx++) {
        $el = $toolbars.eq(indx);
        if (!$el.find('.ghe-settings-icon').length) {
          $el.prepend([
            '<button type="button" class="ghe-settings-open toolbar-item tooltipped tooltipped-n tooltipped-multiline" aria-label="Browse collections & Set Emojis Options" tabindex="-1">',
              '<svg class="ghe-settings-icon" xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor">',
                '<path d="M7.205 3.233c0 .952-.753 1.73-1.722 1.73-.953 0-1.707-.793-1.707-1.73 0-.937.762-1.73 1.707-1.73.97 0 1.73.793 1.73 1.73h-.008zm6.904 0c0 .952-.794 1.73-1.747 1.73-.95 0-1.722-.793-1.722-1.73 0-.937.795-1.73 1.73-1.73.938 0 1.747.793 1.747 1.73h-.008zM7.204 10.1v5.19c0 1.728 6.904 1.728 6.904 0V10.1M10.642 10.1v3.46"/>',
                '<path d="M.878 8.777s3.167 1.893 8.002 1.92c4.365.02 8.135-1.92 8.135-1.92"/>',
              '</svg>',
            '</button>'
          ].join(''));
        }
      }
    },

    // dynamic stylesheet
    updateStyleSheet : function() {
      var range = this.settings.rangeHeight.split(';');
      ghe.$style.text([
        // img styling - vertically center with set height range
        '.atwho-view li img, #ghe-popup .select-menu-item img, img[alt="ghe-emoji"], .' +
          this.vars.emojiClass + ' { ' +
          'margin-bottom:.25em; vertical-align:middle; ' +
          'min-height: ' + (range[0] || 'none') + 'px;' +
          'max-height: ' + (range[1] || 'none') + 'px }',
        // click (make active) on image to zoom
        '.' + this.vars.emojiClass + ':active, a:active img[alt="ghe-emoji"] { zoom:' +
          this.settings.activeZoom + ' }'
      ].join(''));
    },

    addBindings : function() {
      var lastKey,
        $popup = $('#ghe-popup'),
        $settings = $('#ghe-settings');
      // Delegated bindings
      $('body')
        .on('click', '.ghe-settings-open', function() {
          // open all collections panel
          ghe.openCollections($(this));
          return false;
        })
        .on('click', '.ghe-collection', function() {
          // open targeted collection
          var name = $(this).attr('data-group');
          ghe.showCollection(name);
        })
        .on('click', '.ghe-emoji', function(e) {
          // click on emoji in collection to add to textarea
          ghe.addEmoji(e, $(this));
        })
        .on('click keypress keydown', function(e) {
          clearTimeout(ghe.timer);
          var panelVisible = $popup.hasClass('in') || $settings.hasClass('in'),
            openPanel = ghe.vars.keyboardOpen.split('+'),
            key = String.fromCharCode(e.which).toLowerCase();
          // press escape or click outside to close the panel
          if (panelVisible && e.which === 27 || e.type === 'click' && !$(e.target).closest('#ghe-wrapper').length) {
            ghe.closePanels();
            return;
          }
          // keydown is only needed for escape key detection
          if (e.type === 'keydown' || /(input|textarea)/i.test(document.activeElement.nodeName)) {
            return;
          }
          // shortcut keys need keypress
          if (lastKey === openPanel[0] && key === openPanel[1]) {
            if ($settings.hasClass('in')) {
              ghe.closePanels();
            } else {
              ghe.openSettings();
            }
          }
          lastKey = key;
          ghe.timer = setTimeout(function() {
            lastKey = null;
          }, ghe.vars.keyboardDelay);

          // add shortcut to help menu
          if (key === '?') {
            // table doesn't exist until user presses "?"
            setTimeout(function() {
              if (!$('.ghe-shortcut').length) {
                $('.keyboard-mappings:eq(0) tbody:eq(0)').append([
                  '<tr class="ghe-shortcut">',
                    '<td class="keys">',
                      '<kbd>' + openPanel[0] + '</kbd> <kbd>' + openPanel[1] + '</kbd>',
                    '</td>',
                    '<td>GitHub Emojis: open settings</td>',
                  '</tr>'
                ].join(''));
              }
            }, 300);
          }
        });

      // popup & settings interactions
      $('#ghe-popup .octicon-gear').on('click keyup', function(e) {
        if (e.type === 'keyup' && e.which !== 13) {
          return;
        }
        ghe.openSettings();
      });
      $('#ghe-settings, #ghe-settings-close, #ghe-settings-inner').on('click', function(e) {
        if (this.id === 'ghe-settings-inner') {
          e.stopPropagation();
        } else {
          ghe.closePanels();
        }
      });
      // ghe-checkbox added to checkboxes
      $('.ghe-checkbox').on('change', function() {
        ghe.updateSettings();
      });
      // go back - switch from single collection to showing all collections
      $('#ghe-popup .ghe-back').on('click', function(){
        $('.ghe-single-collection, .ghe-back').hide();
        $('.ghe-all-collections').show();
      });

      // add new source input
      $('#ghe-add-source').on('click', function() {
        var $panel = $('#ghe-settings-inner');
        // lets not get crazy!
        if ($panel.find('.ghe-source').length < 20) {
          $(ghe.sourceHTML).appendTo($panel.find('.ghe-sources'));
        }
        return false;
      });
      $('#ghe-refresh-sources, #ghe-restore').on('click', function() {
        // update sources from settings panel
        ghe.setStoredValues(this.id === 'ghe-restore');
        // load json files
        ghe.loadEmojiJson(true);
        return false;
      });

      // Init range slider
      $('.ghe-height')
        .val(ghe.settings.rangeHeight)
        .ionRangeSlider({
          type : 'double',
          min  : 0,
          max  : ghe.vars.maxEmojiHeight,
          onChange : function() {
            ghe.updateSettings();
          },
          force_edges : true,
          hide_min_max : true
        });
      $('.ghe-zoom')
        .val(ghe.settings.activeZoom)
        .ionRangeSlider({
          min  : 0,
          max  : ghe.vars.maxEmojiZoom,
          step : 0.1,
          onChange : function() {
            ghe.updateSettings();
          },
          force_edges : true,
          hide_min_max : true
        });

      // Remove source input - delegated binding
      $('.ghe-settings-wrapper')
        .on('click', '.ghe-remove', function(e) {
          var $wrapper = $(this).closest('.ghe-source'),
            url = $wrapper.find('.ghe-source-input').attr('data-url');
          ghe.removeSource(url);
          $wrapper.remove();
          ghe.setStoredValues();
          return false;
        })
        .on('focus blur input change', '.ghe-source-input', function(e) {
          if (ghe.busy) { return; }
          ghe.busy = true;
          var val,
            $this = $(this);
          switch (e.type) {
            case 'focus':
            case 'focusin':
              // show entire url when focused
              $this.val( $this.attr('data-url') );
              break;
            case 'blur':
            case 'focusout':
              ghe.showFileName($this);
              break;
            default:
              $this.attr('data-url', $this.val());
          }
          if (e.type === 'change' || e.which === 13) {
            val = $this.val();
            $this.attr('data-url', val);
            ghe.fetchCustomEmojis(val);
          }
          ghe.busy = false;
        });

      // initialize autocomplete that add emojis, but only on focus
      // since every comment has a hidden textarea
      $('body').on('focus', '.comment-form-textarea', function() {
        ghe.initAutocomplete($(this));
      });
    },

    showFileName : function($el) {
      var str = $el.attr('data-url'),
        v = str.substring( str.lastIndexOf('/') + 1, str.length );
      // show only the file name in the input when blurred
      // unless there is no file name
      $el.val(v === '' ? str : '...' + v);
    },

    closePanels : function() {
      $('#ghe-popup').removeClass('in');
      $('#ghe-settings').removeClass('in');
      ghe.$currentInput = null;
    },

    openSettings : function() {
      $('.modal-backdrop').click();
      $('#ghe-settings').addClass('in');
    },

    openCollections : function($el) {
      ghe.addCollections();
      var pos = $el.offset();
      $('#ghe-settings').removeClass('in');
      $('#ghe-popup')
        .addClass('in')
        .css({
          left: pos.left + 25,
          top: pos.top
        });
      ghe.$currentInput = $el.closest('.previewable-comment-form').find('.comment-form-textarea');
    },

    addCollections : function() {
      var indx, len, key, group, img,
        collections = ghe.collections,
        range = ghe.settings.rangeHeight.split(';'),
        list = [],
        items = [];
      // build collections list -
      for (key in collections) {
        if (collections.hasOwnProperty(key)) {
          list[list.length] = key;
        }
      }
      list = list.sort(function(a, b) {
        return a > b ? 1 : (a < b ? -1 : 0);
      });
      len = list.length;
      // add random image from group
      for (indx = 0; indx < len; indx++) {
        group = collections[list[indx]];
        // random image (skip first entry)
        img = Math.round(Math.random() * (group.length - 2)) + 1;
        items[items.length] = '<div class="select-menu-item js-navigation-item ghe-collection" ' +
          'data-group="' + list[indx] + '">' +
          // collection info stored in first entry
          group[0].name + ' <span class="ghe-right"><img src="' +
          group[img].url + '" title="' +
           ghe.vars.emojiTemplate.replace(ghe.regex.template, group[img].name) + '" style="' +
           'min-height:' + (range[0] || 'none') + 'px;' +
           'max-height:' + (range[1] || 'none') + 'px;">' +
           '</span></div>';
      }
      $('.ghe-single-collection, .ghe-back').hide();
      $('.ghe-all-collections').html(items.join('')).show();
    },

    showCollection : function(name) {
      var indx,
        range = ghe.settings.rangeHeight.split(';'),
        group = ghe.collections[name].sort(function(a, b) {
          return a.name > b.name ? 1 : ( a.name < b.name ? -1 : 0 );
        }),
        list = [],
        len = group.length;
      for (indx = 1; indx < len; indx++) {
        list[indx - 1] = '<div class="select-menu-item js-navigation-item ghe-emoji" ' +
          'data-name="' + group[indx].name + '">' +
          group[indx].name + '<span class="ghe-right"><img src="' +
          group[indx].url + '" style="min-height:' + (range[0] || 'none') + 'px;' +
            'max-height:' + (range[1] || 'none') + 'px"></span></div>';
      }
      $('.ghe-all-collections').hide();
      $('.ghe-single-collection').html(list.join('')).show();
      $('.ghe-back').show();
    },

    // add emoji from collection
    addEmoji : function(e, $el) {
      var val, emoji,
        name = $el.attr('data-name'),
        caretPos = ghe.$currentInput.caret('pos');
      // insert into textarea
      if (e.shiftKey || ghe.settings.insertAsImage) {
        // add image tag directly if shift is held;
        // GitHub does NOT allow class names so we are forced to use alt
        emoji = '<img alt="ghe-emoji" title="' +
          ghe.vars.emojiTemplate.replace(ghe.regex.template, name) +
          '" src="' + $el.find('img').attr('src') + '">';
      } else {
        emoji = ghe.vars.emojiTemplate.replace(ghe.regex.template, name);
      }
      val = ghe.$currentInput.val();
      ghe.$currentInput
        .val(val.slice(0, caretPos) + emoji + ' ' + val.slice(caretPos))
        .focus()
        .caret('pos', caretPos + emoji.length + 1);
      ghe.closePanels();
    },

    removeSource : function(url) {
      var indx,
        list = [],
        collections = this.collections,
        sources = this.settings.sources,
        len = sources.length;
      // remove from source
      for (indx = 0; indx < len; indx++) {
        if (sources[indx] !== url) {
          list[list.length] = sources[indx];
        }
      }
      this.settings.sources = list;
      for (indx in collections) {
        if (collections.hasOwnProperty(indx) && collections[indx][0].url === url) {
          delete collections[indx];
          debug('Removing "' + indx + '" collection', collections);
        }
      }
    },

    update : function(target) {
      this.isUpdating = true;
      this.setupPreviews();
      this.addToolbarIcon();
      // checkPage clears isUpdating flag
      this.checkPage(target);
    },

    addPanels : function() {
      /* https://github.com/ichord/At.js styles for autocomplete */
      GM_addStyle([
        // settings panel
        '#ghe-menu:hover { cursor:pointer }',
        '#ghe-settings { position:fixed; z-index:65535; top:0; bottom:0; left:0; right:0; opacity:0; visibility:hidden }',
        '#ghe-settings.in { opacity:1; visibility:visible; background:rgba(0,0,0,.5) }',
        '#ghe-settings-inner { position:fixed; left:50%; top:50%; transform:translate(-50%,-50%); width:25rem; box-shadow:0 .5rem 1rem #111; color:#c0c0c0 }',
        '#ghe-settings label { margin-left:.5rem; position:relative; top:-1px }',
        '#ghe-settings .ghe-remove { float:right; margin-top:2px; padding:4px; cursor:pointer }',
        '#ghe-settings .ghe-remove-icon { position:relative; top:3px }',
        '#ghe-settings-close { fill:#666; float:right; cursor:pointer }',
        '#ghe-settings-close:hover { fill:#ccc }',
        '#ghe-settings .ghe-settings-wrapper { max-height:60vh; overflow-y:auto; padding: 1px 10px }',
        '#ghe-settings .ghe-right, #ghe-popup .ghe-right { float:right }',
        '#ghe-settings p { line-height:25px; }',
        '#ghe-settings .checkbox input { margin-top:.35em }',
        '#ghe-settings input[type="checkbox"] { width:16px !important; height:16px !important; border-radius:3px !important }',
        '#ghe-settings .boxed-group-inner { padding:0; }',
        '#ghe-settings .ghe-footer { padding: 10px; border-top: #555 solid 1px; }',
        '#ghe-settings .ghe-min-height, #ghe-settings .ghe-max-height, .ghe-zoom { width: 5em; }',
        '#ghe-settings .ghe-source-input { width: 90%; }',
        '#ghe-settings .ghe-slider-wrapper { height:40px; }',
        '#ghe-settings .ghe-slider-wrapper label { position:relative; top:22px }',
        '#ghe-settings .ghe-range-slider, #ghe-settings .ghe-zoom-slider { position:relative; height:40px; width:250px; float:right }',

        // show emoji collections
        '#ghe-popup { display:none }',
        '#ghe-popup .ghe-content, #ghe-popup .ghe-content > div { max-height: 200px }',
        '#ghe-popup .octicon-gear { margin-left:4px }',
        '#ghe-popup .ghe-back svg { height:20px; padding:4px 14px 4px 4px }',
        '#ghe-popup .select-menu-item { font-size:1.1em; font-weight:bold; line-height:40px; padding:8px }',
        '.ghe-settings-icon, #ghe-popup.in { display:inline-block }',

        // autocomplete popup in comment
        '.atwho-view { position:absolute; top:0; left:0; display:none; margin-top:18px; background:#fff; color:#000; border:1px solid #ddd; border-radius:3px; box-shadow:0 0 5px rgba(0,0,0,.1); min-width:300px; max-width:none!important; max-height:225px; overflow:auto; z-index:11110!important }',
        '.atwho-view .navigation-focus { background:#36f; color:#fff }',
        '.atwho-view .navigation-focus small { color:#fff }',
        '.atwho-view strong { color:#36F }',
        '.atwho-view .navigation-focus strong { color:#fff; font:700 }',
        '.atwho-view ul { list-style:none; padding:0; margin:auto }',
        '.atwho-view ul li { display:block; padding:5px 10px; border-bottom:1px solid #ddd; cursor:pointer }',
        '.atwho-view li span { display:inline-block; min-width:60px; padding-right:4px }',
        '.atwho-view small { font-size:smaller; color:#777; font-weight:400 }',

        // rangeSlider
        '.irs{position:relative;display:block;-webkit-touch-callout:none;-webkit-user-select:none;-khtml-user-select:none;-moz-user-select:none;-ms-user-select:none;user-select:none}',
        '.irs-line{position:relative;display:block;overflow:hidden;outline:none !important}.irs-line-left,.irs-line-mid,.irs-line-right{position:absolute;display:block;top:0}',
        '.irs-line-left{left:0;width:9%}.irs-line-mid{left:9%;width:82%}.irs-line-right{right:0;width:9%}.irs-bar{position:absolute;display:block;left:0;width:0}.irs-bar-edge{position:absolute;display:block;top:0;left:0}',
        '.irs-shadow{position:absolute;display:none;left:0;width:0}.irs-slider{position:absolute;display:block;cursor:default;z-index:1}.irs-slider.type_last{z-index:2}.irs-min{position:absolute;display:block;left:0;cursor:default}',
        '.irs-max{position:absolute;display:block;right:0;cursor:default}.irs-from,.irs-to,.irs-single{position:absolute;display:block;top:0;left:0;cursor:default;white-space:nowrap}.irs-grid{position:absolute;display:none;bottom:0;left:0;width:100%;height:20px}',
        '.irs-with-grid .irs-grid{display:block}.irs-grid-pol{position:absolute;top:0;left:0;width:1px;height:8px;background:#000}.irs-grid-pol.small{height:4px}.irs-grid-text{position:absolute;bottom:0;left:0;white-space:nowrap;text-align:center;font-size:9px;line-height:9px;padding:0 3px;color:#000}',
        '.irs-disable-mask{position:absolute;display:block;top:0;left:-1%;width:102%;height:100%;cursor:default;background:rgba(0,0,0,0.0);z-index:2}.lt-ie9 .irs-disable-mask{background:#000;filter:alpha(opacity=0);cursor:not-allowed}.irs-disabled{opacity:0.4}',
        '.irs-hidden-input{position:absolute !important;display:block !important;top:0 !important;left:0 !important;width:0 !important;height:0 !important;font-size:0 !important;line-height:0 !important;padding:0 !important;margin:0 !important;outline:none !important;z-index:-9999 !important;background:none !important;border-style:solid !important;border-color:transparent !important}',
        '.irs-line-mid,.irs-line-left,.irs-line-right,.irs-bar,.irs-bar-edge,.irs-slider{background:url("data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAQQAAAC0BAMAAACAm0/4AAAAHlBMVEUAAADh5OlIPakuJnU8MZzh5Onh5Onlt8BIPamDg6ND+SBkAAAACnRSTlMAgMzMzHlXE4oe0nCEQQAAAMJJREFUeNrt1qENAkEQhtENkBDkCtCECiiBFjCgEXgMDVwJVEzGQ7KnZnJ5r4JP7E7+1tNJkCBBgoSqCQAAjNg+e6rbq717snt79GSHdu3J9hVGfE8nIVR4jgU+ZYHTVOBAAwAw4pROggQJEiRUTQAAYMRuSl9Rn/whN+UnFJizEiQUSijwKQucpgIHGgCAQatjy7a5tJkkBAlBQpAQJAQJQUJYYkKByQIA/6zPbSYJQUKQECQECUFCkBAkhCUmAMAvX+TSxQIIIKq9AAAAAElFTkSuQmCC") repeat-x}',
        '.irs{height:40px}.irs-with-grid{height:60px}.irs-line{height:12px;top:25px}.irs-line-left{height:12px;background-position:0 -30px}',
        '.irs-line-mid{height:12px;background-position:0 0}.irs-line-right{height:12px;background-position:100% -30px}.irs-bar{height:12px;top:25px;background-position:0 -60px}',
        '.irs-bar-edge{top:25px;height:12px;width:9px;background-position:0 -90px}.irs-shadow{height:3px;top:34px;background:#000;opacity:.25}',
        '.lt-ie9 .irs-shadow{filter:alpha(opacity=25)}.irs-slider{width:16px;height:18px;top:22px;background-position:0 -120px}',
        '.irs-slider.state_hover,.irs-slider:hover{background-position:0 -150px}.irs-min,.irs-max{color:#fff;font-size:10px;line-height:1.333;text-shadow:none;top:0;padding:1px 3px;background:#7D7E81;-moz-border-radius:4px;border-radius:4px}',
        '.irs-from,.irs-to,.irs-single{color:#fff;font-size:10px;line-height:1.333;text-shadow:none;padding:1px 5px;background:#534AA1;-moz-border-radius:4px;border-radius:4px}',
        '.irs-from:after,.irs-to:after,.irs-single:after{position:absolute;display:block;content:"";bottom:-6px;left:50%;width:0;height:0;margin-left:-3px;overflow:hidden;border:3px solid transparent;border-top-color:#534AA1}',
        '.irs-grid-pol{background:#e1e4e9}.irs-grid-text{color:#999}'
      ].join(''));

      // Settings panel markup
      $('body').append([
        '<div id="ghe-wrapper">',
          '<div id="ghe-popup" class="select-menu-modal-holder js-menu-content js-navigation-container js-active-navigation-container">',
            '<div class="select-menu-modal">',
              '<div class="select-menu-header">',
                '<span class="select-menu-title">',
                  '<text>Emoji Collections</text>',
                  '<span class="octicon tooltipped tooltipped-w" aria-label="Change GitHub Custom Emoji Settings">',
                    '<svg class="octicon-gear" viewBox="0 0 16 14" style="height: 16px; width: 14px;"><path d="M14 8.77V7.17l-1.94-0.64-0.45-1.09 0.88-1.84-1.13-1.13-1.81 0.91-1.09-0.45-0.69-1.92H6.17l-0.63 1.94-1.11 0.45-1.84-0.88-1.13 1.13 0.91 1.81-0.45 1.09L0 7.23v1.59l1.94 0.64 0.45 1.09-0.88 1.84 1.13 1.13 1.81-0.91 1.09 0.45 0.69 1.92h1.59l0.63-1.94 1.11-0.45 1.84 0.88 1.13-1.13-0.92-1.81 0.47-1.09 1.92-0.69zM7 11c-1.66 0-3-1.34-3-3s1.34-3 3-3 3 1.34 3 3-1.34 3-3 3z"/></svg>',
                  '</span>',
                  '<span class="octicon tooltipped tooltipped-w ghe-back" aria-label="Go back to see all collections">',
                    '<svg xmlns="http://www.w3.org/2000/svg" width="6.5" height="10" viewBox="0 0 6.5 10"><path d="M5.008 0l1.497 1.504-3.76 3.49 3.743 3.51L4.984 10l-4.99-5.013L5.01 0z"/></svg>',
                  '</span>',
                '</span>',
              '</div>',
              '<div class="js-select-menu-deferred-content ghe-content">',
                '<div class="select-menu-list ghe-all-collections"></div>',
                '<div class="select-menu-list ghe-single-collection"></div>',
              '</div>',
            '</div>',
          '</div>',
          '<div id="ghe-settings">',
            '<div id="ghe-settings-inner" class="boxed-group">',
              '<h3>GitHub Custom Emoji Settings',
              '<svg id="ghe-settings-close" xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="160 160 608 608"><path d="M686.2 286.8L507.7 465.3l178.5 178.5-45 45-178.5-178.5-178.5 178.5-45-45 178.5-178.5-178.5-178.5 45-45 178.5 178.5 178.5-178.5z"/></svg>',
              '</h3>',
              '<div class="boxed-group-inner">',
                '<form>',
                  '<div class="ghe-settings-wrapper">',
                    '<p>',
                      '<label>Insert as Image:',
                        '<sup class="tooltipped tooltipped-e" aria-label="Or Shift + select the emoji">?</sup>',
                        '<input class="ghe-image ghe-checkbox ghe-right" type="checkbox">',
                      '</label>',
                    '</p>',
                    '<p class="checkbox">',
                      '<label>Case Sensitive <input class="ghe-case ghe-checkbox ghe-right" type="checkbox"></label>',
                    '</p>',
                    '<div class="ghe-slider-wrapper">',
                      '<div class="ghe-range-slider">',
                        '<input type="text" class="ghe-height" value="" />',
                      '</div>',
                      '<label>Emoji Height',
                        '<sup class="tooltipped tooltipped-e" aria-label="Set emoji minimum & maximum&#10;height in pixels">?</sup>',
                      '</label>',
                    '</div>',
                    '<div class="ghe-slider-wrapper">',
                      '<div class="ghe-zoom-slider">',
                        '<input class="ghe-zoom ghe-right" type="text">',
                      '</div>',
                      '<label>Emoji Zoom',
                        '<sup class="tooltipped tooltipped-e" aria-label="Set Emoji zoom factor&#10;while actively clicked">?</sup>',
                      '</label>',
                    '</div>',
                    '<p>',
                      '<hr>',
                      '<h3>Sources',
                        '<a href="https://github.com/StylishThemes/GitHub-Custom-Emojis/wiki/Add-Emojis" class="tooltipped tooltipped-e tooltipped-multiline" aria-label="Click to get more details on how to set up an Emoji source JSON file">',
                          '<sup>?</sup>',
                        '</a>',
                      '</h3>',
                      '<div class="ghe-sources"></div>',
                    '</p>',
                  '</div>',
                  '<div class="ghe-footer">',
                    '<div class="btn-group">',
                      '<a href="#" id="ghe-add-source" class="btn btn-sm">Add Source</a>',
                      '<a href="#" id="ghe-refresh-sources" class="btn btn-sm">Refresh Sources</a>&nbsp;',
                    '</div>',
                    '<a href="#" id="ghe-restore" class="btn btn-sm btn-danger tooltipped tooltipped-n ghe-right" aria-label="Default sources are restored;&#10;other source will remain">Restore Defaults</a>',
                  '</div>',
                '</form>',
              '</div>',
            '</div>',
          '</div>',
        '</div>'
      ].join(''));
    },

    // JSON source inputs
    sourceHTML : [
      '<div class="ghe-source">',
        '<input class="ghe-source-input" type="text" value="" placeholder="Add JSON sources only">',
        '<a href="#" class="ghe-remove btn btn-sm btn-danger">',
          '<svg class="ghe-remove-icon" xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="160 160 608 608" fill="currentColor"><path d="M686.2 286.8L507.7 465.3l178.5 178.5-45 45-178.5-178.5-178.5 178.5-45-45 178.5-178.5-178.5-178.5 45-45 178.5 178.5 178.5-178.5z"/></svg>',
        '</a>',
      '</div>'
    ].join(''),

    init : function() {
      debug('GitHub-Emoji Script initializing!');

      // add style tag to head
      this.$style = $('<style class="ghe-style">').appendTo('head');

      this.getStoredValues();
      this.loadEmojiJson();
      this.updateStyleSheet();
      this.isUpdating = true;

      var targets = document.querySelectorAll(this.containers.join(',')),
        // parts = [':_', ':']
        parts = this.vars.emojiTemplate.split('${name}');

      // emojiFilter = /:_([a-z\u00c0-\u00ff0-9_,'.+-]*)$|:_([^\x00-\xff]*)$/gi
      // used by atwho.js autocomplete
      this.regex.emojiFilter = new RegExp(
        parts[0] + '([a-z\u00c0-\u00ff0-9_,\'\.\+\-]*)$|' +
        parts[0] + '([^\\x00-\\xff]*)$', 'gi'
      );

      // used by
      this.regex.nameRegex = new RegExp(
        parts[0].replace(ghe.regex.charsToEsc, '\\$&') +
        '([\\w_]+)' +
        parts[1].replace(ghe.regex.charsToEsc, '\\$&'), 'g' +
        (ghe.settings.caseSensitive ? 'i' : '')
      );

      Array.prototype.forEach.call(targets, function(target) {
        new MutationObserver(function(mutations) {
          mutations.forEach(function(mutation) {
            // preform checks before adding code wrap to minimize function calls
            if (mutation.target === target && !$.isEmptyObject(ghe.collections) &&
              !(ghe.isUpdating || target.querySelector('.ghe-processed'))) {
              ghe.update(target);
            }
          });
        }).observe(target, {
          childList : true,
          subtree : true
        });
      });

      this.addPanels();

      // Add emoji autocomplete & watch for preview rendering
      this.setupPreviews();
      this.addToolbarIcon();
      this.addBindings();
      // update panel values after bindings (rangeslider)
      this.setStoredValues();

      // checkPage clears isUpdating flag
      this.checkPage();
    }
  };

  // add style at document-start
  ghe.init();

  // include a "?debug" anywhere in the browser URL to enable debugging
  function debug() {
    if (/\?debug/.test(window.location.href)) {
      console.log.apply(console, arguments);
    }
  }
})(jQuery.noConflict(true));
