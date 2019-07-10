$( function() {
    $( "#datepicker" ).datepicker({
        minDate: new Date
    })
}
);
function calculate(){
    let classifieds = $('input[type=checkbox]').filter((i,e) => {
        return $(e).prop('checked') == true
    }).length
    $('#errmsg').hide()
    $('#success').hide()
    $.ajax({
        method: 'POST',
        url: '/calculate',
        data: JSON.stringify({date: $('#datepicker').val(), "classifieds": classifieds}),
        contentType: "application/json; charset=utf-8"
    }).then((data)=>{
        if(data.error){
            $('#errmsg').html(data.error)
            $('#errmsg').show()
        }else{
            $('#success').html(data.value)
            $('#success').show()
        }
    })
}