import { db } from "./firebase-config.js";
import { checkAuth, logoutUser } from "./auth.js";
import {
  collection,
  query,
  where,
  onSnapshot,
  getDoc,
  doc
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

let currentUserId = null;
let storeName = "My Store";
let allTransactions = [];

checkAuth(async (user) => {
  currentUserId = user.uid;

  const topbarEl = document.getElementById("topbarStoreName") || document.getElementById("topbarUserEmail");
  const avatarContainer = document.getElementById("avatarContainer") || document.getElementById("topbarAvatarContainer");

  if (topbarEl) {
    topbarEl.style.color = "#ffffff";
    topbarEl.style.fontWeight = "700";
    topbarEl.innerText = "Loading...";
  }

  try {
    const userDoc = await getDoc(doc(db, "users", currentUserId));
    let profileImg = null;

    if (userDoc.exists()) {
      const data = userDoc.data();
      storeName = data.store_name || data.full_name || "My Store";
      profileImg = data.profile_image || null;

      if (topbarEl) {
        topbarEl.innerText = storeName;
      }
    } else {
      if (topbarEl) topbarEl.innerText = "My Store";
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
  } catch (error) {
    console.error("Error fetching store info:", error);
    if (topbarEl) topbarEl.innerText = "My Store";
  }

  loadTransactionsRealtime();
});

function loadTransactionsRealtime() {
  const q = query(
    collection(db, "transactions"),
    where("userId", "==", currentUserId)
  );

  onSnapshot(
    q,
    (snapshot) => {
      allTransactions = [];

      snapshot.forEach((docSnap) => {
        allTransactions.push({
          id: docSnap.id,
          ...docSnap.data()
        });
      });

      allTransactions.sort((a, b) => {
        return (
          getTimestampValue(
            b.createdAt || b.created_at
          ) -
          getTimestampValue(
            a.createdAt || a.created_at
          )
        );
      });

      renderTransactions();
    },
    (error) => {
      console.error("Error fetching transactions:", error);
    }
  );
}

function getTimestampValue(value) {
  if (!value) return 0;

  if (typeof value.toMillis === "function") {
    return value.toMillis();
  }

  if (typeof value.toDate === "function") {
    return value.toDate().getTime();
  }

  if (value instanceof Date) {
    return value.getTime();
  }

  if (typeof value === "number") {
    return value;
  }

  const parsed = new Date(value).getTime();

  return Number.isNaN(parsed) ? 0 : parsed;
}

function renderTransactions() {
  let creditSales = 0;
  let cashSales = 0;

  allTransactions.forEach((txn) => {
    const amount = Number(
      txn.totalAmount ||
      txn.total_amount ||
      0
    );

    const method = String(
      txn.paymentMethod ||
      txn.payment_method ||
      "cash"
    ).toLowerCase();

    if (method === "credit") {
      creditSales += amount;
    } else {
      cashSales += amount;
    }
  });

  const setElemText = (id, value) => {
    const element = document.getElementById(id);

    if (element) {
      element.innerText = value;
    }
  };

  setElemText(
    "statCreditSales",
    `₱${creditSales.toLocaleString("en-US", {
      minimumFractionDigits: 2
    })}`
  );

  setElemText(
    "statCashSales",
    `₱${cashSales.toLocaleString("en-US", {
      minimumFractionDigits: 2
    })}`
  );

  setElemText(
    "statTotalTransactions",
    allTransactions.length
  );

  const tbody = document.getElementById(
    "transactionTableBody"
  );

  if (!tbody) return;

  if (allTransactions.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td
          colspan="5"
          style="
            text-align:center;
            color:#7c8b82;
            padding:30px;
          "
        >
          No transactions recorded yet.
        </td>
      </tr>
    `;

    return;
  }

  tbody.innerHTML = allTransactions
    .map((txn, index) => {
      const amount = Number(
        txn.totalAmount ||
        txn.total_amount ||
        0
      );

      const paymentMethod = String(
        txn.paymentMethod ||
        txn.payment_method ||
        "cash"
      ).toLowerCase();

      const isCredit =
        paymentMethod === "credit";

      const pillClass = isCredit
        ? "credit"
        : "cash";

      const customerDisplay =
        txn.customerName ||
        txn.customer_name ||
        "Walk-in Customer";

      const receiptNo = `#T-${String(allTransactions.length - index).padStart(4, "0")}`;

      let dateFormatted = "N/A";

      const rawDate =
        txn.createdAt ||
        txn.created_at;

      if (rawDate) {
        const timestamp =
          getTimestampValue(rawDate);

        if (timestamp > 0) {
          const date = new Date(timestamp);

          dateFormatted =
            date.toLocaleDateString("en-US", {
              month: "short",
              day: "numeric",
              year: "numeric"
            }) +
            " " +
            date.toLocaleTimeString("en-US", {
              hour: "2-digit",
              minute: "2-digit"
            });
        }
      }

      const pillStyle = isCredit
        ? "background:#f3e8ff;color:#7e22ce;"
        : "background:#dcfce7;color:#15803d;";

      return `
        <tr
          style="
            border-bottom:1px solid #f1f5f9;
          "
        >
          <td
            class="receipt-cell"
            style="
              padding:14px 0;
              font-weight:700;
              color:#1e293b;
            "
          >
            ${receiptNo}
          </td>

          <td
            style="
              padding:14px 0;
              color:#334155;
            "
          >
            ${escapeHtml(customerDisplay)}
          </td>

          <td
            class="price-cell"
            style="
              padding:14px 0;
              font-weight:700;
              color:#0f172a;
            "
          >
            ₱${amount.toFixed(2)}
          </td>

          <td style="padding:14px 0;">
            <span
              class="payment-pill ${pillClass}"
              style="
                padding:4px 10px;
                border-radius:20px;
                font-size:.75rem;
                font-weight:700;
                ${pillStyle}
              "
            >
              ${
                paymentMethod.charAt(0).toUpperCase() +
                paymentMethod.slice(1)
              }
            </span>
          </td>

          <td
            class="actions-cell"
            style="
              padding:14px 0;
              text-align:right;
            "
          >
            <button
              type="button"
              class="view-receipt-link"
              data-id="${txn.id}"
              data-receipt="${receiptNo}"
              data-customer="${escapeHtml(customerDisplay)}"
              data-amount="₱${amount.toFixed(2)}"
              data-payment="${
                paymentMethod.charAt(0).toUpperCase() +
                paymentMethod.slice(1)
              }"
              data-date="${dateFormatted}"
              style="
                background:none;
                border:none;
                color:#164a41;
                font-weight:bold;
                cursor:pointer;
              "
            >
              View Receipt
            </button>
          </td>
        </tr>
      `;
    })
    .join("");

  document
    .querySelectorAll(".view-receipt-link")
    .forEach((button) => {
      button.addEventListener("click", () => {
        const setModalText = (id, text) => {
          const element =
            document.getElementById(id);

          if (element) {
            element.innerText = text;
          }
        };

        setModalText(
          "modalReceiptId",
          button.dataset.receipt
        );

        setModalText(
          "modalCustomer",
          button.dataset.customer
        );

        setModalText(
          "modalAmount",
          button.dataset.amount
        );

        setModalText(
          "modalPayment",
          button.dataset.payment
        );

        setModalText(
          "modalDate",
          button.dataset.date
        );

        setModalText(
          "modalStoreName",
          storeName
        );

        const modal =
          document.getElementById(
            "receiptModal"
          );

        if (modal) {
          modal.style.display = "flex";
        }
      });
    });
}

const closeReceiptBtn =
  document.getElementById(
    "closeReceiptBtn"
  );

if (closeReceiptBtn) {
  closeReceiptBtn.addEventListener(
    "click",
    () => {
      const modal =
        document.getElementById(
          "receiptModal"
        );

      if (modal) {
        modal.style.display = "none";
      }
    }
  );
}

const printReceiptBtn =
  document.getElementById(
    "printReceiptBtn"
  );

if (printReceiptBtn) {
  printReceiptBtn.addEventListener(
    "click",
    () => {
      window.print();
    }
  );
}

const exportBtn =
  document.getElementById("exportBtn");

if (exportBtn) {
  exportBtn.addEventListener(
    "click",
    () => {
      alert("Export functionality ready!");
    }
  );
}

const logoutBtn =
  document.getElementById("logoutBtn");

if (logoutBtn) {
  logoutBtn.addEventListener(
    "click",
    logoutUser
  );
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}