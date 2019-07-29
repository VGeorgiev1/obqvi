/* eslint-disable no-undef */
$(function () {
  $('#datepicker').datepicker({
    minDate: new Date()
  });
});
// eslint-disable-next-line no-unused-vars
function calculate () {
  const classifieds = $('input[type=checkbox]').filter((i, e) => {
    return $(e).prop('checked') === true;
  }).length;
  $('#errmsg').hide();
  $('#success').hide();
  $.ajax({
    method: 'POST',
    url: '/calculate',
    data: JSON.stringify({ date: $('#datepicker').val(), classifieds }),
    contentType: 'application/json; charset=utf-8'
  }).then((data) => {
    if (data.error) {
      $('#errmsg').html(data.error);
      $('#errmsg').show();
    } else {
      $('#success').html(data.value);
      $('#success').show();
    }
  });
}
