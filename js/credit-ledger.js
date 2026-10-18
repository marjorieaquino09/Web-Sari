import { db, auth } from "./firebase-config.js";
import { checkAuth, logoutUser } from "./auth.js";
import { 
  collection, 
  query, 
  where, 
  getDocs, 
  getDoc,
  doc, 
  updateDoc,
  addDoc,
  serverTimestamp 
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

let currentUserId = null;
let allCredits = [];

checkAuth(async (user) => {
  currentUserId = user.uid;

  const storeNameEl = document.getElementById("topbarStoreName") || document.getElementById("topbarUserEmail");
  const avatarContainer = document.getElementById("avatarContainer") || document.getElementById("topbarAvatarContainer");

  if (storeNameEl) {
    storeNameEl.style.color = "#ffffff";
    storeNameEl.style.fontWeight = "700";
    storeNameEl.innerText = "Loading...";
  }

  try {
    const userDoc = await getDoc(doc(db, "users", currentUserId));
    let profileImg = null;

    if (userDoc.exists()) {
      const uData = userDoc.data();
      if (storeNameEl) {
        storeNameEl.innerText = uData.store_name || uData.full_name || "My Store";
      }
      profileImg = uData.profile_image || null;
    } else {
      if (storeNameEl) storeNameEl.innerText = "My Store";
    }

    if (avatarContainer) {
      if (profileImg) {
        avatarContainer.style.backgroundImage = `url("${profileImg}")`;
        avatarContainer.style.backgroundSize = "cover";
        avatarContainer.style.backgroundPosition = "center";
        avatarContainer.innerHTML = "";
      } else {
        avatarContainer.style.backgroundImage = "";
        avatarContainer.style.backgroundColor = "#ffffff";
        avatarContainer.style.color = "#1b382b";
        avatarContainer.style.display = "flex";
        avatarContainer.style.alignItems = "center";
        avatarContainer.style.justifyContent = "center";
        avatarContainer.style.borderRadius = "50%";
        avatarContainer.style.width = "32px";
        avatarContainer.style.height = "32px";
        avatarContainer.innerHTML = `<i class="fa-solid fa-user"></i>`;
      }
    }
  } catch (err) {
    console.error("Error fetching profile:", err);
    if (storeNameEl) storeNameEl.innerText = "My Store";
  }

  loadCreditLedger();
});

async function loadCreditLedger() {
  try {
    const credQuery = query(collection(db, "credits"), where("userId", "==", currentUserId));
    const credSnap = await getDocs(credQuery);

    allCredits = [];
    credSnap.forEach((docSnap) => {
      allCredits.push({ id: docSnap.id, ...docSnap.data() });
    });

    const now = new Date();
    const firstDayOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    const txQuery = query(
      collection(db, "transactions"),
      where("userId", "==", currentUserId),
      where("payment_method", "==", "Cash")
    );
    const txSnap = await getDocs(txQuery);

    let collectedThisMonth = 0;
    txSnap.forEach((docSnap) => {
      const data = docSnap.data();
      if (data.created_at) {
        const txDate = data.created_at.toDate();
        if (txDate >= firstDayOfMonth) {
          collectedThisMonth += Number(data.total_amount || 0);
        }
      }
    });

    const collectedEl = document.getElementById("statCollectedThisMonth");
    if (collectedEl) {
      collectedEl.innerText = `₱${collectedThisMonth.toLocaleString('en-US', { minimumFractionDigits: 2 })}`;
    }

    renderLedger();
  } catch (error) {
    console.error("Error loading credits ledger:", error);
  }
}

function renderLedger() {
  const searchInput = document.getElementById("searchCustomerInput");
  const search = searchInput ? searchInput.value.trim().toLowerCase() : "";

  const filtered = allCredits.filter((c) => {
    return !search || (c.customerName && c.customerName.toLowerCase().includes(search));
  });

  let totalOwed = 0;
  let overdueCount = 0;
  let uniqueCustomers = new Set();

  filtered.forEach((c) => {
    if (c.customerName) uniqueCustomers.add(c.customerName);
    if (!c.isPaid) {
      totalOwed += Number(c.amount || 0);
    }
  });

  const setElemText = (id, text) => {
    const el = document.getElementById(id);
    if (el) el.innerText = text;
  };

  setElemText("statTotalOwed", `₱${totalOwed.toLocaleString('en-US', { minimumFractionDigits: 2 })}`);
  setElemText("statCustomerCount", uniqueCustomers.size);
  setElemText("statOverdueCount", overdueCount);

  const tbody = document.getElementById("ledgerTableBody");
  if (!tbody) return;

  if (filtered.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="7" style="text-align: center; color: #7c8b82; padding: 24px;">No customer credit records found.</td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = filtered.map((cred) => {
    const initials = (cred.customerName || "CU").substring(0, 2).toUpperCase();
    const amount = Number(cred.amount || 0);
    const isPaid = cred.isPaid === true;
    const hasDebt = !isPaid && amount > 0;

    const statusPill = isPaid
      ? `<span class="status-pill in-stock" style="background:#dcfce7; color:#15803d; padding:3px 10px; border-radius:12px; font-weight:700; font-size:0.75rem;">Paid</span>`
      : `<span class="status-pill out-of-stock" style="background:#fee2e2; color:#b91c1c; padding:3px 10px; border-radius:12px; font-weight:700; font-size:0.75rem;">Unpaid</span>`;

    const actionBtn = hasDebt
      ? `<button type="button" class="action-btn btn-mark-paid" data-id="${cred.id}" data-name="${cred.customerName}" data-amount="${amount}" style="background: #4a9c62; color: #fff; border: none; padding: 6px 10px; border-radius: 6px; cursor: pointer; font-size: 11px; font-weight: bold;">
          <i class="fa-solid fa-check"></i> Paid
        </button>`
      : `<span style="color: #9aa9a0; font-size: 12px; font-style: italic;">Settled</span>`;

    return `
      <tr style="border-bottom: 1px solid #f1f5f9;">
        <td style="padding: 10px;">
          <div class="product-cell" style="display: flex; align-items: center; gap: 10px; font-weight: 700;">
            <span class="avatar-dot" style="background:#4a9c62; color:#fff; width:28px; height:28px; border-radius:50%; display:flex; align-items:center; justify-content:center; font-size:11px;">${initials}</span> 
            ${cred.customerName || ''}
          </div>
        </td>
        <td style="padding: 10px; color: #64748b;">${cred.date || 'N/A'}</td>
        <td style="padding: 10px; font-weight: 700;" class="price-cell">₱${amount.toFixed(2)}</td>
        <td style="padding: 10px;" class="price-cell">₱2,000.00</td>
        <td style="padding: 10px; color: #64748b;">${cred.date || 'N/A'}</td>
        <td style="padding: 10px;">${statusPill}</td>
        <td style="padding: 10px; text-align: center;" class="actions-cell">${actionBtn}</td>
      </tr>
    `;
  }).join("");

  document.querySelectorAll(".btn-mark-paid").forEach((btn) => {
    btn.addEventListener("click", () => {
      markPaid(btn.dataset.id, btn.dataset.name, Number(btn.dataset.amount));
    });
  });
}

async function markPaid(creditId, customerName, paidAmount) {
  if (confirm(`Mark credit for ${customerName} as fully paid?`)) {
    try {
      const credRef = doc(db, "credits", creditId);
      await updateDoc(credRef, {
        isPaid: true,
        updatedAt: serverTimestamp()
      });

      await addDoc(collection(db, "transactions"), {
        userId: currentUserId,
        payment_method: "Cash",
        customer_name: customerName,
        total_amount: paidAmount,
        created_at: serverTimestamp()
      });

      alert("Payment successful!");
      loadCreditLedger();
    } catch (error) {
      console.error("Error updating payment:", error);
      alert("Failed to process payment: " + error.message);
    }
  }
}

const searchInputEl = document.getElementById("searchCustomerInput");
if (searchInputEl) {
  searchInputEl.addEventListener("input", renderLedger);
}

const logoutBtnEl = document.getElementById("logoutBtn");
if (logoutBtnEl) {
  logoutBtnEl.addEventListener("click", logoutUser);
}