function createIdentityRow(identity) {
  const tr = document.createElement("tr");

  const statusEl = document.createElement("div");
  statusEl.className = "admin-row-status";

  const emailText = document.createElement("div");
  emailText.textContent = identity.email;

  const emailTd = document.createElement("td");
  emailTd.append(statusEl, emailText);

  const roleSelect = document.createElement("select");
  roleSelect.className = "admin-input";
  for (const value of ["user", "admin"]) {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = value;
    option.selected = identity.role === value;
    roleSelect.append(option);
  }
  const roleTd = document.createElement("td");
  roleTd.append(roleSelect);

  const urlCountTd = document.createElement("td");
  urlCountTd.textContent = identity.url_count;

  const emailCountTd = document.createElement("td");
  emailCountTd.textContent = identity.email_count;

  const maxResourcesInput = document.createElement("input");
  maxResourcesInput.type = "number";
  maxResourcesInput.min = "0";
  maxResourcesInput.className = "admin-input";
  maxResourcesInput.value = identity.max_resources;
  const maxResourcesTd = document.createElement("td");
  maxResourcesTd.append(maxResourcesInput);

  const minLengthInput = document.createElement("input");
  minLengthInput.type = "number";
  minLengthInput.min = "1";
  minLengthInput.className = "admin-input";
  minLengthInput.value = identity.min_custom_path_length;
  const minLengthTd = document.createElement("td");
  minLengthTd.append(minLengthInput);

  const saveBtn = document.createElement("button");
  saveBtn.type = "button";
  saveBtn.className = "icon-btn save-btn";
  saveBtn.innerHTML = "<span>Save</span>";

  saveBtn.addEventListener("click", async () => {
    saveBtn.disabled = true;
    statusEl.textContent = "";
    statusEl.classList.remove("admin-row-status--error");

    try {
      const response = await fetch(`/api/admin/identities/${identity.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          role: roleSelect.value,
          max_resources: Number(maxResourcesInput.value),
          min_custom_path_length: Number(minLengthInput.value),
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        statusEl.textContent = data.error || "Something went wrong.";
        statusEl.classList.add("admin-row-status--error");
        return;
      }

      statusEl.textContent = "Saved";
      setTimeout(() => {
        statusEl.textContent = "";
      }, 1500);
    } catch {
      statusEl.textContent = "Network error, try again.";
      statusEl.classList.add("admin-row-status--error");
    } finally {
      saveBtn.disabled = false;
    }
  });

  const actionsTd = document.createElement("td");
  actionsTd.append(saveBtn);

  tr.append(emailTd, roleTd, urlCountTd, emailCountTd, maxResourcesTd, minLengthTd, actionsTd);
  return tr;
}

async function loadIdentities() {
  const tbody = document.getElementById("admin-table-body");
  const data = await fetchJsonOrNull("/api/admin/identities");
  if (!data) return;

  tbody.textContent = "";
  for (const identity of data.identities) {
    tbody.append(createIdentityRow(identity));
  }
}

loadIdentities();
