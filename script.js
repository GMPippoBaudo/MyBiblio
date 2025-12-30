// --- FIREBASE CONFIGURATION ---
// PASTE YOUR CONFIGURATION HERE (Keep your existing one!)
const firebaseConfig = {
    apiKey: "AIzaSyB_43zHxg9H43UrXYX8CcwYgKjMPpzl1rk",
    authDomain: "mia-libreria.firebaseapp.com",
    projectId: "mia-libreria",
    storageBucket: "mia-libreria.firebasestorage.app",
    messagingSenderId: "349757686044",
    appId: "1:349757686044:web:00f1423d133ae7339afad9"
  };


// Initialize Firebase
if (!firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
}
const auth = firebase.auth();
const db = firebase.firestore();

// Global Variables
let currentUser = null;
let myBooks = [];
let isGuest = false;

// --- LOGIN MANAGEMENT ---

auth.onAuthStateChanged(user => {
    if (user) {
        handleUserLogin(user);
    } else {
        if (!isGuest) {
            document.getElementById('login-overlay').style.display = 'flex';
        }
    }
});

function loginWithGoogle() {
    const provider = new firebase.auth.GoogleAuthProvider();
    auth.signInWithPopup(provider)
        .then((result) => {
            handleUserLogin(result.user);
        }).catch((error) => {
            console.error("Login error:", error);
            alert("Login error: " + error.message);
        });
}

function loginAsGuest() {
    isGuest = true;
    currentUser = null;
    document.getElementById('login-overlay').style.display = 'none';
    document.getElementById('user-display-name').innerText = "Guest Mode (Local)";
    
    // Load from LocalStorage
    myBooks = JSON.parse(localStorage.getItem('myLibrary')) || [];
    renderLibrary();
}

function handleUserLogin(user) {
    currentUser = user;
    isGuest = false;
    document.getElementById('login-overlay').style.display = 'none';
    document.getElementById('user-display-name').innerText = user.displayName;
    
    // Load from Firestore
    loadFromFirebase();
}

function logout() {
    if (isGuest) {
        location.reload();
    } else {
        auth.signOut().then(() => {
            location.reload();
        });
    }
}

// --- DATA MANAGEMENT ---

function loadFromFirebase() {
    const libContainer = document.getElementById('my-library');
    libContainer.innerHTML = '<p class="loading-msg">Syncing with cloud...</p>';

    db.collection('users').doc(currentUser.uid).collection('books').get().then((querySnapshot) => {
        myBooks = [];
        querySnapshot.forEach((doc) => {
            myBooks.push(doc.data());
        });
        myBooks.sort((a, b) => b.id - a.id);
        renderLibrary();
    }).catch((error) => {
        console.error("Load error:", error);
        libContainer.innerHTML = '<p>Error downloading data.</p>';
    });
}

function saveBookData(newBook) {
    if (isGuest) {
        myBooks.unshift(newBook);
        localStorage.setItem('myLibrary', JSON.stringify(myBooks));
        renderLibrary();
    } else {
        db.collection('users').doc(currentUser.uid).collection('books').doc(String(newBook.id)).set(newBook)
            .then(() => {
                myBooks.unshift(newBook);
                renderLibrary();
            })
            .catch((error) => {
                console.error("Save error:", error);
                alert("Error saving to Cloud");
            });
    }
}

function updateBookStatus(id, type) {
    const bookIndex = myBooks.findIndex(b => b.id === id);
    if (bookIndex === -1) return;

    myBooks[bookIndex][type] = !myBooks[bookIndex][type];
    const updatedBook = myBooks[bookIndex];

    if (isGuest) {
        localStorage.setItem('myLibrary', JSON.stringify(myBooks));
        renderLibrary();
    } else {
        db.collection('users').doc(currentUser.uid).collection('books').doc(String(id)).update({
            [type]: updatedBook[type]
        }).then(() => {
            renderLibrary();
        });
    }
}

function removeBookData(id) {
    if (!confirm('Delete this book?')) return;

    if (isGuest) {
        myBooks = myBooks.filter(b => b.id !== id);
        localStorage.setItem('myLibrary', JSON.stringify(myBooks));
        renderLibrary();
    } else {
        db.collection('users').doc(currentUser.uid).collection('books').doc(String(id)).delete()
            .then(() => {
                myBooks = myBooks.filter(b => b.id !== id);
                renderLibrary();
            }).catch((error) => {
                console.error("Delete error:", error);
            });
    }
}

// --- SEARCH & UI ---

async function searchBooks() {
    const query = document.getElementById('search-input').value;
    const resultsContainer = document.getElementById('search-results');
    document.getElementById('search-input').blur();

    if (!query) return;
    resultsContainer.innerHTML = '<p style="text-align:center; width:100%;">Searching...</p>';

    try {
        // Added langRestrict=en for English results preference, remove if you want global
        const response = await fetch(`https://www.googleapis.com/books/v1/volumes?q=${encodeURIComponent(query)}&maxResults=6`);
        const data = await response.json();
        resultsContainer.innerHTML = '';

        if (!data.items) { resultsContainer.innerHTML = '<p style="text-align:center;">No results found.</p>'; return; }

        data.items.forEach(book => {
            const info = book.volumeInfo;
            const thumbnail = info.imageLinks ? info.imageLinks.thumbnail : 'https://via.placeholder.com/128x192?text=No+Cover';
            const safeTitle = info.title.replace(/'/g, "\\'");
            const safeAuthor = (info.authors ? info.authors[0] : 'Unknown Author').replace(/'/g, "\\'");

            const bookEl = document.createElement('div');
            bookEl.className = 'book-card';
            bookEl.innerHTML = `
                <img src="${thumbnail}" alt="Cover">
                <h3>${info.title}</h3>
                <p>${info.authors ? info.authors[0] : 'Unknown'}</p>
                <button class="btn-add" onclick="prepareAddBook('${safeTitle}', '${safeAuthor}', '${thumbnail}')">
                    <i class="fas fa-plus"></i> Add
                </button>
            `;
            resultsContainer.appendChild(bookEl);
        });
    } catch (e) { resultsContainer.innerHTML = '<p>Connection error.</p>'; }
}

function prepareAddBook(title, author, image) {
    const exists = myBooks.some(book => book.title === title);
    if (exists) { alert('Book already in library!'); return; }

    const newBook = {
        id: Date.now(),
        title: title, author: author, image: image,
        owned: false, read: false
    };

    saveBookData(newBook);
    
    const btn = event.target.closest('button');
    btn.innerHTML = '<i class="fas fa-check"></i>';
    btn.style.backgroundColor = '#1dd1a1';
}

function renderLibrary(filterType = 'all') {
    const container = document.getElementById('my-library');
    container.innerHTML = '';

    const activeBtn = document.querySelector('.filters button.active');
    if (activeBtn && filterType === 'all') {
        if(activeBtn.innerText.includes('Owned')) filterType = 'owned';
        if(activeBtn.innerText.includes('Read')) filterType = 'read';
    }

    let filtered = myBooks;
    if (filterType === 'owned') filtered = myBooks.filter(b => b.owned);
    if (filterType === 'read') filtered = myBooks.filter(b => b.read);

    if (filtered.length === 0) {
        container.innerHTML = '<p class="loading-msg" style="width:100%; text-align:center; color:#999;">No books found.</p>';
        return;
    }

    filtered.forEach(book => {
        const div = document.createElement('div');
        div.className = 'book-card';
        div.innerHTML = `
            <button class="btn-delete" onclick="removeBookData(${book.id})"><i class="fas fa-times"></i></button>
            <img src="${book.image}" alt="Cover">
            <div class="card-content">
                <h3>${book.title}</h3>
                <p>${book.author}</p>
                <div class="status-area">
                    <div class="badge ${book.owned ? 'active' : ''}" onclick="updateBookStatus(${book.id}, 'owned')">Owned</div>
                    <div class="badge ${book.read ? 'active' : ''}" onclick="updateBookStatus(${book.id}, 'read')">Read</div>
                </div>
            </div>
        `;
        container.appendChild(div);
    });
}

function filterLibrary(type) {
    document.querySelectorAll('.filters button').forEach(b => b.classList.remove('active'));
    event.target.closest('button').classList.add('active');
    renderLibrary(type);
}

function shareLibrary() {
    let text = "📚 My Book List:\n\n";
    myBooks.forEach(b => text += `- ${b.title}\n`);
    navigator.clipboard.writeText(text).then(() => alert("List copied to clipboard!")).catch(() => alert("Copy failed"));
}