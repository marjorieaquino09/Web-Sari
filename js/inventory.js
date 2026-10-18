import { db, auth } from "./firebase-config.js";
import { checkAuth, logoutUser } from "./auth.js";
import { 
  collection, 
  query, 
  where, 
  onSnapshot, 
  addDoc, 
  updateDoc,
  deleteDoc, 
  doc, 
  getDoc,
  serverTimestamp 
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

let currentUserId = null;
let allProducts = [];
let searchQuery = "";
let selectedCategory = "";
let editingProductId = null;
let html5QrCode = null;

async function createNotification(title, message, alertType = "inventory") {
  if (!currentUserId) return;
  try {
    await addDoc(collection(db, "notifications"), {
      userId: currentUserId,
      type: "inventory",
      title: title,
      message: message,
      description: message,
      status: title,
      category: alertType,
      isRead: false,
      created_at: serverTimestamp()
    });
  } catch (err) {
    console.error("Error creating notification:", err);
  }
}

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
    console.error("Error fetching store name:", err);
    if (storeNameEl) storeNameEl.innerText = "My Store";
  }

  const stockInput = document.getElementById("addStock");
  if (stockInput && !stockInput.value) {
    stockInput.value = "0";
  }

  loadInventoryRealtime();
});

function loadInventoryRealtime() {
  const q = query(collection(db, "products"), where("userId", "==", currentUserId));

  onSnapshot(q, (querySnapshot) => {
    allProducts = [];
    querySnapshot.forEach((docSnap) => {
      allProducts.push({ id: docSnap.id, ...docSnap.data() });
    });

    updateSummaryCards();
    renderInventoryTable();
  });
}

function updateSummaryCards() {
  let totalProducts = allProducts.length;
  let lowStockCount = 0;
  let outOfStockCount = 0;
  let totalValue = 0;

  allProducts.forEach((p) => {
    const stock = Number(p.stock || 0);
    const price = Number(p.price || 0);

    if (stock === 0) {
      outOfStockCount++;
    } else if (stock <= 5) {
      lowStockCount++;
    }

    totalValue += stock * price;
  });

  const setElemText = (id, text) => {
    const el = document.getElementById(id);
    if (el) el.innerText = text;
  };

  setElemText("statTotalProducts", totalProducts);
  setElemText("statLowStock", lowStockCount);
  setElemText("statOutOfStock", outOfStockCount);
  setElemText("statInventoryValue", `₱${totalValue.toLocaleString('en-US', { minimumFractionDigits: 2 })}`);
}

function renderInventoryTable() {
  const tableBody = document.getElementById("inventoryTableBody");
  if (!tableBody) return;

  const filtered = allProducts.filter((p) => {
    const matchSearch = !searchQuery || 
      (p.name && p.name.toLowerCase().includes(searchQuery.toLowerCase())) || 
      (p.barcode && p.barcode.includes(searchQuery));
    const matchCat = !selectedCategory || p.category === selectedCategory;
    return matchSearch && matchCat;
  });

  if (filtered.length === 0) {
    tableBody.innerHTML = `<tr><td colspan="6" style="text-align:center; padding:30px; color:#94a3b8;">No products found</td></tr>`;
    return;
  }

  tableBody.innerHTML = filtered.map((p) => {
    const stock = Number(p.stock || 0);
    const price = Number(p.price || 0);

    let statusTag = `<span style="background:#dcfce7; color:#15803d; padding:3px 10px; border-radius:12px; font-weight:700; font-size:0.75rem;">In Stock</span>`;
    if (stock === 0) {
      statusTag = `<span style="background:#fee2e2; color:#b91c1c; padding:3px 10px; border-radius:12px; font-weight:700; font-size:0.75rem;">Out of Stock</span>`;
    } else if (stock <= 5) {
      statusTag = `<span style="background:#fef3c7; color:#b45309; padding:3px 10px; border-radius:12px; font-weight:700; font-size:0.75rem;">Low Stock</span>`;
    }

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
      <tr style="border-bottom: 1px solid #f1f5f9;">
        <td style="padding: 10px; display: flex; align-items: center; gap: 10px; font-weight: 700;">
          <img src="${imgSource}" onerror="this.onerror=null; this.src='https://via.placeholder.com/35?text=SARI';" style="width:32px; height:32px; object-fit:cover; border-radius:6px;">
          <div>
            <div>${p.name || ''}</div>
            <div style="font-size: 0.7rem; color: #64748b; font-weight: 400;">Barcode: ${p.barcode || 'N/A'}</div>
          </div>
        </td>
        <td style="padding: 10px; color: #64748b;">${p.category || 'General'}</td>
        <td style="padding: 10px; font-weight: 600;">${stock}</td>
        <td style="padding: 10px; font-weight: 700;">₱${price.toFixed(2)}</td>
        <td style="padding: 10px;">${statusTag}</td>
        <td style="padding: 10px; text-align: center;">
          <button class="edit-btn" data-id="${p.id}" style="background:#e0f2fe; color:#0284c7; border:none; padding:6px 8px; border-radius:6px; cursor:pointer; margin-right: 5px;" title="Edit Product">
            <i class="fa-solid fa-pen"></i>
          </button>
          <button class="delete-btn" data-id="${p.id}" style="background:#fee2e2; color:#ef4444; border:none; padding:6px 8px; border-radius:6px; cursor:pointer;" title="Delete Product">
            <i class="fa-solid fa-trash"></i>
          </button>
        </td>
      </tr>
    `;
  }).join("");

  document.querySelectorAll(".edit-btn").forEach((btn) => {
    btn.addEventListener("click", () => populateEditForm(btn.dataset.id));
  });

  document.querySelectorAll(".delete-btn").forEach((btn) => {
    btn.addEventListener("click", () => deleteProduct(btn.dataset.id));
  });
}

function populateEditForm(id) {
  const product = allProducts.find(p => p.id === id);
  if (!product) return;

  editingProductId = id;

  document.getElementById("addName").value = product.name || "";
  document.getElementById("addCategory").value = product.category || "";
  const barcodeEl = document.getElementById("addBarcode");
  if (barcodeEl) barcodeEl.value = product.barcode || "";
  document.getElementById("addStock").value = product.stock !== undefined ? product.stock : 0;
  document.getElementById("addPrice").value = product.price || 0;

  const btnSave = document.getElementById("btnSaveProduct");
  if (btnSave) {
    btnSave.innerText = "Update Product";
    btnSave.style.background = "#0284c7";
  }
}

const addProductForm = document.getElementById("addProductForm");
if (addProductForm) {
  addProductForm.addEventListener("submit", async (e) => {
    e.preventDefault();

    const name = document.getElementById("addName").value.trim();
    const category = document.getElementById("addCategory").value;
    const barcode = document.getElementById("addBarcode") ? document.getElementById("addBarcode").value.trim() : "";
    const stock = Number(document.getElementById("addStock").value) || 0;
    const price = Number(document.getElementById("addPrice").value) || 0;
    const fileInput = document.getElementById("addImageFile");

    if (!name || !category) return;

    let imageString = "default.jpg";
    const existingProduct = editingProductId ? allProducts.find(p => p.id === editingProductId) : null;
    if (existingProduct && existingProduct.image) {
      imageString = existingProduct.image;
    }

    if (fileInput.files && fileInput.files[0]) {
      const reader = new FileReader();
      reader.onload = async function(evt) {
        imageString = evt.target.result;
        await saveOrUpdateToFirestore(name, category, barcode, stock, price, imageString);
      };
      reader.readAsDataURL(fileInput.files[0]);
    } else {
      await saveOrUpdateToFirestore(name, category, barcode, stock, price, imageString);
    }
  });
}

async function saveOrUpdateToFirestore(name, category, barcode, stock, price, image) {
  const btn = document.getElementById("btnSaveProduct");
  try {
    if (btn) {
      btn.disabled = true;
      btn.innerText = editingProductId ? "Updating..." : "Saving...";
    }

    if (editingProductId) {
      const prodRef = doc(db, "products", editingProductId);
      await updateDoc(prodRef, {
        name: name,
        category: category,
        barcode: barcode || "",
        stock: stock,
        price: price,
        image: image,
        updated_at: serverTimestamp()
      });

      if (stock === 0) {
        await createNotification(
          "Out of Stock",
          `Naubos na ang stock ng ${name} (0 pcs)!`,
          "danger"
        );
      } else if (stock <= 5) {
        await createNotification(
          "Low Stock Alert",
          `Kakaunti na lang ang stock ng ${name} (${stock} pcs remaining).`,
          "warning"
        );
      } else {
        await createNotification(
          "Stock Updated",
          `Na-update ang stock ng ${name} sa ${stock} pcs.`,
          "info"
        );
      }

      alert("Product updated successfully!");
      editingProductId = null;
      if (btn) {
        btn.innerText = "Save Product";
        btn.style.background = "";
      }
    } else {
      await addDoc(collection(db, "products"), {
        userId: currentUserId,
        name: name,
        category: category,
        barcode: barcode || "",
        stock: stock,
        price: price,
        image: image,
        created_at: serverTimestamp()
      });

      if (stock === 0) {
        await createNotification(
          "Out of Stock",
          `Idinagdag ang ${name} ngunit WALANG STOCK (0 pcs)!`,
          "danger"
        );
      } else if (stock <= 5) {
        await createNotification(
          "Low Stock Alert",
          `Idinagdag ang ${name} sa inventory (${stock} pcs - Low Stock).`,
          "warning"
        );
      } else {
        await createNotification(
          "New Product Added",
          `Naidagdag ang ${name} sa inventory (${stock} pcs).`,
          "info"
        );
      }

      alert("Product added successfully!");
    }

    addProductForm.reset();
    const stockInput = document.getElementById("addStock");
    if (stockInput) stockInput.value = "0";

  } catch (err) {
    console.error("Error saving product:", err);
    alert("Failed to save product.");
  } finally {
    if (btn) {
      btn.disabled = false;
      if (!editingProductId) btn.innerText = "Save Product";
    }
  }
}

async function deleteProduct(id) {
  if (confirm("Are you sure you want to delete this product?")) {
    try {
      const targetProd = allProducts.find(p => p.id === id);
      const prodName = targetProd ? targetProd.name : "Produkto";

      await deleteDoc(doc(db, "products", id));

      await createNotification(
        "Binurang Produkto",
        `Tinanggal ang ${prodName} sa iyong inventory.`,
        "warning"
      );
    } catch (err) {
      console.error("Error deleting product:", err);
    }
  }
}

const inventorySearch = document.getElementById("inventorySearch");
if (inventorySearch) {
  inventorySearch.addEventListener("input", (e) => {
    searchQuery = e.target.value.trim();
    renderInventoryTable();
  });
}

const categoryFilter = document.getElementById("categoryFilter");
if (categoryFilter) {
  categoryFilter.addEventListener("change", (e) => {
    selectedCategory = e.target.value;
    renderInventoryTable();
  });
}

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
              const foundProduct = allProducts.find(p => p.barcode === scannedCode);

              if (foundProduct) {
                const inventorySearchInput = document.getElementById("inventorySearch");
                if (inventorySearchInput) {
                  inventorySearchInput.value = scannedCode;
                  searchQuery = scannedCode;
                  renderInventoryTable();
                }
                alert(`Nahanap ang produkto: ${foundProduct.name}`);
              } else {
                const barcodeInput = document.getElementById("addBarcode");
                if (barcodeInput) barcodeInput.value = scannedCode;
                
                const addNameInput = document.getElementById("addName");
                if (addNameInput) addNameInput.focus();

                alert(`Bagong Barcode (${scannedCode})! Ilagay na ang detalye at i-save ang produkto sa kanan.`);
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