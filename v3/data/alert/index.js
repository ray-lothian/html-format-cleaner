// Retrieve the error message from the URL parameters
const urlParams = new URLSearchParams(window.location.search);
const message = urlParams.get('message');

// Display the error message in the HTML
if (message) {
  document.getElementById('message').textContent = message;
}

onblur = () => chrome.runtime.sendMessage({
  method: 'close'
});
