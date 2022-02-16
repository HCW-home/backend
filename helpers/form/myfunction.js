function handleFormSubmit(event) {
    event.preventDefault();
    
    const data = new FormData(event.target);
    
    const formJSON = Object.fromEntries(data.entries());
  
    console.log(JSON.stringify(formJSON))
    const results = document.querySelector('.json_response a');

    $.ajax({
        type: 'POST',
        url: 'form_post.php',
        data: JSON.stringify(formJSON),
        success: function(data){
            console.log(data.invite.doctorURL)

            results.innerText = data.invite.patientURL;
            $('.json_response').show()
            $('.contact-form').hide()
            $('.link').prop("href", data.invite.patientURL);
          },
        error: function(data){
            results.innerText = "Sorry, an error has occured"
            $('.json_response').show()
        },
        contentType: "application/json",
        dataType: 'json'
        }
    );

  }
  
  const form = document.querySelector('.contact-form');
  form.addEventListener('submit', handleFormSubmit);
  