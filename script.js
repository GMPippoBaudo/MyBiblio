// --- FIREBASE CONFIGURATION ---
// ⚠️ PASTE YOUR CONFIGURATION HERE AGAIN!
const firebaseConfig = {
    apiKey: "AIzaSyB_43zHxg9H43UrXYX8CcwYgKjMPpzl1rk",
    authDomain: "mia-libreria.firebaseapp.com",
    projectId: "mia-libreria",
    storageBucket: "mia-libreria.firebasestorage.app",
    messagingSenderId: "349757686044",
    appId: "1:349757686044:web:00f1423d133ae7339afad9"
  };


if (!firebase.apps.length) firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();

// Global Variables
let currentUser = null;
let myBooks = [];
let isGuest = false;
let currentDetailId = null;
let tempRating = 0;
let currentSort = 'newest'; // NEW: Variable to track sort preference

// --- LOGIN ---
auth.onAuthStateChanged(user => {
    if (user) handleUserLogin(user);
    else if (!isGuest) document.getElementById('login-overlay').style.display = 'flex';
});

function loginWithGoogle() {
    const provider = new firebase.auth.GoogleAuthProvider();
    auth.signInWithPopup(provider).then((r) => handleUserLogin(r.user)).catch(e => alert(e.message));
}
function loginAsGuest() {
    isGuest = true; currentUser = null;
    document.getElementById('login-overlay').style.display = 'none';
    document.getElementById('user-display-name').innerText = "Guest Mode";
    myBooks = JSON.parse(localStorage.getItem('myLibrary')) || [];
    renderLibrary();
}
function handleUserLogin(user) {
    currentUser = user; isGuest = false;
    document.getElementById('login-overlay').style.display = 'none';
    document.getElementById('user-display-name').innerText = user.displayName;
    loadFromFirebase();
}
function logout() {
    (isGuest) ? location.reload() : auth.signOut().then(() => location.reload());
}
function scrollToLibrary() {
    const s = document.getElementById('my-collection');
    if (s) window.scrollTo({ top: s.getBoundingClientRect().top + window.scrollY - 100, behavior: 'smooth' });
}

// --- BOOK DETAIL FUNCTIONS ---

function openBookDetails(id) {
    const book = myBooks.find(b => b.id === id);
    if (!book) return;

    currentDetailId = id;
    tempRating = book.rating || 0;

    document.getElementById('detail-img').src = book.image;
    document.getElementById('detail-title').innerText = book.title;
    document.getElementById('detail-author').innerText = book.author;
    document.getElementById('detail-year').innerText = "Published: " + (book.year || "Unknown");
    document.getElementById('detail-notes').value = book.notes || "";

    updateStarVisuals(tempRating);

    const overlay = document.getElementById('detail-overlay');
    overlay.style.display = 'flex'; 
}

function closeBookDetails() {
    const overlay = document.getElementById('detail-overlay');
    overlay.style.display = 'none';
    currentDetailId = null;
}

function setRating(n) {
    tempRating = n;
    updateStarVisuals(n);
}

function updateStarVisuals(n) {
    const stars = document.querySelectorAll('#star-container i');
    stars.forEach((star, index) => {
        if (index < n) {
            star.classList.remove('far'); 
            star.classList.add('fas');    
            star.classList.add('gold');
        } else {
            star.classList.remove('fas');
            star.classList.add('far');
            star.classList.remove('gold');
        }
    });
}

function saveBookDetails() {
    if (!currentDetailId) return;
    
    const notes = document.getElementById('detail-notes').value;
    const bookIndex = myBooks.findIndex(b => b.id === currentDetailId);
    
    if (bookIndex !== -1) {
        myBooks[bookIndex].rating = tempRating;
        myBooks[bookIndex].notes = notes;
        
        if (isGuest) {
            localStorage.setItem('myLibrary', JSON.stringify(myBooks));
            closeBookDetails();
            renderLibrary(); 
        } else {
            db.collection('users').doc(currentUser.uid).collection('books').doc(String(currentDetailId))
              .update({ rating: tempRating, notes: notes })
              .then(() => {
                  closeBookDetails();
                  renderLibrary();
              })
              .catch(e => alert("Error saving: " + e.message));
        }
    }
}

// --- DATA MANAGEMENT ---

function loadFromFirebase() {
    const c = document.getElementById('my-library');
    c.innerHTML = '<p class="loading-msg">Syncing...</p>';
    db.collection('users').doc(currentUser.uid).collection('books').get().then((snap) => {
        myBooks = [];
        snap.forEach((doc) => myBooks.push(doc.data()));
        renderLibrary(); // Render handles sorting
    }).catch(e => c.innerHTML = '<p>Error.</p>');
}

function saveBookData(newBook) {
    if (isGuest) {
        myBooks.unshift(newBook);
        localStorage.setItem('myLibrary', JSON.stringify(myBooks));
        renderLibrary();
    } else {
        db.collection('users').doc(currentUser.uid).collection('books').doc(String(newBook.id)).set(newBook)
            .then(() => { myBooks.unshift(newBook); renderLibrary(); })
            .catch(e => alert("Cloud Error"));
    }
}

function updateBookStatus(id, type) {
    const idx = myBooks.findIndex(b => b.id === id);
    if (idx === -1) return;
    myBooks[idx][type] = !myBooks[idx][type];
    if (type === 'read' && myBooks[idx].read) myBooks[idx].reading = false;
    
    if (isGuest) { localStorage.setItem('myLibrary', JSON.stringify(myBooks)); renderLibrary(); }
    else { db.collection('users').doc(currentUser.uid).collection('books').doc(String(id)).set(myBooks[idx]).then(() => renderLibrary()); }
}

function removeBookData(id) {
    if (!confirm('Delete?')) return;
    if (isGuest) {
        myBooks = myBooks.filter(b => b.id !== id);
        localStorage.setItem('myLibrary', JSON.stringify(myBooks)); renderLibrary();
    } else {
        db.collection('users').doc(currentUser.uid).collection('books').doc(String(id)).delete()
        .then(() => { myBooks = myBooks.filter(b => b.id !== id); renderLibrary(); });
    }
}

// --- SEARCH & RENDER ---

async function searchBooks() {
    const q = document.getElementById('search-input').value;
    const res = document.getElementById('search-results');
    document.getElementById('search-input').blur();
    if (!q) return;
    res.innerHTML = '<p style="text-align:center;">Searching...</p>';
    try {
        const r = await fetch(`https://www.googleapis.com/books/v1/volumes?q=${encodeURIComponent(q)}&maxResults=6&langRestrict=en`);
        const d = await r.json();
        res.innerHTML = '';
        if (!d.items) { res.innerHTML = '<p>No results.</p>'; return; }
        
        d.items.forEach(book => {
            const i = book.volumeInfo;
            const img = i.imageLinks ? i.imageLinks.thumbnail : 'https://via.placeholder.com/128x192?text=No+Cover';
            const safeTitle = i.title.replace(/'/g, "\\'");
            const safeAuthor = (i.authors ? i.authors[0] : 'Unknown').replace(/'/g, "\\'");
            const year = i.publishedDate ? i.publishedDate.substring(0, 4) : 'N/A';

            const el = document.createElement('div');
            el.className = 'book-card';
            el.innerHTML = `
                <img src="${img}" alt="Cover">
                <h3>${i.title}</h3>
                <p>${i.authors ? i.authors[0] : 'Unknown'}</p>
                <button class="btn-add" onclick="prepareAddBook('${safeTitle}', '${safeAuthor}', '${img}', '${year}')">
                    <i class="fas fa-plus"></i> Add
                </button>
            `;
            res.appendChild(el);
        });
    } catch (e) { res.innerHTML = '<p>Error.</p>'; }
}

function prepareAddBook(title, author, image, year) {
    if (myBooks.some(b => b.title === title)) { alert('Already added!'); return; }
    const newBook = {
        id: Date.now(),
        title: title, author: author, image: image, year: year,
        owned: false, read: false, reading: false,
        rating: 0, notes: "" 
    };
    saveBookData(newBook);
    const btn = event.target.closest('button');
    btn.innerHTML = '<i class="fas fa-check"></i>'; btn.style.backgroundColor = '#1dd1a1';
}

// NEW SORT FUNCTION
function changeSort() {
    currentSort = document.getElementById('sort-select').value;
    renderLibrary();
}

function renderLibrary(filter = 'all') {
    const c = document.getElementById('my-library');
    c.innerHTML = '';
    const ab = document.querySelector('.filters button.active');
    if (ab && filter === 'all') {
        const t = ab.innerText.toLowerCase();
        if(t.includes('reading')) filter = 'reading';
        else if(t.includes('read')) filter = 'read';
        else if(t.includes('owned')) filter = 'owned';
    }
    
    // Create a COPY of the array to filter and sort
    let fBooks = myBooks.slice();

    if (filter === 'owned') fBooks = fBooks.filter(b => b.owned);
    if (filter === 'read') fBooks = fBooks.filter(b => b.read);
    if (filter === 'reading') fBooks = fBooks.filter(b => b.reading);

    // --- SORT LOGIC ---
    if (currentSort === 'title') {
        fBooks.sort((a, b) => a.title.localeCompare(b.title));
    } else if (currentSort === 'author') {
        fBooks.sort((a, b) => a.author.localeCompare(b.author));
    } else {
        // Default: Newest first (ID is timestamp)
        fBooks.sort((a, b) => b.id - a.id);
    }

    if (fBooks.length === 0) { c.innerHTML = '<p class="loading-msg" style="width:100%;text-align:center;color:#999;">No books.</p>'; return; }

    fBooks.forEach(book => {
        const el = document.createElement('div');
        el.className = 'book-card';
        el.innerHTML = `
            <button class="btn-delete" onclick="removeBookData(${book.id})"><i class="fas fa-times"></i></button>
            <img src="${book.image}" alt="Cover" onclick="openBookDetails(${book.id})">
            <div class="card-content">
                <h3 onclick="openBookDetails(${book.id})" style="cursor:pointer">${book.title}</h3>
                <p>${book.author}</p>
                <div class="status-area">
                    <div class="badge ${book.owned ? 'active' : ''}" onclick="updateBookStatus(${book.id}, 'owned')">Owned</div>
                    <div class="badge reading-badge ${book.reading ? 'active' : ''}" onclick="updateBookStatus(${book.id}, 'reading')">Reading</div>
                    <div class="badge ${book.read ? 'active' : ''}" onclick="updateBookStatus(${book.id}, 'read')">Read</div>
                </div>
            </div>
        `;
        c.appendChild(el);
    });
}

function filterLibrary(type) {
    document.querySelectorAll('.filters button').forEach(b => b.classList.remove('active'));
    event.target.closest('button').classList.add('active');
    renderLibrary(type);
}