/* eslint-disable no-undef */
$('.shipment').each((key, btn) => {
  $(btn).click(function (e) {
    $('#errmsg').hide();
    $('#success').hide();
    $.ajax({
      method: 'POST',
      url: '/ship',
      data: { payment_id: $(this).val() }
    })
      .then((res) => {
        if (res.error) {
          $('#errmsg').html(res.error);
          $('#errmsg').show();
        } else {
          $('#success').html(res);
          $('#success').show();
          $(btn).remove();
        }
      });
  });
});
