function donateButtonImageSrc() {
  var theme = document.documentElement.getAttribute("data-theme");
  return theme === "dark" ? "/donate-button-dark.svg" : "/donate-button-light.svg";
}

function renderDonateButton() {
  if (!window.PayPal) return;
  var container = document.getElementById("donate-button-container");
  if (!container) return;
  container.innerHTML = '<div id="donate-button"></div>';
  PayPal.Donation.Button({
    env: "production",
    hosted_button_id: "MDJZUR6T8QP3Y",
    image: {
      src: donateButtonImageSrc(),
      alt: "Donate with PayPal",
      title: "Donate with PayPal",
    },
  }).render("#donate-button");
}

renderDonateButton();

document.querySelectorAll(".theme-toggle .theme-btn").forEach(function (btn) {
  btn.addEventListener("click", renderDonateButton);
});
