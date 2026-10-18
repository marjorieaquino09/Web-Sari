import { db, auth } from "./firebase-config.js";
import { checkAuth, logoutUser } from "./auth.js";
import { 
  collection, 
  query, 
  where, 
  onSnapshot, 
  addDoc, 
  doc, 
  getDoc, 
  serverTimestamp,
  writeBatch
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

let currentUserId = null;
let allProducts = [];
let cart = [];
let selectedCategory = "All";
let searchQuery = "";
let paymentMethod = "Cash";
let html5QrCode = null;

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

  loadProductsRealtime();
});

function loadProductsRealtime() {
  const q = query(collection(db, "products"), where("userId", "==", currentUserId));

  onSnapshot(q, (querySnapshot) => {
    allProducts = [];
    querySnapshot.forEach((docSnap) => {
      allProducts.push({ id: docSnap.id, ...docSnap.data() });
    });

    renderProducts();
  });
}

function renderProducts() {
  const posGrid = document.getElementById("posGrid");
  if (!posGrid) return;

  const filtered = allProducts.filter((p) => {
    let matchCat = true;
    if (selectedCategory && selectedCategory !== "All") {
      const pCat = (p.category || "").toLowerCase();
      const selCat = selectedCategory.toLowerCase();

      if (selCat === "beverages" || selCat === "beverage") {
        matchCat = pCat.includes("beverage");
      } else if (selCat === "snacks" || selCat === "chips" || selCat === "biscuits") {
        matchCat = pCat.includes("snack") || pCat.includes("chip") || pCat.includes("biscuit");
      } else {
        matchCat = pCat === selCat;
      }
    }

    const matchSearch = !searchQuery || (p.name && p.name.toLowerCase().includes(searchQuery.toLowerCase())) || (p.barcode && p.barcode.includes(searchQuery));
    return matchCat && matchSearch;
  });

  if (filtered.length === 0) {
    posGrid.innerHTML = `<p style="grid-column: 1 / -1; color: #ffffff; text-align: center; padding: 20px;">Walang nahanap na produkto.</p>`;
    return;
  }

  posGrid.innerHTML = filtered.map((p) => {
    const stock = Number(p.stock || 0);
    const price = Number(p.price || 0);
    const isAvailable = stock > 0;

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
      <div class="pos-product-card" data-id="${p.id}" style="opacity: ${isAvailable ? '1' : '0.5'}; cursor: ${isAvailable ? 'pointer' : 'not-allowed'}; display: flex; flex-direction: column; align-items: center; text-align: center;">
        <div class="pos-add-btn"><i class="fa-solid fa-plus"></i></div>
        <img src="${imgSource}" onerror="this.onerror=null; this.src='https://via.placeholder.com/50?text=SARI';" style="width: 45px; height: 45px; object-fit: cover; border-radius: 8px; margin-bottom: 6px;">
        <div class="pos-product-name" style="width: 100%; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${p.name || ''}</div>
        <div class="pos-product-price">₱${price.toFixed(2)}</div>
        <div style="font-size: 0.72rem; font-weight: 700; color: ${isAvailable ? '#4a9c62' : '#d1544a'};">
          Stock: ${stock}
        </div>
      </div>
    `;
  }).join("");

  document.querySelectorAll(".pos-product-card").forEach((card) => {
    card.addEventListener("click", () => {
      addToCart(card.dataset.id);
    });
  });
}

function addToCart(productId) {
  const product = allProducts.find((p) => p.id === productId);
  if (!product || Number(product.stock) <= 0) return;

  const existing = cart.find((item) => item.id === productId);

  if (existing) {
    if (existing.quantity < Number(product.stock)) {
      existing.quantity += 1;
    } else {
      alert("Sobra na sa available stock!");
      return;
    }
  } else {
    cart.push({
      id: product.id,
      name: product.name,
      price: Number(product.price || 0),
      quantity: 1,
      stock: Number(product.stock),
      image: product.image || 'default.jpg'
    });
  }

  renderCart();
}

function renderCart() {
  const cartContainer = document.getElementById("cartContainer");
  const subtotalText = document.getElementById("subtotalText");
  const totalText = document.getElementById("totalText");

  if (cart.length === 0) {
    cartContainer.innerHTML = `<p style="text-align:center; color:#9aa9a0; font-size:13px; margin: 20px 0;">Cart is empty</p>`;
    if (subtotalText) subtotalText.innerText = "₱0.00";
    if (totalText) totalText.innerText = "₱0.00";
    return;
  }

  let total = 0;

  cartContainer.innerHTML = cart.map((item, idx) => {
    const itemTotal = item.price * item.quantity;
    total += itemTotal;

    let imgSource = "uploads/default.jpg";
    if (item.image) {
      if (item.image.startsWith("http") || item.image.startsWith("data:")) {
        imgSource = item.image;
      } else if (item.image.startsWith("uploads/")) {
        imgSource = item.image;
      } else {
        imgSource = `uploads/${item.image}`;
      }
    }

    return `
      <div class="pos-cart-item">
        <img src="${imgSource}" onerror="this.onerror=null; this.src='https://via.placeholder.com/34?text=SARI';" class="pos-cart-icon" style="width: 34px; height: 34px; object-fit: cover; border-radius: 50%;">
        <div style="overflow:hidden;">
          <div class="pos-cart-name" style="white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${item.name}</div>
          <div class="pos-cart-unit-price">₱${item.price.toFixed(2)}</div>
        </div>
        <div class="pos-qty-stepper">
          <button class="qty-btn" data-idx="${idx}" data-act="minus">-</button>
          <span>${item.quantity}</span>
          <button class="qty-btn" data-idx="${idx}" data-act="plus">+</button>
        </div>
        <div class="pos-cart-line-price">₱${itemTotal.toFixed(2)}</div>
        <button class="pos-remove-btn" data-idx="${idx}"><i class="fa-solid fa-xmark"></i></button>
      </div>
    `;
  }).join("");

  if (subtotalText) subtotalText.innerText = `₱${total.toFixed(2)}`;
  if (totalText) totalText.innerText = `₱${total.toFixed(2)}`;

  document.querySelectorAll(".qty-btn").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const idx = Number(btn.dataset.idx);
      const act = btn.dataset.act;

      if (act === "plus") {
        if (cart[idx].quantity < cart[idx].stock) {
          cart[idx].quantity += 1;
        } else {
          alert("Sobra na sa magagamit na stock!");
        }
      } else {
        cart[idx].quantity -= 1;
        if (cart[idx].quantity <= 0) cart.splice(idx, 1);
      }
      renderCart();
    });
  });

  document.querySelectorAll(".pos-remove-btn").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const idx = Number(btn.dataset.idx);
      cart.splice(idx, 1);
      renderCart();
    });
  });
}

const payCashBtn = document.getElementById("payCashBtn");
const payCreditBtn = document.getElementById("payCreditBtn");
const creditCustomerDiv = document.getElementById("creditCustomerDiv");

if (payCashBtn && payCreditBtn) {
  payCashBtn.addEventListener("click", () => {
    paymentMethod = "Cash";
    payCashBtn.classList.add("active");
    payCreditBtn.classList.remove("active");
    if (creditCustomerDiv) creditCustomerDiv.style.display = "none";
  });

  payCreditBtn.addEventListener("click", () => {
    paymentMethod = "Credit";
    payCreditBtn.classList.add("active");
    payCashBtn.classList.remove("active");
    if (creditCustomerDiv) creditCustomerDiv.style.display = "block";
  });
}

const completeSaleBtn = document.getElementById("completeSaleBtn");
if (completeSaleBtn) {
  completeSaleBtn.addEventListener("click", async () => {
    if (cart.length === 0) {
      alert("Walang laman ang cart!");
      return;
    }

    const customerInput = document.getElementById("customerNameInput");
    let customerName = customerInput ? customerInput.value.trim() : "";

    if (paymentMethod === "Credit" && !customerName) {
      alert("Pakilagay ang pangalan ng nagkakautang!");
      return;
    }

    try {
      completeSaleBtn.disabled = true;
      completeSaleBtn.innerText = "Processing...";

      const totalAmount = cart.reduce((sum, item) => sum + item.price * item.quantity, 0);

      const txnRef = await addDoc(collection(db, "transactions"), {
        userId: currentUserId,
        items: cart,
        totalAmount: totalAmount,
        paymentMethod: paymentMethod,
        customerName: paymentMethod === "Credit" ? customerName : "Walk-in Customer",
        createdAt: serverTimestamp()
      });

      if (paymentMethod === "Credit") {
        await addDoc(collection(db, "credits"), {
          userId: currentUserId,
          customerName: customerName,
          amount: Number(totalAmount),
          date: new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
          isPaid: false,
          saleId: txnRef.id,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        });
      }

      const batch = writeBatch(db);
      cart.forEach((item) => {
        const prodRef = doc(db, "products", item.id);
        batch.update(prodRef, { stock: Math.max(0, item.stock - item.quantity) });
      });

      await batch.commit();

      alert("Sale completed successfully!");
      cart = [];
      if (customerInput) customerInput.value = "";
      renderCart();

    } catch (err) {
      console.error("Sale Error:", err);
      alert("Nagka-error sa pagpoproseso.");
    } finally {
      completeSaleBtn.disabled = false;
      completeSaleBtn.innerText = "Complete Sale";
    }
  });
}

const clearCartBtn = document.getElementById("clearCartBtn");
if (clearCartBtn) {
  clearCartBtn.addEventListener("click", () => {
    cart = [];
    renderCart();
  });
}

const posSearch = document.getElementById("posSearch");
if (posSearch) {
  posSearch.addEventListener("input", (e) => {
    searchQuery = e.target.value.trim();
    renderProducts();
  });
}

document.querySelectorAll(".pos-category").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".pos-category").forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    selectedCategory = btn.dataset.category || "All";
    renderProducts();
  });
});

const startScanBtn = document.getElementById("startScanBtn");
if (startScanBtn) {
  startScanBtn.addEventListener("click", () => {
    const readerDiv = document.getElementById("reader");
    
    if (readerDiv.style.display === "none" || !readerDiv.style.display) {
      readerDiv.style.display = "block";
      
      Html5Qrcode.getCameras().then(devices => {
        if (devices && devices.length) {
          const cameraId = devices.length > 1 ? devices[1].id : devices[0].id;
          
          const scanConfig = {
            fps: 30,
            qrbox: { width: 320, height: 160 },
            aspectRatio: 1.777778,
            formatsToSupport: [
              Html5QrcodeSupportedFormats.EAN_13,
              Html5QrcodeSupportedFormats.EAN_8,
              Html5QrcodeSupportedFormats.UPC_A,
              Html5QrcodeSupportedFormats.UPC_E,
              Html5QrcodeSupportedFormats.CODE_128,
              Html5QrcodeSupportedFormats.CODE_39
            ],
            experimentalFeatures: {
              useBarCodeDetectorIfSupported: true
            }
          };

          html5QrCode = new Html5Qrcode("reader");
          html5QrCode.start(
            cameraId, 
            scanConfig,
            (decodedText) => {
              const scannedCode = decodedText.trim();
              const foundProduct = allProducts.find(p => p.barcode === scannedCode || (p.name && p.name.toLowerCase().includes(scannedCode.toLowerCase())));

              if (foundProduct) {
                addToCart(foundProduct.id);
                alert(`Na-scan at nai-add sa cart: ${foundProduct.name}`);
              } else {
                alert(`Walang nakitang produkto para sa code na ito: ${scannedCode}`);
              }
              
              html5QrCode.stop().then(() => {
                readerDiv.style.display = "none";
              }).catch(err => console.error("Error stopping scanner:", err));
            },
            (errorMessage) => {}
          ).catch(err => {
            console.error("Hindi ma-access ang camera:", err);
            alert("Hindi ma-access ang camera. Siguraduhing naka-allow ito.");
            readerDiv.style.display = "none";
          });
        } else {
          alert("Walang nakitang camera device.");
          readerDiv.style.display = "none";
        }
      }).catch(err => {
        console.error("Error getting cameras:", err);
        readerDiv.style.display = "none";
      });
    } else {
      if (html5QrCode) {
        html5QrCode.stop().then(() => {
          readerDiv.style.display = "none";
        }).catch(err => console.error(err));
      } else {
        readerDiv.style.display = "none";
      }
    }
  });
}

const logoutBtn = document.getElementById("logoutBtn");
if (logoutBtn) {
  logoutBtn.addEventListener("click", () => {
    logoutUser();
  });
}