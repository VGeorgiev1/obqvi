/* eslint-disable no-undef */
/* eslint-disable no-unused-vars */
function showInput () {
  $('#comment').show();
}
function submitComment () {
  $.ajax({
    method: 'POST',
    url: '/comment/new',
    data: { comment: $('#comment').val(), entity: '#{c.entity_id}' }
  }).then((res) => {
    location.reload();
  });
}
$('#quantity').change((e) => {
  $('#quant').html(`${$('#quantity').val()}`);
});
function buy () {
  $('#errmsg').hide();
  $.ajax({
    method: 'POST',
    url: '/buy/#{c.entity_id}',
    data: { quantity: $('#quantity').val() }
  }).then((res) => {
    if (res.error) {
      $('#errmsg').html(res.error);
      $('#errmsg').show();
    } else {
      location.href = res;
    }
  });
}
