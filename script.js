document.addEventListener('DOMContentLoaded', function () {
  var toggler = document.querySelector('.navbar-toggler');
  var nav = document.getElementById('navbarNav');

  if (toggler && nav) {
    toggler.addEventListener('click', function () {
      var isOpen = nav.classList.toggle('show');
      toggler.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
    });
  }

  document.querySelectorAll('.card-body').forEach(function (body) {
    var text = body.querySelector(':scope > .card-text');
    var buttons = body.querySelectorAll(':scope > a.btn');
    var toggle = null;

    if (text) {
      text.classList.add('card-text-clamp');
      if (text.scrollHeight <= text.clientHeight) {
        text.classList.remove('card-text-clamp');
      } else {
        toggle = document.createElement('button');
        toggle.type = 'button';
        toggle.className = 'card-text-toggle';
        toggle.textContent = 'Show more';
        toggle.setAttribute('aria-expanded', 'false');

        toggle.addEventListener('click', function () {
          var isCollapsed = text.classList.toggle('card-text-clamp');
          toggle.textContent = isCollapsed ? 'Show more' : 'Show less';
          toggle.setAttribute('aria-expanded', isCollapsed ? 'false' : 'true');
        });
      }
    }

    if (!toggle && !buttons.length) return;

    var actions = document.createElement('div');
    actions.className = 'card-actions';

    if (text) {
      text.insertAdjacentElement('afterend', actions);
    } else {
      buttons[0].insertAdjacentElement('beforebegin', actions);
    }

    buttons.forEach(function (button) {
      actions.appendChild(button);
    });
    if (toggle) actions.appendChild(toggle);
  });

  document.querySelectorAll('.project-image').forEach(function (image) {
    image.addEventListener('click', function () {
      if (image.classList.contains('small-image')) {
        image.classList.remove('small-image');
        image.classList.add('expanded-image');
      } else {
        image.classList.remove('expanded-image');
        image.classList.add('small-image');
      }
    });
  });

  var contactForm = document.getElementById('contact-form');
  var contactStatus = document.getElementById('contact-status');
  if (contactForm) {
    contactForm.addEventListener('submit', function (event) {
      event.preventDefault();
      var data = new FormData(contactForm);
      var submitButton = contactForm.querySelector('button[type="submit"]');
      if (submitButton) submitButton.disabled = true;
      if (contactStatus) {
        contactStatus.hidden = false;
        contactStatus.className = 'mt-3 text-muted';
        contactStatus.textContent = 'Sending…';
      }

      fetch(contactForm.action, {
        method: 'POST',
        body: data,
        headers: { Accept: 'application/json' }
      }).then(function (response) {
        if (submitButton) submitButton.disabled = false;
        if (response.ok) {
          contactForm.reset();
          if (contactStatus) {
            contactStatus.className = 'mt-3 text-success';
            contactStatus.textContent = 'Thanks — your message was sent.';
          }
          return;
        }
        return response.json().then(function (body) {
          var errorMessage = 'Sorry, the message could not be sent. Please try again.';
          if (body && body.errors && body.errors.length) {
            errorMessage = body.errors.map(function (err) { return err.message; }).join(' ');
          }
          throw new Error(errorMessage);
        });
      }).catch(function (error) {
        if (submitButton) submitButton.disabled = false;
        if (contactStatus) {
          contactStatus.className = 'mt-3 text-danger';
          contactStatus.textContent = error.message || 'Sorry, the message could not be sent. Please try again.';
        }
      });
    });
  }
});
