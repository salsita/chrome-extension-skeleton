// module for manipulating / validating the form shared between options and
// popup views.  when 'Go!' button is pressed, structured info is passed to
// provided callback.
//
// no unit tests for this module, it is jQuery manipulation mostly.
//
import $ from 'jquery';

const form = {};

form.init = (callback) => {
  $(() => {
    // form logic:
    $('#type_bcast, #type_cmd, #type_bg').change(() => {
      const bgSel = $('#type_bg').is(':checked');
      $('#ctx, #tab').prop('disabled', bgSel);
    });

    $('#cmd_echo, #cmd_random').change(() => {
      const echoSel = $('#cmd_echo').is(':checked');
      $('#cmd_echo_text').prop('disabled', !echoSel);
      $('#cmd_random_sync, #cmd_random_async').prop('disabled', echoSel);
    });

    $('#ctx_all, #ctx_select').change(() => {
      const ctxAll = $('#ctx_all').is(':checked');
      $('input[type=checkbox]').prop('disabled', ctxAll);
    });

    $('#tab_all, #tab_same, #tab_provided').change(() => {
      const tabProv = $('#tab_provided').is(':checked');
      $('#tab_provided_text').prop('disabled', !tabProv);
    });

    function validateTabId() {
      const el = $('#tab_provided_text');
      if (el.val() === '') { el.val(1); }
      if (parseInt(el.val(), 10) < 0) { el.val(1); }
    }

    $('#tab_provided_text').blur(validateTabId);

    // button logic:
    $('#submit').click(() => {
      validateTabId();
      if (typeof callback === 'function') {
        const res = {};
        const typeBcast = $('#type_bcast').is(':checked');
        const typeBg = $('#type_bg').is(':checked');
        const cmdEcho = $('#cmd_echo').is(':checked');
        const cmdEchoText = $('#cmd_echo_text').val();
        const cmdRandomSync = $('#cmd_random_sync').is(':checked');
        const ctxAll = $('#ctx_all').is(':checked');
        const ctxSelBg = $('#ctx_select_bg').is(':checked');
        const ctxSelCt = $('#ctx_select_ct').is(':checked');
        const ctxSelDt = $('#ctx_select_dt').is(':checked');
        const ctxSelPopup = $('#ctx_select_popup').is(':checked');
        const ctxSelOptions = $('#ctx_select_options').is(':checked');
        const tabAll = $('#tab_all').is(':checked');
        const tabProvided = $('#tab_provided').is(':checked');
        const tabProvidedVal = parseInt($('#tab_provided_text').val(), 10);
        // command:
        if (cmdEcho) {
          res.cmd = 'echo'; res.arg = cmdEchoText;
        } else if (cmdRandomSync) {
          res.cmd = 'random';
        } else {
          res.cmd = 'randomAsync';
        }
        // type:
        if (typeBg) {
          res.type = 'bg';
        } else {
          if (typeBcast) {
            res.type = 'bcast';
          } else {
            res.type = 'cmd';
          }
          // contexts:
          res.ctx_all = ctxAll;
          if (!ctxAll) {
            const arr = [];
            if (ctxSelBg) { arr.push('bg'); }
            if (ctxSelCt) { arr.push('ct'); }
            if (ctxSelDt) { arr.push('dt'); }
            if (ctxSelPopup) { arr.push('popup'); }
            if (ctxSelOptions) { arr.push('options'); }
            res.ctxs = arr;
          }
          // tab id:
          if (tabAll) {
            res.tab = -1;
          } else if (tabProvided) {
            res.tab = tabProvidedVal;
          } else {
            res.tab = -2;
          } // same id
        }
        callback(res);
      }
      return false;  // stop propagation
    });

    // default values:
    $('#type_bcast, #cmd_random, #cmd_random_sync, #ctx_all, #tab_all').attr('checked', true);
    $('#cmd_echo_text').val('salsita');
    $('#cmd_echo_text').prop('disabled', true);
    $('input[type=checkbox]').prop('checked', true);
    $('input[type=checkbox]').prop('disabled', true);
    $('#tab_provided_text').val(1);
    $('#tab_provided_text').prop('disabled', true);
  });
};

export default form;
