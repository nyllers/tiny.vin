function donateButtonImageSrc() {
  var theme = document.documentElement.getAttribute("data-theme");
  return theme === "dark" ? "/donate-button-dark.svg" : "/donate-button-light.svg";
}

if (window.PayPal) {
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

document.querySelectorAll(".theme-toggle .theme-btn").forEach(function (btn) {
  btn.addEventListener("click", function () {
    var img = document.getElementById("donate-button");
    if (img) img.src = donateButtonImageSrc();
  });
});
