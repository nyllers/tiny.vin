if (window.PayPal) {
  PayPal.Donation.Button({
    env: "production",
    hosted_button_id: "MDJZUR6T8QP3Y",
    image: {
      src: "/donate-button.svg",
      alt: "Donate with PayPal",
      title: "Donate with PayPal",
    },
  }).render("#donate-button");
}
