import { db, auth } from "./firebase-config.js";
import { logoutUser } from "./auth.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import {
  collection,
  query,
  where,
  onSnapshot,
  doc,
  getDoc
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

import { initializeDefaultProducts } from "./init-products.js";

let currentUserId = null;
let selectedCategory = "";
let searchQuery = "";
let allProducts = [];
let unsubscribeProducts = null;

onAuthStateChanged(auth, async (user) => {
  const isAuthPage = window.location.pathname.endsWith("login.html") ||
                     window.location.pathname.endsWith("signup.html") ||
                     window.location.pathname.endsWith("index.html");

  if (isAuthPage) return;

  if (!user) {
    window.location.href = "login.html";
    return;
  }

  currentUserId = user.uid;

  // Render Topbar User Info & Profile Picture/Icon
  loadTopbarUserData(user);

  try {
    if (typeof initializeDefaultProducts === "function") {
      await initializeDefaultProducts(currentUserId);
    }
  } catch (seedErr) {
    console.error("Error initializing default products:", seedErr);
  }

  loadProductsRealtime();
});

// Function para sa Topbar Avatar at White Store Name
async function loadTopbarUserData(user) {
  const topbarStoreName = document.getElementById("topbarStoreName");
  const avatarContainer =
    document.getElementById("avatarContainer") ||
    document.getElementById("topbarAvatarContainer");

  if (topbarStoreName) {
    topbarStoreName.style.color = "#ffffff";
    topbarStoreName.style.fontWeight = "700";
  }

  try {
    const userDocRef = doc(db, "users", user.uid);
    const userSnap = await getDoc(userDocRef);

    let storeName = "My Store";
    let profileImg = null;

    if (userSnap.exists()) {
      const data = userSnap.data();
      storeName = data.store_name || data.full_name || "My Store";
      profileImg = data.profile_image || null;
    }

    if (topbarStoreName) {
      topbarStoreName.innerText = storeName;
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
    console.error("Error loading topbar user data:", error);
  }
}

function loadProductsRealtime() {
  const productGrid = document.getElementById("productGrid");

  if (unsubscribeProducts) unsubscribeProducts();

  const q = query(collection(db, "products"), where("userId", "==", currentUserId));

  unsubscribeProducts = onSnapshot(q, (querySnapshot) => {
    allProducts = [];
    querySnapshot.forEach((docSnap) => {
      allProducts.push({ id: docSnap.id, ...docSnap.data() });
    });

    renderProducts();
  }, (error) => {
    console.error("Error fetching products:", error);
    if (productGrid) {
      productGrid.innerHTML = `<p style="color: #ffffff; grid-column: 1 / -1; text-align: center; padding: 40px;">Nagka-error sa pagkuha ng produkto.</p>`;
    }
  });
}

function renderProducts() {
  const productGrid = document.getElementById("productGrid");
  if (!productGrid) return;

  const filtered = allProducts.filter((p) => {
    const matchCategory = !selectedCategory || selectedCategory === "All" || p.category === selectedCategory;
    const matchSearch = !searchQuery ||
      (p.name && p.name.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (p.barcode && p.barcode.includes(searchQuery));
    return matchCategory && matchSearch;
  });

  if (filtered.length === 0) {
    productGrid.innerHTML = `<p style="color: #ffffff; grid-column: 1 / -1; text-align: center; padding: 40px;">Wala pang nahanap na produkto.</p>`;
    return;
  }

  productGrid.innerHTML = filtered.map((p) => {
    const stock = Number(p.stock || 0);

    let imgSource = "uploads/default.jpg";
    if (p.image) {
      if (p.image.startsWith("http") || p.image.startsWith("data:")) {
        imgSource = p.image;
      } else if (p.image.startsWith("uploads/")) {
        imgSource = p.image;
      } else {
        imgSource = `uploads/${p.image}`;
      }
    }

    return `
      <div class="product-card">
        <div>
          <img src="${imgSource}" alt="${p.name || 'Product'}" onerror="this.onerror=null; this.src='https://via.placeholder.com/150?text=SARI';">
        </div>
        <div class="product-info">
          <div class="product-category">${p.category || 'General'}</div>
          <div class="product-title">${p.name || ''}</div>
          <div style="font-size: 0.72rem; color: #64748b; margin-bottom: 4px;">Barcode: ${p.barcode || 'N/A'}</div>
          <div class="product-price">₱${Number(p.price || 0).toFixed(2)}</div>
        </div>
        <div class="product-bottom-row">
          <span style="font-size: 0.75rem; font-weight: 700; color: ${stock > 0 ? '#4a9c62' : '#d1544a'};">
            Stock: ${stock}
          </span>
          ${
            stock === 0
              ? `<span style="font-size: 0.75rem; color: #94a3b8; font-weight: 700;">Out of Stock</span>`
              : ``
          }
        </div>
      </div>
    `;
  }).join("");
}

const searchForm = document.getElementById("searchForm");
if (searchForm) {
  searchForm.addEventListener("submit", (e) => {
    e.preventDefault();
    searchQuery = document.getElementById("searchInput").value.trim();
    renderProducts();
  });
}

const searchInput = document.getElementById("searchInput");
if (searchInput) {
  searchInput.addEventListener("input", (e) => {
    searchQuery = e.target.value.trim();
    renderProducts();
  });
}

document.querySelectorAll(".category-pill").forEach((pill) => {
  pill.addEventListener("click", () => {
    document.querySelectorAll(".category-pill").forEach((p) => p.classList.remove("active"));
    pill.classList.add("active");
    selectedCategory = pill.dataset.category || "";
    renderProducts();
  });
});

const logoutBtn = document.getElementById("logoutBtn");
if (logoutBtn) {
  logoutBtn.addEventListener("click", (e) => {
    e.preventDefault();
    logoutUser();
  });
}