/**
 * Use the [CKEditor](http://ckeditor.com) WYSIWYG input control in Editor
 * to allow easy creation of complex HTML content in Editor.
 *
 * @name CKEditor
 * @summary WYSIWYG editor
 * @requires [CKEditor](http://ckeditor.com)
 *
 * @opt `e-type object` **`opts`**: CKEditor initialisation options object.
 *   Please refer to the CKEditor documentation for the full range of options
 *   available.
 * 
 * @example
 *     
 * new $.fn.dataTable.Editor( {
 *   "ajax": "php/customers.php",
 *   "table": "#example",
 *   "fields": [ {
 *       "label": "Info:",
 *       "name": "info",
 *       "type": "ckeditor"
 *     }, 
 *     // additional fields...
 *   ]
 * } );
 */

(function( factory ){
    if ( typeof define === 'function' && define.amd ) {
        // AMD
        define( ['jquery', 'datatables', 'datatables-editor'], factory );
    }
    else if ( typeof exports === 'object' ) {
        // Node / CommonJS
        module.exports = function ($, dt) {
            if ( ! $ ) { $ = require('jquery'); }
            factory( $, dt || $.fn.dataTable || require('datatables') );
        };
    }
    else if ( jQuery ) {
        // Browser standard
        factory( jQuery, jQuery.fn.dataTable );
    }
}(function( $, DataTable ) {
'use strict';


if ( ! DataTable.ext.editorFields ) {
    DataTable.ext.editorFields = {};
}

var _fieldTypes = DataTable.Editor ?
    DataTable.Editor.fieldTypes :
    DataTable.ext.editorFields;


_fieldTypes.ckeditor = {
    create: function ( conf ) {
        var that = this;
        var id = DataTable.Editor.safeId( conf.id );

        conf._input = $('<div><textarea id="'+id+'"></textarea></div>');

        // CKEditor needs to be initialised on each open call
        this.on( 'open.ckEditInit-'+id, function () {
            if ( $('#'+id).length ) {
                conf._editor = CKEDITOR.replace( id, conf.opts );
                conf._editor.on( 'instanceReady', function () {
                    // If shown in a bubble, there is a good chance we'll need to
                    // move it once CKEditor is shown, since it is large!
                    if ( conf._input.parents('div.DTE_Bubble').length ) {
                        that.bubblePosition();
                    }
                } );

                if ( conf._initSetVal ) {
                    conf._editor.setData( conf._initSetVal );
                    conf._initSetVal = null;
                }
                else {
                    conf._editor.setData( '' );
                }
            }
        } );

        // And destroyed on each close, so it can be re-initialised on reopen
        this.on( 'preClose.ckEditInit-'+id, function () {
            if ( conf._editor ) {
                conf._editor.destroy();
                conf._editor = null;
            }
        } );

        return conf._input;
    },

    get: function ( conf ) {
        if ( ! conf._editor ) {
            return conf._initSetVal;
        }

        return conf._editor.getData();
    },

    set: function ( conf, val ) {
        var id = DataTable.Editor.safeId( conf.id );

        // If not ready, then store the value to use when the onOpen event fires
        if ( ! conf._editor || ! $('#'+id).length ) {
            conf._initSetVal = val;
            return;
        }
        conf._editor.setData( val );
    },

    enable: function ( conf ) {}, // not supported in CKEditor

    disable: function ( conf ) {}, // not supported in CKEditor

    destroy: function ( conf ) {
        var id = DataTable.Editor.safeId( conf.id );

        this.off( 'open.ckEditInit-'+id );
        this.off( 'preClose.ckEditInit-'+id );
    }
};


}));
