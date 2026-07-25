const CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

function generateUrl() {
  let code = "";
  for (let i = 0; i < 12; i++) {
    code += CHARS[Math.floor(Math.random() * CHARS.length)];
  }
  document.getElementById("url-output").value = `https://tiny.vin/${code}`;
}

document.getElementById("generate-btn").addEventListener("click", generateUrl);
document.addEventListener("keydown", (event) => {
  if (event.key === "Enter") generateUrl();
});
